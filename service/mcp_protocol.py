"""Dual-era HTTP MCP transport. No dependency override of AgentScope's MCP SDK."""
from __future__ import annotations

import base64
import json
import logging
import re
from urllib.parse import urlparse
import uuid
from contextlib import asynccontextmanager

import httpx
import mcp.types as types
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamable_http_client

CORE_VERSION = '2026-07-28'
APPS_VERSION = '2026-01-26'
UI_MIME = 'text/html;profile=mcp-app'
CAPABILITIES = {'extensions': {'io.modelcontextprotocol/ui': {'mimeTypes': [UI_MIME]}}}

class _RedactFeishuURL(logging.Filter):
    def filter(self, record):
        def redact(text):
            return re.sub(r'https://mcp\.feishu\.cn[^\s\x22\x27]*', 'https://mcp.feishu.cn/[redacted]', text, flags=re.I)
        record.msg = redact(record.getMessage())
        record.args = ()
        if record.exc_info:
            record.exc_text = redact(logging.Formatter().formatException(record.exc_info))
        if record.stack_info:
            record.stack_info = redact(record.stack_info)
        return True


for _logger in ('httpx', 'httpcore', 'mcp.client.streamable_http', 'mcp.client.sse'):
    logging.getLogger(_logger).addFilter(_RedactFeishuURL())



class ProtocolError(ValueError):
    def __init__(self, error):
        self.error = error
        super().__init__(str(error.get('message', 'MCP request failed')))


class AppsSession(ClientSession):
    async def send_request(self, request, *args, **kwargs):
        if isinstance(request.root, types.InitializeRequest):
            request.root.params.capabilities = types.ClientCapabilities.model_validate(CAPABILITIES)
        return await super().send_request(request, *args, **kwargs)


def header_value(value):
    value = str(value).lower() if isinstance(value, bool) else str(value)
    if value.strip() != value or any(ord(c) < 32 or ord(c) > 126 for c in value) or (value.startswith('=?base64?') and value.endswith('?=')):
        return '=?base64?' + base64.b64encode(value.encode()).decode() + '?='
    return value


