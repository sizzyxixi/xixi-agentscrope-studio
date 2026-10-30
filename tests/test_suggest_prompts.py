import json
import tempfile
import unittest
from pathlib import Path

from agentscope.event import TextBlockDeltaEvent, ReplyEndEvent
from service.runtime import AgentScopeRuntime, SessionRuntime, BootstrapMiddleware
from service.store import StudioStore
from service.suggest_prompts import split_suggest_prompts, presentation_reply, suggestions_allowed_for_request


class SuggestPromptTests(unittest.TestCase):
    def test_explicit_result_limits_disallow_optional_buttons(self):
        for request in ('只给三条。', '经营诊断先看什么？只给一个简短框架。', '不要额外建议', 'Only give the translation.', 'Explain SKU in two sentences.'):
            with self.subTest(request=request):
                self.assertFalse(suggestions_allowed_for_request(request))

    def test_examples_and_requested_buttons_do_not_disable_exploration(self):
        for request in ('接下来做什么？', '只给三个下一步建议按钮', '翻译“只给三条”', '解释这个例子：`only give the result`'):
            with self.subTest(request=request):
                self.assertTrue(suggestions_allowed_for_request(request))

    def test_output_limit_keeps_answer_but_drops_suggestion_data(self):
        text = '三条结果。\n<suggest_prompts>[{"prompt":"继续做下一步"}]</suggest_prompts>'
        content, parts = presentation_reply(text, [{'type': 'text', 'text': text}], completed=True, allow_suggestions=False)
        self.assertEqual(content, '三条结果。')
        self.assertEqual(parts, [{'type': 'text', 'text': '三条结果。'}])

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
        tool = {'type': 'tool-call', 'toolCallId': 't', 'result': 'Done', 'isError': False}
        answer = {'type': 'text', 'text': 'Answer\n<suggest_prompts>[{"prompt":"Next"}]</suggest_prompts>'}
        _, parts = presentation_reply(answer['text'], [tool, answer], completed=True)
        self.assertEqual(parts, [tool, {'type': 'text', 'text': 'Answer'}, {'type': 'data', 'name': 'suggest_prompts', 'data': [{'prompt': 'Next'}]}])
        _, parts = presentation_reply(answer['text'], [answer, tool], completed=True)
        self.assertFalse(any(part['type'] == 'data' for part in parts))

    def test_blocked_tools_suppress_suggestions_but_keep_answer_and_tool_details(self):
        answer = {'type': 'text', 'text': '请先处理当前问题。\n<suggest_prompts>[{"prompt":"请分析下一步方案。"}]</suggest_prompts>'}
        for state in ({'isError': True, 'result': 'Failed'}, {'isPreliminary': True, 'result': 'Partial'},
                      {}, {'result': None}, {'result': 'Denied', 'approval': {'approved': False}},
                      {'result': 'Waiting', 'approval': {'id': 'confirmation'}},
                      {'result': 'Waiting', 'approval': {}}):
            with self.subTest(state=state):
                tool = {'type': 'tool-call', 'toolCallId': 't', **state}
                content, parts = presentation_reply(answer['text'], [tool, answer], completed=True)
                self.assertEqual(content, '请先处理当前问题。')
                self.assertEqual(parts, [tool, {'type': 'text', 'text': '请先处理当前问题。'}])

    def test_approved_success_can_still_offer_useful_next_steps(self):
        tool = {'type': 'tool-call', 'result': 'Done', 'approval': {'approved': True}}
        answer = {'type': 'text', 'text': '方案已经整理。\n<suggest_prompts>[{"prompt":"请把方案拆成实施步骤。"}]</suggest_prompts>'}
        _, parts = presentation_reply(answer['text'], [tool, answer], completed=True)
        self.assertEqual(parts[-1]['name'], 'suggest_prompts')

    def test_protocol_without_an_answer_does_not_create_suggestion_only_reply(self):
        text = '  \n<suggest_prompts>[{"prompt":"请整理实施步骤。"}]</suggest_prompts>'
        content, parts = presentation_reply(text, [{'type': 'text', 'text': text}], completed=True)
        self.assertEqual(content, '')
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

    async def test_failed_tool_suggestions_are_removed_from_stream_and_saved_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = StudioStore(Path(tmp) / 'state.sqlite3', Path(tmp))
            try:
                store.ensure_session('chat')
                runtime = AgentScopeRuntime(store)
                session = SessionRuntime(id='chat', agent=None, model_key='test')
                session.assistant_parts['r'] = [{'type': 'tool-call', 'toolCallId': 't', 'toolName': 'web_search', 'isError': True, 'result': '配置不可用'}]
                text = '模型配置不可用，请先配置。\n<suggest_prompts>[{"prompt":"请再生成一份报告。"}]</suggest_prompts>'
                _ = [frame async for frame in runtime._map_agent_event(session, TextBlockDeltaEvent(reply_id='r', block_id='text', delta=text))]
                frames = [frame async for frame in runtime._map_agent_event(session, ReplyEndEvent(session_id='chat', reply_id='r', finished_reason='completed'))]
                final = next(json.loads(frame.split('data: ')[1]) for frame in frames if frame.startswith('event: message_parts'))
                saved = store.list_messages('chat')[0]
                self.assertEqual(final['parts'], saved['parts'])
                self.assertEqual(saved['content'], '模型配置不可用，请先配置。')
                self.assertFalse(any(part.get('name') == 'suggest_prompts' for part in saved['parts']))
            finally:
                store._conn.close()
