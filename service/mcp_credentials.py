"""Encrypted personal MCP URLs. Public resource configuration contains no credential URL."""
import os
from pathlib import Path
from urllib.parse import urlparse

from cryptography.fernet import Fernet, InvalidToken


class McpCredentials:
    def __init__(self, store):
        self.store = store
        self._cipher = None
        with store._lock:
            store._conn.execute('CREATE TABLE IF NOT EXISTS mcp_connector_secrets (resource_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, cipher TEXT NOT NULL)')
            store._conn.commit()

    def cipher(self):
        if self._cipher is None:
            key = os.getenv('AGENTSCOPE_MCP_KEY')
            if not key:
                if self.store.backend == 'postgresql':
                    raise ValueError('请先配置服务端 AGENTSCOPE_MCP_KEY，再保存飞书连接。')
                path = Path(self.store.db_path).parent / 'mcp.key'
                if not path.exists():
                    try:
                        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    except FileExistsError:
                        pass
                    else:
                        with os.fdopen(fd, 'wb') as output:
                            output.write(Fernet.generate_key())
                key = path.read_bytes()
            try:
                self._cipher = Fernet(key)
            except (ValueError, TypeError):
                raise ValueError('MCP 加密密钥无效，请检查 AGENTSCOPE_MCP_KEY。') from None
        return self._cipher

    def encrypt_url(self, url):
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname != 'mcp.feishu.cn' or parsed.username or parsed.password or parsed.port not in (None, 443) or parsed.fragment or parsed.path in ('', '/') or any(char.isspace() for char in url) or len(url) > 16384:
            raise ValueError('请填写飞书 MCP 平台生成的完整 HTTPS 服务地址（mcp.feishu.cn）。')
        return self.cipher().encrypt(url.encode()).decode()

    def url(self, user_id, resource_id):
        with self.store._lock:
            row = self.store._conn.execute('SELECT cipher FROM mcp_connector_secrets WHERE resource_id=? AND user_id=?', (resource_id, user_id)).fetchone()
        if not row:
            raise ValueError('尚未配置飞书 MCP 服务地址，请在连接器设置中填写。')
        try:
            return self.cipher().decrypt(row['cipher'].encode()).decode()
        except InvalidToken:
            raise ValueError('无法解密飞书连接，请恢复原加密密钥或重新填写服务地址。') from None
