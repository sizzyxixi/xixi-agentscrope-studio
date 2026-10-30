import json
import logging
import sys
import unittest
from unittest.mock import patch, AsyncMock

from tests.test_console import StoreFixture
from service.mcp_protocol import HttpMCP, _RedactFeishuURL


class FeishuMcpTests(StoreFixture, unittest.TestCase):
    def setUp(self):
        self.create_store()
        self.url = 'https://mcp.feishu.cn/mcp/sensitive-personal-token?ticket=private'

    def tearDown(self): self.clean_store()

    def create(self, **config):
        return self.resource('mcp', enabled=False, config={'provider': 'feishu', 'url': self.url, **config})

    def test_encrypted_storage_no_public_url_and_runtime_resolution(self):
        item = self.create()
        public = json.dumps(self.cap.list(self.user.id, 'mcp'))
        self.assertNotIn('sensitive-personal-token', public)
        self.assertNotIn('private', public)
        self.assertNotIn('url', item['config'])
        with self.store._lock:
            raw = self.store._conn.execute('SELECT cipher FROM mcp_connector_secrets WHERE resource_id=?', (item['id'],)).fetchone()['cipher']
        self.assertNotIn('sensitive-personal-token', raw)
        self.assertEqual(self.cap.mcp_url(self.user.id, item), self.url)
        self.cap.save(self.user.id, {**item, 'enabled': True}, item['id'])
        self.assertEqual(self.cap.mcp_clients(self.user.id)[0].mcp_config.url, self.url)

    def test_edit_preserves_or_replaces_and_delete_removes_secret(self):
        item = self.create()
        edited = self.cap.save(self.user.id, {**item, 'name': 'Renamed', 'config': {**item['config'], 'url': ''}}, item['id'])
        self.assertEqual(self.cap.mcp_url(self.user.id, edited), self.url)
        new_url = 'https://mcp.feishu.cn/mcp/new-personal-token'
        edited = self.cap.save(self.user.id, {**edited, 'config': {**edited['config'], 'url': new_url}}, edited['id'])
        self.assertEqual(self.cap.mcp_url(self.user.id, edited), new_url)
        self.cap.delete(self.user.id, edited['id'])
        with self.assertRaises(ValueError): self.cap.mcp_credentials().url(self.user.id, edited['id'])

    def test_cross_user_secret_lookup_and_provider_tampering(self):
        item = self.create()
        with self.assertRaises(ValueError): self.cap.mcp_credentials().url(self.other.id, item['id'])
        with self.assertRaises(ValueError): self.cap.save(self.user.id, {**item, 'config': {'provider': 'generic', 'url': 'https://example.test/mcp'}}, item['id'])
        with self.assertRaises(ValueError): self.resource('mcp', config={'url': self.url})

    def test_reject_invalid_or_missing_urls(self):
        for url in ('', 'http://mcp.feishu.cn/mcp/x', 'https://mcp.feishu.cn.evil.test/mcp/x', 'https://user:password@mcp.feishu.cn/mcp/x', 'https://open.feishu.cn/document/x', 'https://mcp.feishu.cn/mcp/x#token', 'https://mcp.feishu.cn:123/mcp/x'):
            with self.subTest(url=url), self.assertRaises(ValueError): self.create(url=url)
        self.assertEqual(self.cap.list(self.user.id, 'mcp'), [])

    def test_logs_redact_personal_link(self):
        record = logging.LogRecord('httpx', logging.INFO, '', 1, 'HTTP Request %s', (self.url,), None)
        _RedactFeishuURL().filter(record)
        self.assertNotIn('sensitive-personal-token', record.getMessage())
        self.assertNotIn('ticket', record.getMessage())
        try:
            raise RuntimeError(self.url)
        except RuntimeError:
            record = logging.LogRecord('mcp.client.streamable_http', logging.ERROR, '', 1, 'Request failed', (), sys.exc_info())
        _RedactFeishuURL().filter(record)
        self.assertNotIn('sensitive-personal-token', logging.Formatter().format(record))


class FeishuRequestTests(unittest.IsolatedAsyncioTestCase):
    async def test_errors_do_not_echo_secret_url(self):
        url = 'https://mcp.feishu.cn/mcp/private-token'
        client = HttpMCP(url)
        with patch.object(client, '_request', AsyncMock(side_effect=RuntimeError(url))):
            with self.assertRaisesRegex(ValueError, '飞书 MCP 请求失败') as error:
                await client.request('tools/list')
        self.assertNotIn('private-token', str(error.exception))

    async def test_legacy_method_not_found_uses_initialization(self):
        client = HttpMCP('https://mcp.feishu.cn/mcp/private-token')
        with patch.object(client, 'modern', AsyncMock(return_value=(200, {'error': {'code': -32601, 'message': 'Method not found'}}))):
            await client.detect()
        self.assertEqual(client.version, 'legacy')
