import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agentscope.event import (ThinkingBlockDeltaEvent, TextBlockDeltaEvent, ToolCallStartEvent,
                              ToolCallDeltaEvent, RequireUserConfirmEvent, ReplyEndEvent)
from agentscope.message import ToolCallBlock
from service.runtime import AgentScopeRuntime, SessionRuntime
from service.store import StudioStore


class ConversationPartsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = StudioStore(Path(self.temp.name) / 'state.sqlite3', Path(self.temp.name))
        self.runtime = AgentScopeRuntime(self.store)
        self.store.ensure_session('chat')
        self.session = SessionRuntime(id='chat', agent=None, model_key='test')

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    async def emit(self, event):
        return [frame async for frame in self.runtime._map_agent_event(self.session, event)]

    async def test_thoughts_tools_and_answer_survive_reload_in_order(self):
        frames = await self.emit(ThinkingBlockDeltaEvent(reply_id='r', block_id='thought', delta='测试模型返回的思考'))
        self.assertIn('message_parts', frames[0])
        await self.emit(ToolCallStartEvent(reply_id='r', tool_call_id='call', tool_call_name='read_skill'))
        await self.emit(ToolCallDeltaEvent(reply_id='r', tool_call_id='call', delta='{"id":"pdf"}'))
        await self.emit(TextBlockDeltaEvent(reply_id='r', block_id='text', delta='已整理完成。'))
        await self.emit(ReplyEndEvent(session_id='chat', reply_id='r', finished_reason='completed'))
        message = self.store.list_messages('chat')[0]
        self.assertEqual(message['content'], '已整理完成。')
        self.assertEqual([part['type'] for part in message['parts']], ['reasoning', 'tool-call', 'text'])
        self.assertIn('completedAt', message['parts'][0]['timing'])
        self.assertEqual(message['parts'][1]['args'], {'id': 'pdf'})
        self.assertFalse(self.session.assistant_parts)

    async def test_approval_checkpoint_updates_instead_of_duplicating_reply(self):
        await self.emit(RequireUserConfirmEvent(reply_id='r', tool_calls=[ToolCallBlock(id='c', name='write', input='{}')]))
        checkpoint = self.store.list_messages('chat')[0]
        self.assertEqual(checkpoint['parts'][0]['approval']['display'], 'decision')
        self.session.pending_confirmations.clear()
        await self.emit(TextBlockDeltaEvent(reply_id='r', block_id='text', delta='处理完成'))
        await self.emit(ReplyEndEvent(session_id='chat', reply_id='r', finished_reason='completed'))
        messages = self.store.list_messages('chat')
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]['id'], checkpoint['id'])
        self.assertEqual(messages[0]['created_at'], checkpoint['created_at'])
        self.assertEqual(messages[0]['content'], '处理完成')

    async def test_disconnect_preserves_partial_reply(self):
        async def interrupted(_):
            yield ThinkingBlockDeltaEvent(reply_id='r', block_id='thought', delta='已返回的片段')
            raise RuntimeError('test disconnection')
        self.session.agent = SimpleNamespace(reply_stream=interrupted)
        with patch.object(self.runtime, '_get_or_create_session', return_value=self.session):
            frames = [frame async for frame in self.runtime._stream('chat', 'hello')]
        self.assertTrue(any('Model call failed' in frame for frame in frames))
        messages = self.store.list_messages('chat')
        self.assertEqual(messages[-1]['parts'][0]['text'], '已返回的片段')

    async def test_legacy_text_messages_remain_readable(self):
        self.store.add_message('chat', 'assistant', '旧消息')
        self.assertEqual(self.store.list_messages('chat')[0]['parts'], [])
