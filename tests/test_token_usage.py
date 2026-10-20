import asyncio
import json
from collections.abc import AsyncIterable
import tempfile
import unittest
import httpx
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from agentscope.event import ModelCallEndEvent, ReplyStartEvent, ReplyEndEvent, RequireUserConfirmEvent, TextBlockDeltaEvent
from agentscope.message import ToolCallBlock
from agentscope.model import ChatResponse, ChatUsage

from service.runtime import AgentScopeRuntime, SessionRuntime, ApprovalDecision, ModelSettings
from service.store import StudioStore
from service.token_usage import TokenUsageMiddleware


def response(incoming=None, outgoing=None, final=True):
    return ChatResponse(content=[], is_last=final, usage=ChatUsage(input_tokens=incoming, output_tokens=outgoing, time=0) if incoming is not None else None)


class TokenUsageTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = StudioStore(self.root/'state.db', self.root)
        self.store.ensure_session('chat')
        self.ledger = self.store.token_usage
        self.ledger.start_turn('chat', 'turn')
        self.tracker = TokenUsageMiddleware(self.ledger, 'chat')
        self.tracker.turn_id = 'turn'
        self.model = SimpleNamespace(model='fixture')

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    async def call(self, reply):
        async def invoke(**kwargs): return reply
        result = await self.tracker.on_model_call(None, {'current_model': self.model}, invoke)
        if isinstance(result, AsyncIterable):
            return [item async for item in result]
        return result

    async def test_multiple_calls_are_summed_once_and_survive_database_reopen(self):
        await self.call(response(10000, 1000))
        await self.call(response(1000, 480))
        self.ledger.phase('turn', 'completed')
        summary = self.ledger.summary('chat', 'turn')
        self.assertEqual(summary['total_tokens'], 12480)
        self.assertEqual(summary['call_count'], 2)
        self.assertEqual(summary['status'], 'complete')
        self.store.add_message('chat', 'assistant', 'done', message_id='assistant-reply')
        self.ledger.link('chat', 'assistant-reply', 'turn')
        reopened = StudioStore(self.root/'state.db', self.root)
        try:
            self.assertEqual(reopened.list_messages('chat')[0]['token_usage']['total_tokens'], 12480)
            self.assertIsNone(reopened.token_usage.for_message('another-session', 'assistant-reply'))
        finally:
            reopened._conn.close()

    async def test_stream_usage_snapshots_are_not_added_as_deltas(self):
        async def stream():
            yield response(100, 10, False)
            yield response(100, 20, False)
            yield response(100, 30)
        await self.call(stream())
        self.ledger.phase('turn', 'completed')
        self.assertEqual(self.ledger.summary('chat', 'turn')['total_tokens'], 130)
        self.assertEqual(self.ledger.summary('chat', 'turn')['call_count'], 1)

    async def test_zero_and_missing_usage_are_distinct_and_unknown_is_not_dropped(self):
        await self.call(response(0, 0))
        self.ledger.phase('turn', 'completed')
        self.assertEqual(self.ledger.summary('chat', 'turn')['total_tokens'], 0)
        self.assertEqual(self.ledger.summary('chat', 'turn')['status'], 'complete')
        await self.call(response())
        self.assertEqual(self.ledger.summary('chat', 'turn')['total_tokens'], 0)
        self.assertEqual(self.ledger.summary('chat', 'turn')['status'], 'incomplete')
        self.ledger.start_turn('chat', 'unknown')
        self.tracker.turn_id = 'unknown'
        await self.call(response())
        self.ledger.phase('unknown', 'completed')
        self.assertIsNone(self.ledger.summary('chat', 'unknown')['total_tokens'])

    async def test_interrupted_stream_keeps_known_usage_and_separates_later_turns(self):
        async def stream():
            yield response(50, 5, False)
            raise asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError): await self.call(stream())
        self.ledger.phase('turn', 'interrupted')
        usage = self.ledger.summary('chat', 'turn')
        self.assertEqual(usage['total_tokens'], 55)
        self.assertEqual(usage['status'], 'incomplete')
        self.ledger.start_turn('chat', 'next')
        self.tracker.turn_id = 'next'
        await self.call(response(2, 3))
        self.assertEqual(self.ledger.summary('chat', 'next')['total_tokens'], 5)
        self.assertEqual(self.ledger.summary('chat', 'turn')['total_tokens'], 55)

    async def test_duplicate_usage_updates_are_idempotent(self):
        self.ledger.start_call('turn', 'call-id', 'fixture')
        self.ledger.update_call('call-id', 100, 10, True)
        self.ledger.update_call('call-id', 100, 10, True)
        self.ledger.phase('turn', 'completed')
        self.assertEqual(self.ledger.summary('chat', 'turn')['total_tokens'], 110)

    async def test_model_events_do_not_turn_missing_provider_usage_into_zero(self):
        runtime = AgentScopeRuntime(self.store)
        session = SessionRuntime(id='chat', agent=None, model_key='fixture', token_turn_id='turn')
        frames = [frame async for frame in runtime._map_agent_event(session, ModelCallEndEvent(reply_id='r', input_tokens=0, output_tokens=0))]
        self.assertIn('"total_tokens": null', frames[0])

    async def test_approval_resume_remains_same_round_and_history_recovers_usage(self):
        runtime = AgentScopeRuntime(self.store)
        tracker = TokenUsageMiddleware(self.ledger, 'chat')
        session = SessionRuntime(id='chat', agent=None, model_key='fixture', usage_tracker=tracker)
        iteration = 0
        async def reply_stream(message):
            nonlocal iteration
            iteration += 1
            if iteration == 1:
                yield ReplyStartEvent(session_id='chat', reply_id='reply', name='fixture')
            async def invoke(**kwargs): return response(100, 20)
            await tracker.on_model_call(None, {'current_model': self.model}, invoke)
            yield ModelCallEndEvent(reply_id='reply', input_tokens=100, output_tokens=20)
            if iteration == 1:
                yield RequireUserConfirmEvent(id='approval', reply_id='reply', tool_calls=[ToolCallBlock(id='tool', name='write', input='{}')])
            else:
                yield TextBlockDeltaEvent(reply_id='reply', block_id='body', delta='done')
                yield ReplyEndEvent(session_id='chat', reply_id='reply')
        session.agent = SimpleNamespace(reply_stream=reply_stream)
        with patch.object(runtime, '_get_or_create_session', return_value=session):
            first = [frame async for frame in runtime._stream('chat', 'do work')]
            turn_id = session.token_turn_id
            self.assertEqual(self.ledger.summary('chat', turn_id)['total_tokens'], 120)
            self.assertEqual(self.ledger.summary('chat', turn_id)['status'], 'waiting')
            second = [frame async for frame in runtime._stream('chat', '', approval=ApprovalDecision('approval', True))]
        self.assertEqual(session.token_turn_id, turn_id)
        self.assertEqual(self.ledger.summary('chat', turn_id)['total_tokens'], 240)
        self.assertEqual(self.ledger.summary('chat', turn_id)['status'], 'complete')
        assistant = [message for message in self.store.list_messages('chat') if message['role'] == 'assistant']
        self.assertEqual(len(assistant), 1)
        self.assertEqual(assistant[0]['token_usage']['total_tokens'], 240)
        events = [json.loads(frame.split('data: ')[1]) for frame in second if frame.startswith('event: token_usage')]
        self.assertEqual(events[-1]['usage']['total_tokens'], 240)
        self.assertEqual(events[-1]['usage']['status'], 'complete')

    async def test_context_compression_usage_is_included_and_hook_is_restored(self):
        async def structured(*args, **kwargs): return response(80, 20)
        self.model._call_api_with_structured_output = structured
        async def compress(**kwargs):
            await self.model._call_api_with_structured_output()
        await self.tracker.on_compress_context(SimpleNamespace(model=self.model), {}, compress)
        await self.call(response(10, 5))
        self.ledger.phase('turn', 'completed')
        self.assertEqual(self.ledger.summary('chat', 'turn')['total_tokens'], 115)
        self.assertIs(self.model._call_api_with_structured_output, structured)

    async def test_real_deepseek_sdk_usage_only_final_chunk_reaches_footer_metadata(self):
        runtime = AgentScopeRuntime(self.store)
        model = ModelSettings(provider='deepseek', name='deepseek-flash', api_key='fixture-key')
        session = runtime._get_or_create_session('chat', model, None)
        def handler(request):
            chunks = [
                {'id': 'fixture', 'model': 'deepseek-flash', 'choices': [{'index': 0, 'delta': {'role': 'assistant', 'content': 'done'}, 'finish_reason': None}]},
                {'id': 'fixture', 'model': 'deepseek-flash', 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]},
                {'id': 'fixture', 'model': 'deepseek-flash', 'choices': [], 'usage': {'prompt_tokens': 12000, 'completion_tokens': 480, 'total_tokens': 12480, 'prompt_cache_hit_tokens': 10000}},
            ]
            data = ''.join('data: ' + json.dumps(item) + '\n\n' for item in chunks) + 'data: [DONE]\n\n'
            return httpx.Response(200, headers={'content-type': 'text/event-stream'}, content=data)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            session.agent.model.client_kwargs['http_client'] = client
            frames = [frame async for frame in runtime._stream('chat', 'hello', model=model)]
        usage = [json.loads(frame.split('data: ')[1])['usage'] for frame in frames if frame.startswith('event: token_usage')]
        self.assertEqual(usage[-1]['total_tokens'], 12480)
        self.assertEqual(usage[-1]['status'], 'complete')
        self.assertEqual(self.store.list_messages('chat')[-1]['token_usage']['total_tokens'], 12480)

    def test_legacy_messages_do_not_show_fake_zero_usage(self):
        self.store.add_message('chat', 'assistant', 'old response')
        self.assertIsNone(self.store.list_messages('chat')[0]['token_usage'])
