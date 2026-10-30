import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from agentscope.mcp import HttpMCPConfig
from service.mcp_protocol import HttpMCP, CORE_VERSION, ProtocolError, schema_headers, header_value
from service.mcp_apps import AppsMCPClient
from service.capabilities import ConsoleCapabilities
from service.store import StudioStore


class ProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def test_modern_json_metadata_pagination_and_private_result(self):
        calls = []
        def handler(request):
            body = json.loads(request.content); calls.append(body)
            self.assertEqual(request.headers['mcp-protocol-version'], CORE_VERSION)
            self.assertEqual(body['params']['_meta']['io.modelcontextprotocol/protocolVersion'], CORE_VERSION)
            self.assertNotIn('mcp-session-id', request.headers)
            if body['method'] == 'server/discover': result = {'capabilities': {}}
            elif body['method'] == 'tools/list':
                result = {'tools': [{'name': 'chart', 'inputSchema': {'type': 'object', 'properties': {'city': {'type': 'string', 'x-mcp-header': 'City'}}}, '_meta': {'ui': {'resourceUri': 'ui://chart'}}}]}
            else:
                self.assertEqual(request.headers['mcp-param-city'], header_value('杭州'))
                result = {'content': [{'type': 'text', 'text': 'public'}], 'structuredContent': [1, None], '_meta': {'secret': 'private'}}
            return httpx.Response(200, json={'jsonrpc': '2.0', 'id': body['id'], 'result': result})
        protocol = HttpMCP('https://example.test/mcp', http_transport=httpx.MockTransport(handler))
        client = AppsMCPClient(name='test', is_stateful=False, mcp_config=HttpMCPConfig(url=protocol.url)).bind(None, '', '', '')
        client._protocol = protocol
        tools = await client.list_tools()
        chunk = await tools[0].call(city='杭州')
        self.assertIn('private', json.dumps(chunk.metadata))
        self.assertNotIn('private', str(chunk.content))
        self.assertEqual(chunk.metadata['mcpResult']['structuredContent'], [1, None])
        self.assertEqual(len([c for c in calls if c['method'] == 'server/discover']), 1)

    async def test_sse_notification_then_result(self):
        def handler(request):
            body = json.loads(request.content)
            result = {'content': [], 'structuredContent': None}
            return httpx.Response(200, headers={'content-type': 'text/event-stream'}, text=': keepalive\n\ndata: '+json.dumps({'jsonrpc': '2.0', 'method': 'notifications/progress', 'params': {}})+'\n\ndata: '+json.dumps({'jsonrpc': '2.0', 'id': body['id'], 'result': result})+'\n\n')
        client = HttpMCP('https://example.test/mcp', http_transport=httpx.MockTransport(handler)); client.version = CORE_VERSION
        self.assertIsNone((await client.request('tools/call', {'name': 'x', 'arguments': {}}))['structuredContent'])

    async def test_auth_and_modern_errors_never_downgrade(self):
        for status, body in [(401, {}), (400, {'error': {'code': -32020, 'message': 'header mismatch'}}), (400, {'error': {'code': -32022, 'data': {'supported': ['2099-01-01']}}})]:
            client = HttpMCP('https://example.test/mcp', http_transport=httpx.MockTransport(lambda r: httpx.Response(status, json=body)))
            with self.assertRaises(ValueError): await client.detect()
            self.assertIsNone(client.version)

    async def test_legacy_detect_and_no_tool_retry(self):
        client = HttpMCP('https://example.test/mcp', http_transport=httpx.MockTransport(lambda r: httpx.Response(400, text='initialize first')))
        await client.detect(); self.assertEqual(client.version, 'legacy')
        client = HttpMCP('https://example.test/mcp', http_transport=httpx.MockTransport(lambda r: httpx.Response(500, text='failed'))); client.version = CORE_VERSION
        with self.assertRaises(ValueError): await client.request('tools/call', {'name': 'write'})

    def test_schema_header_validation(self):
        with self.assertRaises(ValueError): schema_headers({'properties': {'x': {'type': 'string', 'x-mcp-header': 'bad\r\n'}}})
        with self.assertRaises(ValueError): schema_headers({'items': {'type': 'string', 'x-mcp-header': 'Name'}})
        self.assertTrue(header_value('=?base64?literal?=').startswith('=?base64?PT'))

    async def test_app_only_tools_hidden(self):
        client = AppsMCPClient(name='test', is_stateful=False, mcp_config=HttpMCPConfig(url='https://example.test')).bind(None, '', '', '')
        client._protocol.tools = AsyncMock(return_value=[{'name': 'hidden', 'inputSchema': {}, '_meta': {'ui': {'visibility': ['app']}}}])
        self.assertEqual(await client.list_tools(), [])


class AppScopeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(); root = Path(self.temp.name)
        self.store = StudioStore(root/'state.db', root)
        self.cap = ConsoleCapabilities(self.store, install_defaults=False)
        self.user, _ = self.store.create_user('tester', 'testing123')
        self.other, _ = self.store.create_user('otheruser', 'testing456')
        self.store.ensure_session('chat', self.user.id)
        self.resource = self.cap.save(self.user.id, {'kind': 'mcp', 'name': 'connector', 'enabled': True, 'config': {'url': 'https://example.test/mcp'}})
        self.apps = self.cap.mcp_apps()
        self.id = self.apps.save(self.user.id, 'chat', self.resource['id'], {'name': 'chart', '_meta': {'ui': {'resourceUri': 'ui://chart'}}}, {}, {'structuredContent': None})['id']

    async def asyncTearDown(self):
        self.store._conn.close(); self.temp.cleanup()

    async def test_cross_user_disabled_and_removed_scope(self):
        with self.assertRaises(ValueError): self.apps.context(self.other.id, self.id)
        self.apps.context(self.user.id, self.id)
        self.cap.set_session_config(self.user.id, 'chat', {'mcp_ids': []})
        with self.assertRaises(ValueError): self.apps.context(self.user.id, self.id)

    async def test_resource_mime_and_blob(self):
        with patch.object(HttpMCP, 'request', AsyncMock(return_value={'contents': [{'uri': 'ui://chart', 'mimeType': 'text/html;profile=mcp-app', 'blob': 'PGgxPk9LPC9oMT4='}]})):
            loaded = await self.apps.load(self.user.id, self.id)
        self.assertEqual(loaded['html'], '<h1>OK</h1>')
        self.assertIsNone(loaded['result']['structuredContent'])
        with patch.object(HttpMCP, 'request', AsyncMock(return_value={'contents': [{'uri': 'ui://chart', 'mimeType': 'text/html', 'text': 'unsafe'}]})):
            with self.assertRaises(ValueError): await self.apps.load(self.user.id, self.id)

    async def test_model_only_app_call_denied(self):
        with patch.object(HttpMCP, 'tools', AsyncMock(return_value=[{'name': 'secret', '_meta': {'ui': {'visibility': ['model']}}}])):
            with self.assertRaises(ValueError): await self.apps.call(self.user.id, self.id, 'secret', {})


class LegacyWireTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_legacy_handshake_apps_capabilities_and_results(self):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from threading import Thread
        requests = []
        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'
            def log_message(self, *_): pass
            def do_GET(self):
                self.send_response(405); self.send_header('Content-Length', '0'); self.end_headers()
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                requests.append(body)
                if body['method'] == 'server/discover':
                    status, data = 400, {'error': {'code': -32600, 'message': 'Initialize first'}}
                elif body['method'] == 'initialize':
                    status, data = 200, {'jsonrpc': '2.0', 'id': body['id'], 'result': {'protocolVersion': '2025-11-25', 'capabilities': {'tools': {}, 'resources': {}}, 'serverInfo': {'name': 'fixture', 'version': '1'}}}
                elif body['method'] == 'notifications/initialized':
                    self.send_response(202); self.send_header('Content-Length', '0'); self.end_headers(); return
                else:
                    status, data = 200, {'jsonrpc': '2.0', 'id': body['id'], 'result': {'content': [{'type': 'text', 'text': 'legacy'}], 'structuredContent': None, '_meta': {'ui': 'private'}}}
                encoded = json.dumps(data).encode()
                self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(encoded))); self.end_headers(); self.wfile.write(encoded)
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            client = HttpMCP(f'http://127.0.0.1:{server.server_port}/mcp')
            result = await client.request('tools/call', {'name': 'legacy', 'arguments': {}})
            self.assertEqual(result['_meta'], {'ui': 'private'})
            self.assertIn('structuredContent', result)
            self.assertIsNone(result['structuredContent'])
            handshake = next(r for r in requests if r['method'] == 'initialize')
            self.assertIn('io.modelcontextprotocol/ui', handshake['params']['capabilities']['extensions'])
            self.assertEqual(len([r for r in requests if r['method'] == 'tools/call']), 1)
        finally:
            import asyncio
            await asyncio.to_thread(server.shutdown)
            server.server_close(); thread.join(timeout=2)
