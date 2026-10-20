import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx

from service import web_fetch
from service.capabilities import ConsoleCapabilities
from service.runtime import AgentScopeRuntime, ModelSettings
from service.store import StudioStore


class Body(httpx.AsyncByteStream):
    def __init__(self, chunks): self.chunks = chunks
    async def __aiter__(self):
        for chunk in self.chunks: yield chunk


def response(body=b'', status=200, content_type='text/html; charset=utf-8', **headers):
    return httpx.Response(status, headers={'content-type': content_type, **headers}, stream=Body([body]))


class WebFetchTests(unittest.IsolatedAsyncioTestCase):
    async def fetch(self, handler, url='https://example.com/page', **kwargs):
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler), trust_env=False)
        with patch.object(web_fetch.httpx, 'AsyncClient', return_value=client), patch.object(web_fetch, 'resolve_public', AsyncMock(return_value='93.184.216.34')):
            return await web_fetch.fetch_webpage(url, **kwargs)

    def test_rejects_unsafe_urls(self):
        for url in ['file:///etc/passwd', 'ftp://example.com', 'https://user:password@example.com',
                    'http://127.0.0.1', 'http://10.1.1.1', 'http://169.254.169.254/latest/meta-data',
                    'http://100.100.100.200', 'http://[::1]', 'http://[::ffff:127.0.0.1]',
                    'http://[64:ff9b::7f00:1]', 'http://localhost.', 'http://service.internal',
                    'http://example.com:8790', 'http://server', 'https://example.com\r\nHost: localhost']:
            with self.subTest(url=url), self.assertRaises(ValueError): web_fetch.validate_url(url)

    async def test_rejects_private_or_mixed_dns_answers(self):
        resolver = asyncio.get_running_loop()
        for addresses in [['127.0.0.1'], ['93.184.216.34', '10.0.0.1']]:
            answers = [(2, 1, 6, '', (address, 443)) for address in addresses]
            with patch.object(resolver, 'getaddrinfo', AsyncMock(return_value=answers)), self.assertRaises(ValueError):
                await web_fetch.resolve_public('example.com', 443)

    async def test_extracts_html_and_pins_connection_with_original_host_and_sni(self):
        def handler(request):
            self.assertEqual(request.url.host, '93.184.216.34')
            self.assertEqual(request.headers['host'], 'example.com')
            self.assertEqual(request.extensions['sni_hostname'], 'example.com')
            self.assertNotIn('cookie', request.headers)
            self.assertNotIn('authorization', request.headers)
            return response('<title>示例</title><main><h1>标题</h1><p>正文</p><script>secret script</script></main>'.encode())
        result = await self.fetch(handler)
        self.assertEqual(result['title'], '示例')
        self.assertEqual(result['content'], '标题\n正文')
        self.assertNotIn('script', result['content'])
        self.assertEqual(result['url'], 'https://example.com/page')
        self.assertTrue(result['untrusted_content'])

    async def test_revalidates_redirects_and_does_not_send_cookies(self):
        calls = []
        def handler(request):
            calls.append(request)
            self.assertNotIn('cookie', request.headers)
            return response(status=302, location='/final', **{'set-cookie': 'private=secret; Path=/'}) if len(calls) == 1 else response(b'<main>done</main>')
        result = await self.fetch(handler)
        self.assertEqual(result['url'], 'https://example.com/final')
        self.assertEqual(len(calls), 2)
        with self.assertRaises(ValueError):
            await self.fetch(lambda request: response(status=302, location='http://127.0.0.1/admin'))

    async def test_redirect_dns_is_checked_again(self):
        client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: response(status=302, location='https://private.example.com')))
        dns = AsyncMock(side_effect=['93.184.216.34', ValueError('blocked private IP')])
        with patch.object(web_fetch.httpx, 'AsyncClient', return_value=client), patch.object(web_fetch, 'resolve_public', dns), self.assertRaises(ValueError):
            await web_fetch.fetch_webpage('https://example.com')
        self.assertEqual(dns.await_count, 2)

    async def test_text_pagination(self):
        result = await self.fetch(lambda request: response(b'abcdefghij', content_type='text/plain'), offset=2, limit=4)
        self.assertEqual(result['content'], 'cdef')
        self.assertEqual(result['next_offset'], 6)
        self.assertEqual(result['total_characters'], 10)
        with self.assertRaises(ValueError): await web_fetch.fetch_webpage('https://example.com', limit=24001)

    async def test_errors_binary_large_and_compressed_content_are_rejected(self):
        cases = [lambda request: response(status=403),
                 lambda request: response(b'%PDF', content_type='application/pdf'),
                 lambda request: response(b'x', **{'content-length': str(web_fetch.MAX_BYTES + 1)}),
                 lambda request: response(b'x' * (web_fetch.MAX_BYTES + 1), content_type='text/plain'),
                 lambda request: response(b'compressed', **{'content-encoding': 'gzip'}),
                 lambda request: response(b'<script>only javascript</script>')]
        for handler in cases:
            with self.subTest(handler=handler), self.assertRaises(ValueError): await self.fetch(handler)

    async def test_redirect_limit_and_network_timeout(self):
        with self.assertRaisesRegex(ValueError, '重定向'):
            await self.fetch(lambda request: response(status=302, location='/loop'))
        def timeout(request): raise httpx.ReadTimeout('test timeout', request=request)
        with self.assertRaisesRegex(ValueError, '超时'): await self.fetch(timeout)


class WebFetchRegistrationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StudioStore(root / 'state.db', root)
        self.cap = ConsoleCapabilities(self.store)
        self.user, _ = self.store.create_user('webreader', 'testing123')
        self.runtime = AgentScopeRuntime(self.store)
        self.runtime.capabilities = self.cap

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    async def test_default_and_configured_agents_have_tool_but_unconfigured_agent_does_not(self):
        model = ModelSettings(provider='openai', name='fixture', api_key='fixture')
        self.cap.set_chat_agent(self.user.id, 'default', 'main')
        default = self.runtime._create_session('default', model, 'fixture', self.user)
        self.assertIsNotNone(await default.agent.toolkit.get_tool('web_fetch'))
        agent = self.cap.save(self.user.id, {'kind': 'agent', 'name': 'reader', 'content': 'Read public pages.', 'config': {'tool_ids': ['web_fetch']}})
        self.cap.set_chat_agent(self.user.id, 'configured', agent['id'])
        session = self.runtime._create_session('configured', model, 'fixture', self.user)
        tool = await session.agent.toolkit.get_tool('web_fetch')
        self.assertIsNotNone(tool)
        with patch('service.runtime.fetch_webpage', AsyncMock(return_value={'content': 'page', 'url': 'https://example.com'})) as fetch:
            result = await tool.call(url='https://example.com')
            self.assertEqual(json.loads(result.content[0].text)['content'], 'page')
            fetch.assert_awaited_once()
        self.cap.save(self.user.id, {**agent, 'config': {'tool_ids': []}}, agent['id'])
        self.cap.set_chat_agent(self.user.id, 'unconfigured', agent['id'])
        other = self.runtime._create_session('unconfigured', model, 'fixture', self.user)
        self.assertIsNone(await other.agent.toolkit.get_tool('web_fetch'))
        scope = self.cap.session_config(self.user.id, 'configured')
        self.cap.set_session_config(self.user.id, 'configured', {**scope, 'agent_config': {**scope['agent_config'], 'tool_ids': []}})
        with patch('service.runtime.fetch_webpage', AsyncMock()) as fetch:
            result = await tool.call(url='https://example.com')
            self.assertIn('未配置', result.content[0].text)
            fetch.assert_not_awaited()
