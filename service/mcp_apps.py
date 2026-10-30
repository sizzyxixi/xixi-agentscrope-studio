"""MCP Apps bridge data, scoped to the authenticated user and originating chat."""
import base64
import json
import uuid

import mcp.types as types
from agentscope.mcp import MCPClient
from agentscope.tool import MCPTool, ToolChunk
from agentscope.message import TextBlock, ToolResultState
from pydantic import PrivateAttr, TypeAdapter, ValidationError

from .mcp_protocol import HttpMCP, UI_MIME, ui_meta


class AppsTool(MCPTool):
    def __init__(self, client, definition):
        super().__init__(client.name, types.Tool.model_validate(definition), session=client)
        self.client = client
        self.definition = definition

    async def call(self, **kwargs):
        result = await self.client.protocol.request('tools/call', {'name': self.definition['name'], 'arguments': kwargs})
        blocks = []
        # Model receives public result fields only. Private _meta remains in the UI payload.
        for content in result.get('content', []):
            try:
                parsed = TypeAdapter(types.ContentBlock).validate_python(content)
                converted = self._convert_mcp_content_to_blocks([parsed])
            except (ValidationError, TypeError):
                converted = []
            blocks.extend(converted or [TextBlock(text=json.dumps(content, ensure_ascii=False))])
        if result.get('resultType') == 'input_required':
            blocks.append(TextBlock(text='MCP 服务需要补充输入；当前宿主未声明补充输入能力，本次操作未完成。'))
        if 'structuredContent' in result:
            blocks.append(TextBlock(text=json.dumps(result['structuredContent'], ensure_ascii=False)))
        if not blocks:
            blocks.append(TextBlock(text=json.dumps({'content': result.get('content', [])}, ensure_ascii=False)))
        metadata = {'mcpResult': result}
        uri = ui_meta(self.definition).get('resourceUri')
        if uri and uri.startswith('ui://') and self.client._apps and self.client._session_id:
            metadata['mcpApp'] = self.client._apps.save(self.client._user_id, self.client._session_id, self.client._resource_id, self.definition, kwargs, result)
        return ToolChunk(content=blocks, state=ToolResultState.ERROR if result.get('isError') or result.get('resultType') == 'input_required' else ToolResultState.RUNNING, metadata=metadata)


class AppsMCPClient(MCPClient):
    _protocol: object = PrivateAttr()
    _apps: object = PrivateAttr(default=None)
    _user_id: str = PrivateAttr(default='')
    _session_id: str = PrivateAttr(default='')
    _resource_id: str = PrivateAttr(default='')

    def bind(self, apps, user_id, session_id, resource_id, transport='auto'):
        self._protocol = HttpMCP(self.mcp_config.url, transport)
        self._apps, self._user_id, self._session_id, self._resource_id = apps, user_id, session_id, resource_id
        return self

    @property
    def protocol(self):
        return self._protocol

    async def list_raw_tools(self):
        return [types.Tool.model_validate(t) for t in await self.protocol.tools()]

    async def list_tools(self):
        return [AppsTool(self, t) for t in await self.protocol.tools() if 'model' in ui_meta(t).get('visibility', ['model', 'app'])]


class AppResults:
    def __init__(self, capabilities):
        self.capabilities = capabilities
        self.store = capabilities.store
        with self.store._lock:
            self.store._conn.execute('CREATE TABLE IF NOT EXISTS mcp_app_results (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL, resource_id TEXT NOT NULL, payload TEXT NOT NULL)')
            self.store._conn.commit()

    def save(self, user_id, session_id, resource_id, tool, arguments, result):
        identity = uuid.uuid4().hex
        with self.store._lock:
            self.store._conn.execute('INSERT INTO mcp_app_results VALUES (?,?,?,?,?)', (identity, user_id, session_id, resource_id, json.dumps({'tool': tool, 'arguments': arguments, 'result': result})))
            self.store._conn.commit()
        return {'id': identity}

    def context(self, user_id, identity):
        with self.store._lock:
            row = self.store._conn.execute('SELECT a.* FROM mcp_app_results a JOIN sessions s ON s.id=a.session_id AND s.user_id=a.user_id WHERE a.id=? AND a.user_id=?', (identity, user_id)).fetchone()
        if not row:
            raise ValueError('App result unavailable.')
        allowed = self.capabilities.mcp_clients(user_id, row['session_id'])
        if not any(client._resource_id == row['resource_id'] for client in allowed):
            raise ValueError('Connector no longer selected for this chat.')
        item = self.capabilities.get(user_id, row['resource_id'])
        if not item['enabled']:
            raise ValueError('Connector disabled.')
        return json.loads(row['payload']), HttpMCP(self.capabilities.mcp_url(user_id, item), item['config'].get('transport', 'auto'))

    async def load(self, user_id, identity):
        payload, client = self.context(user_id, identity)
        uri = ui_meta(payload['tool']).get('resourceUri', '')
        if not uri.startswith('ui://'):
            raise ValueError('Invalid App resource.')
        response = await client.request('resources/read', {'uri': uri})
        resource = next((r for r in response.get('contents', []) if r.get('uri') == uri and r.get('mimeType') == UI_MIME), None)
        if not resource:
            raise ValueError('MCP App HTML resource missing.')
        html = resource.get('text')
        if html is None:
            html = base64.b64decode(resource.get('blob', ''), validate=True).decode('utf-8')
        if len(html.encode()) > 5_000_000:
            raise ValueError('App resource too large.')
        return {**payload, 'html': html, 'ui': (resource.get('_meta') or {}).get('ui', {})}

    async def call(self, user_id, identity, name, arguments):
        payload, client = self.context(user_id, identity)
        tool = next((t for t in await client.tools() if t['name'] == name), None)
        if not tool or 'app' not in ui_meta(tool).get('visibility', ['model', 'app']):
            raise ValueError('Tool is not visible to this App.')
        # A durable intent record precedes execution. Never retry a possibly completed write.
        audit_id = self.save(user_id, self._session(user_id, identity), self._resource(user_id, identity), tool, arguments, {'status': 'executing'})['id']
        result = await client.request('tools/call', {'name': name, 'arguments': arguments})
        with self.store._lock:
            self.store._conn.execute('UPDATE mcp_app_results SET payload=? WHERE id=?', (json.dumps({'tool': tool, 'arguments': arguments, 'result': result}), audit_id))
            self.store._conn.commit()
        return result

    def _field(self, user_id, identity, field):
        with self.store._lock:
            return self.store._conn.execute('SELECT session_id,resource_id FROM mcp_app_results WHERE id=? AND user_id=?', (identity, user_id)).fetchone()[field]

    def _session(self, user_id, identity):
        return self._field(user_id, identity, 'session_id')

    def _resource(self, user_id, identity):
        return self._field(user_id, identity, 'resource_id')