class HttpMCP:
    def __init__(self, url, transport='auto', http_transport=None):
        self.url = url
        self.transport = transport
        self.version = None
        self.http_transport = http_transport
        self.schemas = {}

    async def modern(self, method, params):
        params = {**params, '_meta': {
            'io.modelcontextprotocol/protocolVersion': CORE_VERSION,
            'io.modelcontextprotocol/clientInfo': {'name': 'XIXI', 'version': '0.1.0'},
            'io.modelcontextprotocol/clientCapabilities': CAPABILITIES,
        }}
        headers = {'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': CORE_VERSION, 'Mcp-Method': method}
        name = params.get('name', params.get('uri'))
        if name is not None:
            headers['Mcp-Name'] = header_value(name)
        if method == 'tools/call':
            schema = self.schemas.get(params['name'])
            if schema is None:
                await self.tools()
                schema = self.schemas.get(params['name'], {})
            for path, header in schema_headers(schema):
                value = params.get('arguments', {})
                for key in path:
                    value = value.get(key) if isinstance(value, dict) else None
                if value is not None:
                    headers['Mcp-Param-' + header] = header_value(value)
        identity = uuid.uuid4().hex
        async with httpx.AsyncClient(timeout=30, transport=self.http_transport) as client:
            async with client.stream('POST', self.url, json={'jsonrpc': '2.0', 'id': identity, 'method': method, 'params': params}, headers=headers) as response:
                if 'text/event-stream' in response.headers.get('content-type', ''):
                    data = []
                    async for line in response.aiter_lines():
                        if line.startswith('data:'):
                            data.append(line[5:].lstrip())
                        elif not line and data:
                            message = json.loads('\n'.join(data)); data = []
                            if message.get('id') == identity and ('result' in message or 'error' in message):
                                return response.status_code, message
                    raise ValueError('MCP stream ended without a result; execution outcome may be unknown.')
                body = await response.aread()
                try:
                    message = json.loads(body)
                except ValueError:
                    message = {}
                if 'result' in message and message.get('id') != identity:
                    raise ValueError('MCP response ID does not match request.')
                return response.status_code, message

    async def detect(self):
        if self.version:
            return
        if self.transport == 'sse' or urlparse(self.url).path.rstrip('/').endswith('/sse'):
            self.transport = 'sse'
            self.version = 'legacy'; return
        status, message = await self.modern('server/discover', {})
        error = message.get('error', {})
        if status in (401, 403):
            raise ValueError('MCP authentication required.')
        if error.get('code') == -32022:
            supported = error.get('data', {}).get('supported', [])
            if CORE_VERSION not in supported:
                if any(v in supported for v in ('2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05')):
                    self.version = 'legacy'; return
                raise ProtocolError(error)
        if error.get('code') in (-32020, -32021, -32022) or (error.get('code') == -32601 and status == 404) or (status < 300 and 'result' in message):
            if error and error.get('code') != -32601:
                raise ProtocolError(error)
            self.version = CORE_VERSION; return
        if status in (400, 404, 405) or error.get('code') == -32601:
            self.version = 'legacy'; return
        raise ValueError('MCP discovery failed; no automatic retry of tool calls.')

    @asynccontextmanager
    async def legacy(self):
        manager = sse_client(self.url, timeout=30) if self.transport == 'sse' else streamable_http_client(self.url)
        async with manager as streams:
            async with AppsSession(streams[0], streams[1]) as session:
                result = await session.initialize()
                self.legacy_version = result.protocolVersion
                yield session

    async def request(self, method, params=None):
        try:
            return await self._request(method, params)
        except Exception:
            if urlparse(self.url).hostname == 'mcp.feishu.cn':
                raise ValueError('飞书 MCP 请求失败，请检查服务授权是否过期、已授权工具和网络。') from None
            raise

    async def _request(self, method, params=None):
        await self.detect()
        params = params or {}
        if self.version == CORE_VERSION:
            status, message = await self.modern(method, params)
            if 'error' in message:
                raise ProtocolError(message['error'])
            if status >= 300 or 'result' not in message:
                raise ValueError('MCP request failed; execution outcome may be unknown.')
            return message['result']
        async with self.legacy() as session:
            request = types.ClientRequest.model_validate({'method': method, 'params': params})
            # Generic result avoids losing new fields and structuredContent scalar values.
            result = await session.send_request(request, types.Result)
            return result.model_dump(by_alias=True, exclude_none=False)

    async def tools(self):
        tools, seen, cursor = [], set(), None
        while True:
            result = await self.request('tools/list', {'cursor': cursor} if cursor else {})
            for tool in result.get('tools', []):
                try:
                    schema_headers(tool.get('inputSchema', {}))
                except ValueError:
                    continue
                self.schemas[tool['name']] = tool.get('inputSchema', {})
                tools.append(tool)
            cursor = result.get('nextCursor')
            if not cursor:
                return tools
            if cursor in seen or len(tools) > 10000:
                raise ValueError('Invalid MCP pagination.')
            seen.add(cursor)


def ui_meta(tool):
    meta = tool.get('_meta') or {}
    return {**({'resourceUri': meta['ui/resourceUri']} if meta.get('ui/resourceUri') else {}), **(meta.get('ui') or {})}


def schema_headers(schema):
    headers, used = [], set()

    def walk(node, path=(), reachable=True):
        if not isinstance(node, dict):
            return
        if 'x-mcp-header' in node:
            name = node['x-mcp-header']
            if not reachable or not path or not isinstance(name, str) or not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name) or name.lower() in used or node.get('type') not in ('string', 'integer', 'boolean'):
                raise ValueError('Invalid MCP header annotation')
            used.add(name.lower()); headers.append((path, name))
        for key, value in node.items():
            if key == 'properties' and isinstance(value, dict):
                for prop, child in value.items():
                    walk(child, (*path, prop), reachable)
            elif isinstance(value, dict):
                walk(value, path, False)
            elif isinstance(value, list):
                for child in value:
                    walk(child, path, False)
    walk(schema)
    return headers
