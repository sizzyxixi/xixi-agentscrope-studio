import json
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from agentscope.event import RequireUserConfirmEvent, ReplyEndEvent
from agentscope.message import ToolCallBlock
from service.chat_schedules import ChatSchedules
from service.runtime import AgentScopeRuntime, ModelSettings, ApprovalDecision
from tests.test_console import StoreFixture


class ChatScheduleTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.create_store()
        self.cap.set_chat_agent(self.user.id, 'chat', 'main')
        self.manager = ChatSchedules(self.cap, self.user.id, 'chat')
        self.config = {'frequency': 'daily', 'start_at': '2099-01-01T01:00:00Z', 'time': '09:00', 'timezone': 'Asia/Shanghai'}

    def tearDown(self):
        self.clean_store()

    def prepare(self, **config):
        return self.manager.prepare('每日简报', '整理昨天销售数据。', {**self.config, **config})

    async def test_preview_does_not_write_and_confirm_is_idempotent(self):
        draft = self.prepare()
        self.assertFalse(draft['saved'])
        self.assertEqual(self.cap.list(self.user.id, 'schedule'), [])
        result = self.manager.create(draft['draft_id'])
        duplicate = self.manager.create(draft['draft_id'])
        self.assertEqual(result['id'], duplicate['id'])
        self.assertEqual(len(self.cap.list(self.user.id, 'schedule')), 1)
        self.assertEqual(self.cap.list(self.other.id, 'schedule'), [])
        self.assertEqual(result['next_run'], draft['schedule']['config']['next_run'])

    async def test_old_expired_and_unknown_drafts_do_not_write(self):
        old = self.prepare()
        current = self.prepare(time='10:00')
        with self.assertRaises(ValueError): self.manager.create(old['draft_id'])
        self.manager.drafts[current['draft_id']]['expires'] = 0
        with self.assertRaises(ValueError): self.manager.create(current['draft_id'])
        with self.assertRaises(ValueError): self.manager.create('invented')
        self.assertEqual(self.cap.list(self.user.id, 'schedule'), [])

    async def test_past_time_missing_weekday_and_invalid_zone_rejected(self):
        for config in ({'frequency': 'once', 'start_at': '2000-01-01T00:00Z'}, {'frequency': 'weekly'}, {'timezone': 'invalid'}, {'frequency': 'interval', 'interval_value': 0}):
            with self.subTest(config=config), self.assertRaises(ValueError): self.prepare(**config)
        self.assertEqual(self.cap.list(self.user.id, 'schedule'), [])

    async def test_account_and_resource_scope_is_enforced_at_both_stages(self):
        skill = self.resource('skill')
        other = ChatSchedules(self.cap, self.other.id, 'chat')
        with self.assertRaises(ValueError): other.prepare('任务', '执行', self.config)
        draft = self.prepare(skill_ids=[skill['id']])
        self.store._conn.execute('UPDATE console_resources SET enabled=0 WHERE id=?', (skill['id'],)); self.store._conn.commit()
        with self.assertRaises(ValueError): self.manager.create(draft['draft_id'])
        with self.assertRaises(ValueError): self.prepare(skill_ids=[skill['id']])
        self.assertEqual(self.cap.list(self.user.id, 'schedule'), [])

    async def test_task_cannot_change_agent_or_bypass_whitelist(self):
        allowed = self.resource('skill')
        forbidden = self.resource('skill', name='other')
        agent = self.resource('agent', name='restricted', content='Only configured tools.', config={'skill_ids': [allowed['id']], 'mcp_ids': [], 'tool_ids': []})
        self.cap.set_chat_agent(self.user.id, 'restricted', agent['id'])
        manager = ChatSchedules(self.cap, self.user.id, 'restricted')
        with self.assertRaises(ValueError): manager.prepare('task', 'work', {**self.config, 'agent_id': 'main', 'skill_ids': [forbidden['id']]})
        draft = manager.prepare('task', 'work', {**self.config, 'agent_id': 'main', 'skill_ids': [allowed['id']]})
        self.assertEqual(draft['schedule']['config']['agent_id'], agent['id'])
        self.assertEqual(draft['schedule']['skills'], [allowed['name']])

    async def test_preview_is_a_copy_and_serverless_is_explicit(self):
        with patch.dict('os.environ', {'AGENTSCOPE_SERVERLESS': '1'}): draft = self.prepare()
        self.assertFalse(draft['schedule']['automatic'])
        preview = self.manager.preview(draft['draft_id']); preview['content'] = 'tampered'
        saved = self.manager.create(draft['draft_id'])
        self.assertEqual(self.cap.get(self.user.id, saved['id'])['content'], '整理昨天销售数据。')

    async def test_repeated_task_does_not_silently_change_first_run_after_confirmation_delay(self):
        draft = self.prepare()
        self.manager.drafts[draft['draft_id']]['body']['config']['next_run'] = '2000-01-01T00:00Z'
        with self.assertRaisesRegex(ValueError, '首次执行时间已过'): self.manager.create(draft['draft_id'])

    async def test_all_chat_agents_register_tools_but_runs_do_not(self):
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        model = ModelSettings(provider='openai', name='fixture', api_key='fixture')
        agent = self.resource('agent', config={'tool_ids': []})
        self.cap.set_chat_agent(self.user.id, 'custom', agent['id'])
        for session_id in ('chat', 'custom', 'run-test', 'channel-test'):
            session = runtime._create_session(session_id, model, 'fixture', self.user)
            tools = session.agent.toolkit.tool_groups[0].tools
            registered = {tool.name for tool in tools}
            self.assertEqual('create_scheduled_task' in registered, session_id in ('chat', 'custom'))
            if session_id == 'chat':
                prepare = next(t for t in tools if t.name == 'prepare_scheduled_task')
                create = next(t for t in tools if t.name == 'create_scheduled_task')
                self.assertEqual((await prepare.check_permissions()).behavior.value, 'allow')
                self.assertEqual((await create.check_permissions()).behavior.value, 'ask')
                prompt = await session.agent._get_system_prompt()
                self.assertIn('文字“确认”不能代替', prompt)
                self.assertIn('运行时当前时间', prompt)

    async def test_native_confirmation_card_snapshot_persists_without_creating(self):
        runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
        session = runtime._create_session('chat', ModelSettings(provider='openai', name='fixture', api_key='fixture'), 'fixture', self.user)
        draft = runtime.chat_schedules['chat'].prepare('daily', 'summary', self.config)
        event = RequireUserConfirmEvent(reply_id='reply', tool_calls=[ToolCallBlock(id='call', name='create_scheduled_task', input=json.dumps({'draft_id': draft['draft_id']}))])
        frames = [frame async for frame in runtime._map_agent_event(session, event)]
        part = self.store.list_messages('chat')[-1]['parts'][0]
        self.assertEqual(part['args']['schedule']['name'], 'daily')
        self.assertEqual(part['approval']['display'], 'decision')
        self.assertTrue(any('approval_required' in frame for frame in frames))
        self.assertEqual(self.cap.list(self.user.id, 'schedule'), [])

    async def test_saved_task_is_claimed_once_by_existing_scheduler(self):
        from service import capabilities
        now = datetime.now(timezone.utc)
        config = {'frequency': 'once', 'start_at': (now + timedelta(minutes=1)).isoformat(), 'timezone': 'Asia/Shanghai'}
        draft = self.manager.prepare('once', 'summary', config)
        result = self.manager.create(draft['draft_id'])
        class Later(datetime):
            @classmethod
            def now(cls, tz=None): return now + timedelta(minutes=2)
        class TickDone(Exception): pass
        async def stop(_): raise TickDone()
        with patch.object(capabilities, 'datetime', Later), patch.object(capabilities.asyncio, 'sleep', stop), patch.object(self.cap, 'start_run') as start:
            for _ in range(2):
                with self.assertRaises(TickDone): await self.cap.scheduler()
            start.assert_called_once()
            self.assertEqual(start.call_args.args[0].id, self.user.id)
            self.assertEqual(start.call_args.args[1], result['id'])
            self.assertEqual(start.call_args.kwargs, {'automatic': True})

    async def test_native_resume_accept_reject_and_batch_rejection(self):
        for approved, batch in ((True, False), (False, False), (True, True)):
            with self.subTest(approved=approved, batch=batch):
                runtime = AgentScopeRuntime(self.store); runtime.capabilities = self.cap
                session = runtime._create_session('chat', ModelSettings(provider='openai', name='fixture', api_key='fixture'), 'fixture', self.user)
                manager = runtime.chat_schedules['chat']
                draft = manager.prepare(f'task-{approved}-{batch}', 'summary', self.config)
                calls = [ToolCallBlock(id='call', name='create_scheduled_task', input=json.dumps({'draft_id': draft['draft_id']}))]
                if batch: calls.append(ToolCallBlock(id='other', name='save_memory', input='{}'))
                event = RequireUserConfirmEvent(id='approval', reply_id=f'r-{approved}-{batch}', tool_calls=calls)
                _ = [frame async for frame in runtime._map_agent_event(session, event)]
                decisions = []
                async def resumed(value):
                    decisions.extend(result.confirmed for result in value.confirm_results)
                    if value.confirm_results[0].confirmed: manager.create(draft['draft_id'])
                    yield ReplyEndEvent(session_id='chat', reply_id=event.reply_id, finished_reason='completed')
                session.agent = SimpleNamespace(reply_stream=resumed)
                before = len(self.cap.list(self.user.id, 'schedule'))
                with patch.object(runtime, '_get_or_create_session', return_value=session):
                    _ = [frame async for frame in runtime._stream('chat', '', approval=ApprovalDecision(id='approval', approved=approved), user=self.user)]
                self.assertEqual(decisions, [approved and not batch] * len(calls))
                self.assertEqual(len(self.cap.list(self.user.id, 'schedule')), before + int(approved and not batch))
                if not approved or batch:
                    with self.assertRaises(ValueError): manager.create(draft['draft_id'])
