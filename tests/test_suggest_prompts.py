import json
import tempfile
import unittest
from pathlib import Path

from agentscope.event import TextBlockDeltaEvent, ReplyEndEvent
from service.runtime import AgentScopeRuntime, SessionRuntime, BootstrapMiddleware
from service.store import StudioStore
from service.suggest_prompts import split_suggest_prompts, presentation_reply


class SuggestPromptTests(unittest.TestCase):
    def test_validation_deduplication_and_limit(self):
        values = [None, {'label': 'invalid'}, {'prompt': ' '}, {'prompt': 'x' * 501},
                  {'prompt': ' Inspect the script ', 'label': 'discard'}, {'prompt': 'Inspect the script'},
                  *[{'prompt': str(i)} for i in range(6)]]
        text, prompts = split_suggest_prompts('Answer\n<suggest_prompts>' + json.dumps(values) + '</suggest_prompts>', completed=True)
        self.assertEqual(text, 'Answer')
        self.assertEqual(prompts, [{'prompt': 'Inspect the script'}, {'prompt': '0'}, {'prompt': '1'}, {'prompt': '2'}])

    def test_incomplete_or_malformed_suggestions_never_become_actions(self):
        for suffix in ('[{"prompt":"Next"}]', 'broken</suggest_prompts>', '{"prompt":"Next"}</suggest_prompts>'):
            self.assertEqual(split_suggest_prompts('Answer\n<suggest_prompts>' + suffix, completed=True), ('Answer', []))
        self.assertEqual(split_suggest_prompts('Answer\n<suggest_prompts>[{"prompt":"Next"}]</suggest_prompts>'), ('Answer', []))

    def test_code_examples_and_plain_answers_are_unchanged(self):
        for text in ('Plain answer', '```xml\n<suggest_prompts>[]</suggest_prompts>\n```', 'Inline <suggest_prompts> example'):
            self.assertEqual(split_suggest_prompts(text, completed=True), (text, []))

    def test_tool_and_reasoning_parts_preserved_and_only_final_answer_provides_actions(self):
        tool = {'type': 'tool-call', 'toolCallId': 't'}
        answer = {'type': 'text', 'text': 'Answer\n<suggest_prompts>[{"prompt":"Next"}]</suggest_prompts>'}
        _, parts = presentation_reply(answer['text'], [tool, answer], completed=True)
        self.assertEqual(parts, [tool, {'type': 'text', 'text': 'Answer'}, {'type': 'data', 'name': 'suggest_prompts', 'data': [{'prompt': 'Next'}]}])
        _, parts = presentation_reply(answer['text'], [answer, tool], completed=True)
        self.assertFalse(any(part['type'] == 'data' for part in parts))


class SuggestPromptRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_policy_injected_for_custom_agents_too(self):
        prompt = await BootstrapMiddleware().on_system_prompt(None, 'Custom agent persona')
        self.assertIn('Custom agent persona', prompt)
        self.assertIn('[全局下一步建议展示协议]', prompt)

    async def test_interrupted_reply_preserves_answer_without_suggestions(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = StudioStore(Path(tmp) / 'state.sqlite3', Path(tmp))
            try:
                store.ensure_session('chat')
                runtime = AgentScopeRuntime(store)
                session = SessionRuntime(id='chat', agent=None, model_key='test')
                text = 'Partial answer\n<suggest_prompts>[{"prompt":"Next"}]</suggest_prompts>'
                _ = [frame async for frame in runtime._map_agent_event(session, TextBlockDeltaEvent(reply_id='r', block_id='text', delta=text))]
                _ = [frame async for frame in runtime._map_agent_event(session, ReplyEndEvent(session_id='chat', reply_id='r', finished_reason='interrupted'))]
                message = store.list_messages('chat')[0]
                self.assertEqual(message['content'], 'Partial answer')
                self.assertFalse(any(part['type'] == 'data' for part in message['parts']))
            finally:
                store._conn.close()

    async def test_completed_stream_and_reload_share_structured_suggestions(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = StudioStore(Path(tmp) / 'state.sqlite3', Path(tmp))
            try:
                store.ensure_session('chat')
                runtime = AgentScopeRuntime(store)
                session = SessionRuntime(id='chat', agent=None, model_key='test')
                for chunk in ('Done.\n<sug', 'gest_prompts>[{"prompt":"Explain the next step"}]</suggest_prompts>'):
                    _ = [frame async for frame in runtime._map_agent_event(session, TextBlockDeltaEvent(reply_id='r', block_id='text', delta=chunk))]
                frames = [frame async for frame in runtime._map_agent_event(session, ReplyEndEvent(session_id='chat', reply_id='r', finished_reason='completed'))]
                final = next(json.loads(frame.split('data: ')[1]) for frame in frames if frame.startswith('event: message_parts'))
                message = store.list_messages('chat')[0]
                self.assertEqual(message['content'], 'Done.')
                self.assertEqual(message['parts'], final['parts'])
                self.assertEqual(final['content'], 'Done.')
                self.assertEqual(message['parts'][-1]['data'], [{'prompt': 'Explain the next step'}])
                self.assertNotIn('<suggest_prompts>', json.dumps(message))
            finally:
                store._conn.close()
