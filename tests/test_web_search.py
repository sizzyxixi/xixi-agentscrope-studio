import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

from service import web_search
from service.capabilities import ConsoleCapabilities
from service.runtime import AgentScopeRuntime, ModelSettings
from service.store import StudioStore


class Body(httpx.AsyncByteStream):
    def __init__(self, data): self.data = data
    async def __aiter__(self): yield self.data


def reply(payload, status=200):
    return httpx.Response(status, headers={'content-type': 'application/json'}, stream=Body(json.dumps(payload).encode()))


class SearchAPITests(unittest.IsolatedAsyncioTestCase):
    async def search(self, handler, **kwargs):
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        with patch.object(web_search.httpx, 'AsyncClient', return_value=client):
            return await web_search.search_web('fixture-secret', 'test site:example.com', **kwargs)

    async def test_official_request_and_structured_results(self):
        def handler(request):
            self.assertEqual(str(request.url), 'https://api.deepseek.com/v1/tools/search')
            self.assertEqual(request.method, 'POST')
            self.assertEqual(request.headers['authorization'], 'Bearer fixture-secret')
            self.assertNotIn('cookie', request.headers)
            self.assertEqual(json.loads(request.content), {'query': 'test site:example.com', 'count': 5, 'need_content': True})
            return reply({'results': [{'title': 'Example', 'url': 'https://example.com/page', 'summary': 'summary', 'snippet': 'short', 'content': 'body', 'date': None, 'rerank_score': 2.4, 'authority': 3}]})
        result = await self.search(handler, need_content=True)
        self.assertEqual(result['results'][0]['content'], 'body')
        self.assertEqual(result['results'][0]['url'], 'https://example.com/page')
        self.assertTrue(result['untrusted_content'])
        self.assertNotIn('fixture-secret', json.dumps(result))

    async def test_empty_results_are_valid(self):
        result = await self.search(lambda request: reply({'results': []}))
        self.assertEqual(result['results'], [])

    async def test_validation_happens_before_network(self):
        with patch.object(web_search.httpx, 'AsyncClient') as client:
            for kwargs in [{'query': ''}, {'query': 'x'*129}, {'query': 'x', 'count': 51},
                           {'query': 'x', 'count': True}, {'query': 'x', 'need_content': 'true'}]:
                with self.assertRaises(ValueError): await web_search.search_web('fixture', **kwargs)
            client.assert_not_called()

    async def test_http_errors_are_actionable_and_do_not_echo_secret(self):
        for code, message in [(401, 'Key'), (402, '余额'), (429, '频繁'), (500, '不可用'), (302, '不可用')]:
            with self.subTest(code=code), self.assertRaisesRegex(ValueError, message) as error:
                await self.search(lambda request: reply({'secret': 'fixture-secret'}, status=code))
            self.assertNotIn('fixture-secret', str(error.exception))

    async def test_timeout_invalid_and_oversize_payloads(self):
        def timeout(request): raise httpx.ReadTimeout('fixture', request=request)
        with self.assertRaisesRegex(ValueError, '超时'): await self.search(timeout)
        for payload in [[], {}, {'results': 'invalid'}]:
            with self.assertRaisesRegex(ValueError, '格式'): await self.search(lambda request: reply(payload))
        with self.assertRaisesRegex(ValueError, '无效数据'):
            await self.search(lambda request: httpx.Response(200, stream=Body(b'not-json')))
        with patch.object(web_search, 'MAX_RESPONSE_BYTES', 10), self.assertRaisesRegex(ValueError, '过大'):
            await self.search(lambda request: reply({'results': []}))

    async def test_result_urls_and_content_are_bounded(self):
        result = await self.search(lambda request: reply({'results': [
            {'url': 'javascript:alert(1)'}, {'url': 'http://127.0.0.1/admin'},
            {'url': 'https://example.com', 'content': 'x'*15000, 'summary': 'x'*5000},
        ]}), need_content=True)
        self.assertEqual(len(result['results']), 1)
        self.assertTrue(result['truncated'])
        self.assertLessEqual(len(result['results'][0]['content']), 12000)
        result = await self.search(lambda request: reply({'results': [{'url': 'https://example.com', 'content': 'not requested'}]}))
        self.assertEqual(result['results'][0]['content'], '')


class SearchAccountTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StudioStore(root/'state.db', root)
        self.user, _ = self.store.create_user('searchuser', 'testing123')
        self.other, _ = self.store.create_user('searchother', 'testing123')
        self.cap = ConsoleCapabilities(self.store)
        self.runtime = AgentScopeRuntime(self.store)
        self.runtime.capabilities = self.cap

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    def config(self, provider='deepseek', key='owned-secret', endpoint='https://api.deepseek.com', default=False):
        return self.store.create_model_setting(self.user.id, provider, provider, 'fixture-model', endpoint, key, default)

    def test_credentials_are_owned_and_not_taken_from_environment(self):
        foreign = self.store.create_model_setting(self.other.id, 'deepseek', 'foreign', 'fixture', 'https://api.deepseek.com', 'foreign-secret')
        with patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'server-secret'}), self.assertRaises(ValueError):
            web_search.resolve_search_key(self.store, self.user.id)
        with self.assertRaises(ValueError): web_search.resolve_search_key(self.store, self.user.id, foreign.id)
        owned = self.config()
        self.assertEqual(web_search.resolve_search_key(self.store, self.user.id, owned.id), 'owned-secret')
        self.store.delete_model_setting(self.user.id, owned.id)
        with self.assertRaises(ValueError): web_search.resolve_search_key(self.store, self.user.id, owned.id)

    def test_other_chat_model_can_use_unique_deepseek_config_but_ambiguity_is_rejected(self):
        active = self.config(provider='openai', endpoint='https://api.openai.com/v1', key='chat-secret')
        one = self.config()
        self.assertEqual(web_search.resolve_search_key(self.store, self.user.id, active.id), 'owned-secret')
        two = self.config(key='second-secret')
        with self.assertRaisesRegex(ValueError, '多份'): web_search.resolve_search_key(self.store, self.user.id, active.id)
        self.assertEqual(web_search.resolve_search_key(self.store, self.user.id, two.id), 'second-secret')
        self.store.set_default_model_setting(self.user.id, one.id)
        self.assertEqual(web_search.resolve_search_key(self.store, self.user.id, active.id), 'owned-secret')

    def test_custom_deepseek_endpoint_keys_are_never_sent_to_official_search(self):
        for endpoint in ['http://api.deepseek.com', 'https://proxy.example.com/v1', 'https://api.deepseek.com.evil.com', 'https://api.deepseek.com/custom']:
            self.assertFalse(web_search.official_deepseek('deepseek', endpoint))
        self.config(endpoint='https://proxy.example.com/v1')
        with self.assertRaisesRegex(ValueError, '官方'): web_search.resolve_search_key(self.store, self.user.id)

    async def test_runtime_registration_filters_tools_and_rechecks_current_key(self):
        self.cap.set_chat_agent(self.user.id, 'main-chat', 'main')
        model = ModelSettings(provider='openai', name='fixture', api_key='fixture')
        main = self.runtime._create_session('main-chat', model, 'fixture', self.user)
        self.assertIsNotNone(await main.agent.toolkit.get_tool('web_search'))
        agent = self.cap.save(self.user.id, {'kind': 'agent', 'name': 'searcher', 'content': 'Search.', 'config': {'tool_ids': ['web_search']}})
        self.cap.set_chat_agent(self.user.id, 'custom-chat', agent['id'])
        session = self.runtime._create_session('custom-chat', model, 'fixture', self.user)
        tool = await session.agent.toolkit.get_tool('web_search')
        with patch('service.runtime.search_web', AsyncMock(return_value={'results': []})) as search:
            result = await tool.call(query='test')
            self.assertIn('官方 API Key', result.content[0].text)
            search.assert_not_awaited()
            self.config()
            result = await tool.call(query='test')
            self.assertEqual(json.loads(result.content[0].text)['results'], [])
            search.assert_awaited_once_with('owned-secret', 'test', 5, False)
        self.cap.save(self.user.id, {**agent, 'config': {'tool_ids': []}}, agent['id'])
        self.cap.set_chat_agent(self.user.id, 'no-search', agent['id'])
        unconfigured = self.runtime._create_session('no-search', model, 'fixture', self.user)
        self.assertIsNone(await unconfigured.agent.toolkit.get_tool('web_search'))
