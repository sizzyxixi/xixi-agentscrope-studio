import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from service.capabilities import ConsoleCapabilities
from service.runtime import AgentScopeRuntime, ApprovalDecision, ModelSettings
from service.store import StudioStore


class AgentScopePolicyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = StudioStore(self.root / 'state.db', self.root)
        self.cap = ConsoleCapabilities(self.store)
        self.user, self.token = self.store.create_user('policyuser', 'testing123')
        self.other, _ = self.store.create_user('policyother', 'testing123')
        self.skills = [self.cap.save(self.user.id, {'kind': 'skill', 'name': f'skill-{i}', 'content': f'purpose-{i}'}) for i in range(6)]
        self.mcps = [self.cap.save(self.user.id, {'kind': 'mcp', 'name': f'mcp-{i}', 'config': {'url': f'https://example.com/mcp/{i}'}}) for i in range(6)]
        self.agent = self.cap.save(self.user.id, {'kind': 'agent', 'name': 'scoped', 'content': 'Work on user tasks.', 'config': {
            'skill_ids': [s['id'] for s in self.skills[:5]], 'mcp_ids': [m['id'] for m in self.mcps[:5]],
            'tool_ids': ['read_file', 'create_file', 'convert_file', 'package_files', 'search_documents', 'save_memory', 'workspace_write_plan']}})
        self.cap.set_chat_agent(self.user.id, 'chat', self.agent['id'])
        self.runtime = AgentScopeRuntime(self.store)
        self.runtime.capabilities = self.cap

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    def test_configuration_unlimited_but_explicit_round_selection_limited(self):
        self.assertEqual(len(self.agent['config']['skill_ids']), 5)
        self.assertEqual(len(self.agent['config']['mcp_ids']), 5)
        self.assertEqual(len(self.agent['config']['tool_ids']), 7)
        self.cap.set_chat_resources(self.user.id, 'chat', [s['id'] for s in self.skills[:3]], [m['id'] for m in self.mcps[:3]])
        scope = self.cap.session_config(self.user.id, 'chat')
        self.assertEqual(len(self.cap.bound_resource_ids(scope, 'skill_ids')), 5)
        for key, items in [('skill_ids', self.skills), ('mcp_ids', self.mcps)]:
            with self.assertRaises(ValueError):
                self.cap.validate_turn_resources(self.user.id, 'chat', [s['id'] for s in items[:4]], key)
            with self.assertRaises(ValueError):
                self.cap.validate_turn_resources(self.user.id, 'chat', [items[-1]['id']], key)
        with self.assertRaises(ValueError):
            self.cap.read_skill(self.user.id, self.skills[-1]['id'], session_id='chat')

    def test_options_catalog_and_calls_do_not_leak_other_accounts_or_unbound_skills(self):
        foreign = self.cap.save(self.other.id, {'kind': 'skill', 'name': 'private', 'content': 'private data'})
        options = self.cap.chat_resource_options(self.user.id, self.agent['id'], 'chat')
        self.assertEqual({s['id'] for s in options['skill_ids']}, set(self.agent['config']['skill_ids']))
        first = self.cap.list_available_skills(self.user.id, 'chat', limit=2)
        self.assertEqual(first['next_offset'], 2)
        second = self.cap.list_available_skills(self.user.id, 'chat', offset=2, limit=100)
        self.assertEqual(len(first['skills']) + len(second['skills']), 5)
        self.assertNotIn(foreign['id'], json.dumps(options))
        with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, foreign['id'], session_id='chat')
        with self.assertRaises(ValueError): self.cap.chat_resource_options(self.other.id, 'main', 'chat')
        with self.assertRaises(ValueError): self.cap.validate_turn_resources(self.user.id, 'chat', [foreign['id']], 'skill_ids')
        self.cap.save(self.user.id, {**self.skills[0], 'enabled': False}, self.skills[0]['id'])
        with self.assertRaises(ValueError): self.cap.read_skill(self.user.id, self.skills[0]['id'], session_id='chat')

    def test_unconfigured_custom_agent_does_not_inherit_all_skills_or_mcps(self):
        empty = self.cap.save(self.user.id, {'kind': 'agent', 'name': 'empty', 'content': 'role', 'config': {}})
        self.cap.set_chat_agent(self.user.id, 'empty', empty['id'])
        self.assertEqual(self.cap.list_available_skills(self.user.id, 'empty')['skills'], [])
        self.assertEqual(self.cap.mcp_clients(self.user.id, 'empty'), [])
        self.assertEqual(empty['config']['tool_ids'], [])

    async def test_new_round_clears_preferences_and_approval_keeps_same_round(self):
        seen = []
        async def fake_stream(session_id, message, model=None, approval=None, user=None, **kwargs):
            seen.append(self.cap.session_config(user.id, session_id))
            yield 'event: done\ndata: {}\n\n'
        with patch.object(self.runtime, '_stream', fake_stream):
            _ = [s async for s in self.runtime.stream('chat', 'first', user=self.user, skill_ids=[self.skills[0]['id']], mcp_ids=[self.mcps[0]['id']])]
            _ = [s async for s in self.runtime.stream('chat', '', user=self.user, approval=ApprovalDecision('fixture', True))]
            self.assertEqual(seen[-1]['skill_ids'], [self.skills[0]['id']])
            _ = [s async for s in self.runtime.stream('chat', 'next', user=self.user)]
        self.assertEqual(seen[-1]['skill_ids'], [])
        self.assertEqual(seen[-1]['mcp_ids'], [])
        self.assertEqual(len(self.cap.list_available_skills(self.user.id, 'chat')['skills']), 5)

    async def test_api_rejects_extra_preferences_before_mutating_session(self):
        from service import main
        async def fake_stream(*args, **kwargs):
            yield 'event: done\ndata: {}\n\n'
        with patch.object(main, 'capabilities', self.cap), patch.object(main, 'runtime', self.runtime), patch.object(self.runtime, '_stream', fake_stream):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
                headers = {'authorization': f'Bearer {self.token}'}
                body = {'session_id': 'chat', 'message': 'task', 'agent_id': self.agent['id'], 'skill_ids': [self.skills[0]['id']], 'mcp_ids': [m['id'] for m in self.mcps[:4]]}
                response = await client.post('/sessions/chat/stream', headers=headers, json=body)
                self.assertEqual(response.status_code, 400)
                self.assertNotIn('skill_ids', self.cap.session_config(self.user.id, 'chat'))
                body['mcp_ids'] = [self.mcps[0]['id']]
                response = await client.post('/sessions/chat/stream', headers=headers, json=body)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(self.cap.session_config(self.user.id, 'chat')['mcp_ids'], body['mcp_ids'])

    def test_market_skill_configuration_persists_and_preserves_other_snapshot_fields(self):
        before = self.cap.session_config(self.user.id, 'chat')
        self.cap.set_chat_agent(self.user.id, 'other-chat', self.agent['id'])
        result = self.cap.configure_market_skill(self.user.id, 'chat', 'pdf')
        self.assertTrue(result['configured'])
        self.assertTrue(result['user_notice_required'])
        self.assertIn('配置到智能体', result['message'])
        self.assertIn(result['skill_id'], self.cap.get(self.user.id, self.agent['id'])['config']['skill_ids'])
        scope = self.cap.session_config(self.user.id, 'chat')
        self.assertEqual(scope['agent_prompt'], before['agent_prompt'])
        self.assertEqual(scope['agent_config']['tool_ids'], before['agent_config']['tool_ids'])
        self.assertEqual(scope['agent_config']['mcp_ids'], before['agent_config']['mcp_ids'])
        self.assertTrue(self.cap.read_skill(self.user.id, result['skill_id'], session_id='chat')['content'])
        self.assertNotIn(result['skill_id'], self.cap.session_config(self.user.id, 'other-chat')['agent_config']['skill_ids'])
        self.cap.configure_market_skill(self.user.id, 'chat', 'pdf')
        self.assertEqual(self.cap.get(self.user.id, self.agent['id'])['config']['skill_ids'].count(result['skill_id']), 1)

    def test_market_configuration_rejects_disabled_private_and_cross_account_resources(self):
        installed = self.cap.install_market_skill(self.user.id, 'pdf')
        self.cap.save(self.user.id, {**installed, 'enabled': False}, installed['id'])
        before = self.cap.get(self.user.id, self.agent['id'])['config']
        for owner, session, slug in [(self.user.id, 'chat', 'pdf'), (self.other.id, 'chat', 'docx'),
                                     (self.user.id, 'chat', self.skills[-1]['id']), (self.user.id, 'chat', '../pdf')]:
            with self.assertRaises(ValueError): self.cap.configure_market_skill(owner, session, slug)
        self.assertEqual(self.cap.get(self.user.id, self.agent['id'])['config'], before)
        self.assertFalse(self.cap.get(self.user.id, installed['id'])['enabled'])
        self.assertEqual(self.cap.list(self.other.id, 'skill'), [])

    async def test_sdk_market_tool_configures_before_skill_read(self):
        with patch.object(self.cap, 'mcp_clients', return_value=[]):
            session = self.runtime._create_session('chat', ModelSettings(provider='openai', name='fixture', api_key='fixture'), 'fixture', self.user)
        tool = await session.agent.toolkit.get_tool('configure_market_skill')
        self.assertIsNotNone(tool)
        configured = await tool.call(slug='docx')
        result = json.loads(configured.content[0].text)
        self.assertTrue(result['configured'])
        reader = await session.agent.toolkit.get_tool('read_skill')
        content = await reader.call(skill_id=result['skill_id'])
        self.assertIn('SKILL.md', content.content[0].text)

    async def test_global_selection_policy_applies_to_custom_agents(self):
        with patch.object(self.cap, 'mcp_clients', return_value=[]):
            session = self.runtime._create_session('chat', ModelSettings(provider='openai', name='fixture', api_key='fixture'), 'fixture', self.user)
        prompt = await session.agent._get_system_prompt()
        self.assertIn('多个类似技能', prompt)
        self.assertIn('完全不匹配', prompt)
        self.assertIn('优先使用指定技能', prompt)
        self.assertIn('configure_market_skill', prompt)
        self.assertIn('不得静默配置', prompt)
        self.assertIsNotNone(await session.agent.toolkit.get_tool('list_available_skills'))
        context = self.cap.context(self.user.id, 'task', 'chat')
        self.assertNotIn('本轮用户显式指定', context)
        self.cap.set_chat_resources(self.user.id, 'chat', [self.skills[0]['id']], [])
        self.assertIn('本轮用户显式指定', self.cap.context(self.user.id, 'task', 'chat'))
