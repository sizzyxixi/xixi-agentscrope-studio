"""Composer resources remain scoped; mock shops never enter execution requests."""
import unittest
from tests.test_console import StoreFixture
from service.main import StreamRequest


class ComposerResourceTests(StoreFixture, unittest.TestCase):
    def setUp(self):
        self.create_store()
        self.skill = self.resource('skill', name='分析', content='分析业务数据')
        self.mcp = self.resource('mcp', name='ERP', config={'url': 'https://example.com/mcp'})
        self.agent = self.resource('agent', name='运营', content='分析经营数据', config={'skill_ids': [self.skill['id']], 'mcp_ids': [self.mcp['id']]})

    def tearDown(self): self.clean_store()

    def test_round_selection_does_not_toggle_global_mcp_and_history_keeps_names(self):
        self.cap.set_chat_agent(self.user.id, 'chat', self.agent['id'])
        self.cap.set_chat_resources(self.user.id, 'chat', [self.skill['id']], [self.mcp['id']])
        self.assertEqual(len(self.cap.mcp_clients(self.user.id, 'chat')), 1)
        self.store.add_message('chat', 'user', '分析', resources=self.cap.resource_snapshot(self.user.id, 'chat'))
        self.cap.set_chat_resources(self.user.id, 'chat', [], [])
        self.assertEqual(self.cap.mcp_clients(self.user.id, 'chat'), [])
        self.assertTrue(self.cap.get(self.user.id, self.mcp['id'])['enabled'])
        self.cap.save(self.user.id, {**self.skill, 'name': '修改后的名称'}, self.skill['id'])
        self.assertEqual([item['name'] for item in self.store.list_messages('chat')[0]['resources']], ['分析', 'ERP'])

    def test_schedule_save_rejects_resources_outside_agent_bindings(self):
        hidden = self.resource('skill', name='未绑定技能')
        with self.assertRaisesRegex(ValueError, '智能体配置范围'):
            self.resource('schedule', config={'next_run': '2099-01-01T10:00Z', 'agent_id': self.agent['id'], 'skill_ids': [hidden['id']]})

    def test_mock_shops_are_not_part_of_stream_contract(self):
        request = StreamRequest(session_id='draft', message='分析', shop_ids=['mock-shop-us'])
        self.assertNotIn('shop_ids', request.model_dump())
        self.assertFalse(self.store._conn.execute('SELECT 1 FROM sessions WHERE id=?', ('draft',)).fetchone())

    def test_options_expose_descriptions_and_keep_other_accounts_resources_private(self):
        options = self.cap.chat_resource_options(self.user.id, self.agent['id'])
        self.assertEqual(options['skill_ids'][0]['description'], '分析业务数据')
        self.assertNotIn('shop_ids', options)
        with self.assertRaises(ValueError): self.cap.chat_resource_options(self.other.id, self.agent['id'])
