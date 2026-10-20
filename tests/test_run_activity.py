"""Real stream mapping and durable, monotonic turn timing (no provider calls)."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agentscope.event import ThinkingBlockDeltaEvent, TextBlockDeltaEvent, ReplyEndEvent, RequireUserConfirmEvent, ToolResultStartEvent
from agentscope.message import ToolCallBlock
from service.run_activity import RunClock
from service.runtime import AgentScopeRuntime, SessionRuntime, ApprovalDecision
from service.store import StudioStore


def payload(frame):
    return json.loads(next(line[6:] for line in frame.splitlines() if line.startswith('data: ')))


class RunClockTests(unittest.TestCase):
    def test_pause_resume_excludes_approval_wait_and_wall_clock_changes(self):
        with patch('service.run_activity.time.monotonic', return_value=10) as mono:
            clock = RunClock()
            mono.return_value = 12.5
            clock.settle('requires-action')
            mono.return_value = 1000
            self.assertEqual(clock.snapshot()['elapsedMs'], 2500)
            clock.resume()
            mono.return_value = 1001.25
            clock.settle('complete')
            mono.return_value = 9000
            self.assertEqual(clock.snapshot()['elapsedMs'], 3750)
            self.assertEqual(clock.status, 'complete')
            self.assertIsNotNone(clock.ended_at)


class RunActivityTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = StudioStore(Path(self.temp.name) / 'state.sqlite3', Path(self.temp.name))
        self.runtime = AgentScopeRuntime(self.store)
        self.session = SessionRuntime(id='chat', agent=None, model_key='test')

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    async def run_stream(self, reply):
        self.session.agent = SimpleNamespace(reply_stream=reply)
        with patch.object(self.runtime, '_get_or_create_session', return_value=self.session):
            return [payload(frame) async for frame in self.runtime._stream('chat', 'hello')]

    async def test_completed_timing_and_parts_survive_store_reopen(self):
        async def reply(_):
            yield ThinkingBlockDeltaEvent(reply_id='r', block_id='thought', delta='模型返回的公开思考')
            await asyncio.sleep(.02)
            yield TextBlockDeltaEvent(reply_id='r', block_id='answer', delta='最终回复')
            yield ReplyEndEvent(session_id='chat', reply_id='r', finished_reason='completed')
        events = await self.run_stream(reply)
        timing = [e['activity'] for e in events if e['type'] == 'run_activity']
        self.assertEqual([t['status'] for t in timing], ['running', 'complete'])
        self.assertGreaterEqual(timing[-1]['elapsedMs'], 15)
        reopened = StudioStore(self.store.db_path, Path(self.temp.name))
        try:
            msg = reopened.list_messages('chat')[-1]
            self.assertEqual(msg['activity']['id'], timing[-1]['id'])
            self.assertEqual(msg['activity']['elapsedMs'], timing[-1]['elapsedMs'])
            self.assertEqual(msg['activity']['status'], 'complete')
            self.assertEqual([p['type'] for p in msg['parts']], ['reasoning', 'text'])
        finally:
            reopened._conn.close()

    async def test_model_failure_is_not_reported_as_complete(self):
        async def reply(_):
            yield ThinkingBlockDeltaEvent(reply_id='r', block_id='thought', delta='部分内容')
            raise RuntimeError('fixture failure')
        await self.run_stream(reply)
        self.assertEqual(self.store.list_messages('chat')[-1]['activity']['status'], 'error')

    async def test_closed_stream_preserves_partial_reply_and_cancelled_timing(self):
        async def reply(_):
            yield ThinkingBlockDeltaEvent(reply_id='r', block_id='thought', delta='部分内容')
            await asyncio.sleep(10)
        self.session.agent = SimpleNamespace(reply_stream=reply)
        with patch.object(self.runtime, '_get_or_create_session', return_value=self.session):
            stream = self.runtime._stream('chat', 'hello')
            async for frame in stream:
                if payload(frame)['type'] == 'message_parts':
                    break
            await stream.aclose()
        message = self.store.list_messages('chat')[-1]
        self.assertEqual(message['activity']['status'], 'cancelled')
        self.assertEqual(message['parts'][0]['text'], '部分内容')

    async def test_approval_resume_keeps_same_turn_and_attention_placement(self):
        async def first(_):
            yield RequireUserConfirmEvent(id='approval', reply_id='r', tool_calls=[ToolCallBlock(id='c', name='write', input='{}')])
        await self.run_stream(first)
        checkpoint = self.store.list_messages('chat')[-1]
        self.assertEqual(checkpoint['activity']['status'], 'requires-action')
        self.assertTrue(checkpoint['parts'][0]['activityAttention'])
        async def resumed(_):
            yield ToolResultStartEvent(reply_id='r', tool_call_id='c', tool_call_name='write')
            yield TextBlockDeltaEvent(reply_id='r', block_id='answer', delta='完成')
            yield ReplyEndEvent(session_id='chat', reply_id='r', finished_reason='completed')
        self.session.agent = SimpleNamespace(reply_stream=resumed)
        with patch.object(self.runtime, '_get_or_create_session', return_value=self.session):
            events = [payload(f) async for f in self.runtime._stream('chat', '', approval=ApprovalDecision(id='approval', approved=True))]
        message = self.store.list_messages('chat')[-1]
        self.assertEqual(message['activity']['id'], checkpoint['activity']['id'])
        self.assertEqual(message['activity']['status'], 'complete')
        self.assertTrue(message['parts'][0]['activityAttention'])
        self.assertNotIn('approval', message['parts'][0])
        self.assertTrue(any(e['type'] == 'run_activity' for e in events))

    async def test_eof_without_reply_end_is_incomplete(self):
        async def reply(_):
            yield TextBlockDeltaEvent(reply_id='r', block_id='answer', delta='未完成')
        await self.run_stream(reply)
        self.assertEqual(self.store.list_messages('chat')[-1]['activity']['status'], 'incomplete')

    async def test_legacy_messages_have_no_invented_duration(self):
        self.store.ensure_session('chat')
        self.store.add_message('chat', 'assistant', '旧消息')
        self.assertIsNone(self.store.list_messages('chat')[0]['activity'])
