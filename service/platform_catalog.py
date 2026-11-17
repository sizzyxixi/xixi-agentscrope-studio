"""Platform agents backed by the official AgentScope SQL storage.

Only the one-time importer reads the legacy presets. Market reads use committed
Service records, including edits and deletions, without an account-local copy.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
from pathlib import Path

from agentscope.app.storage import AgentChatConfig, AgentData, AgentRecord, AsyncSQLAlchemyStorage
from sqlalchemy import Column, JSON, MetaData, String, Table, insert, select, update, inspect
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from sqlalchemy.schema import CreateSchema
from sqlalchemy.engine import make_url

from .agent_catalog import official_agents

PLATFORM_OWNER = 'xixi-platform'
CONFIG_SCHEMA = 'agentscope_config'
MIGRATION_KEY = 'platform-catalog-v1'
logger = logging.getLogger(__name__)
_metadata = MetaData()
_catalog_meta = Table('xixi_catalog_metadata', _metadata, Column('key', String(160), primary_key=True), Column('value', JSON, nullable=False))


def platform_admin_names() -> set[str]:
    return {name.strip().casefold() for name in os.getenv('AGENTSCOPE_PLATFORM_ADMIN_USERS', '').split(',') if name.strip()}


def is_platform_admin(user) -> bool:
    return bool(user and user.username.casefold() in platform_admin_names())


class PlatformCatalog:
    def __init__(self, store):
        self.store = store
        configured = os.getenv('DATABASE_URL') if store.backend == 'postgresql' else None
        self.path = store.db_path.parent / 'agentscope-service.sqlite3'
        self.postgres = bool(configured and str(configured).startswith(('postgres://', 'postgresql')))
        if configured:
            url = make_url(str(configured).replace('postgres://', 'postgresql://', 1))
            if self.postgres:
                url = url.set(drivername='postgresql+psycopg')
            elif url.drivername == 'sqlite':
                url = url.set(drivername='sqlite+aiosqlite')
            if url.drivername.startswith('sqlite') and url.database:
                self.path = Path(url.database)
        else:
            url = make_url(f'sqlite+aiosqlite:///{self.path}')
        self.url = url
        kwargs = {}
        if self.postgres:
            kwargs.update(pool_size=3, max_overflow=2, pool_pre_ping=True, pool_recycle=300)
            kwargs.update(execution_options={'schema_translate_map': {None: CONFIG_SCHEMA}}, connect_args={'prepare_threshold': None, 'connect_timeout': 15, 'application_name': 'xixi-agentscope-config', 'keepalives': 1, 'keepalives_idle': 10, 'keepalives_interval': 5, 'keepalives_count': 3, 'tcp_user_timeout': 20000, 'options': '-c statement_timeout=30000 -c idle_in_transaction_session_timeout=30000'})
        else:
            kwargs['poolclass'] = NullPool
            self.path.parent.mkdir(parents=True, exist_ok=True)
            kwargs['connect_args'] = {'timeout': 30}
        self.engine = create_async_engine(url, **kwargs)
        self.storage = AsyncSQLAlchemyStorage('', engine=self.engine)
        self.ready = False

    async def prepare_schema(self):
        async with self.engine.begin() as connection:
            if self.postgres:
                # PostgreSQL checks database CREATE privilege even for
                # CREATE SCHEMA IF NOT EXISTS when the schema already exists.
                # Preprovisioned deployments use a restricted runtime role.
                exists = await connection.run_sync(lambda sync: inspect(sync).has_schema(CONFIG_SCHEMA))
                if not exists:
                    await connection.execute(CreateSchema(CONFIG_SCHEMA, if_not_exists=True))
            await connection.run_sync(_metadata.create_all)

    async def _meta(self, key):
        async with self.engine.connect() as connection:
            return (await connection.execute(select(_catalog_meta.c.value).where(_catalog_meta.c.key == key))).scalar_one_or_none()

    async def _save_meta(self, key, value):
        async with self.engine.begin() as connection:
            exists = (await connection.execute(select(_catalog_meta.c.key).where(_catalog_meta.c.key == key))).scalar_one_or_none()
            await connection.execute(update(_catalog_meta).where(_catalog_meta.c.key == key).values(value=value) if exists else insert(_catalog_meta).values(key=key, value=value))

    async def seed(self):
        """Idempotent once-only migration; startup never restores deleted agents."""
        if await self._meta(MIGRATION_KEY):
            self.ready = True
            return []
        from .runtime import MAIN_AGENT_NAME, load_main_persona
        presets = [{'id': 'main', 'name': MAIN_AGENT_NAME, 'content': load_main_persona(), 'config': {'avatar': '✦', 'description': '通用任务助手', 'max_iters': 8, 'context_trigger': .75}}, *official_agents()]
        migrated = []
        for preset in presets:
            identity = preset['id']
            if await self.storage.get_agent(PLATFORM_OWNER, identity) is None:
                config = preset['config']
                chat = AgentChatConfig.model_validate({'context_config': {'trigger_ratio': config.get('context_trigger', .75), 'reserve_ratio': .1}, 'react_config': {'max_iters': config.get('max_iters', 8), 'stop_on_reject': False, 'interruption_raise_cancelled_error': True}, 'invite_config': {'invite_description': config.get('description', '')}})
                await self.storage.upsert_agent(PLATFORM_OWNER, AgentRecord(id=identity, user_id=PLATFORM_OWNER, data=AgentData(id=identity, name=preset['name'], system_prompt=preset['content'], chat_config=chat)))
                migrated.append(identity)
                logger.info('Imported platform agent %s', identity)
            if await self._meta(identity) is None:
                await self._save_meta(identity, {'name': preset['name'], 'config': preset['config']})
        await self._save_meta(MIGRATION_KEY, {'ids': [preset['id'] for preset in presets], 'source': 'legacy-platform-market', 'agentscope': '2.0.11'})
        self.ready = True
        return migrated

    def _rows(self, table: str, columns: str, where: str = '', params=()):
        # table/columns are constants owned by this module, never request input.
        if not self.ready:
            raise ValueError('平台智能体配置正在初始化，请稍后重试。')
        if self.postgres:
            with self.store._lock:
                return self.store._conn.execute(f'SELECT {columns} FROM {CONFIG_SCHEMA}.{table} {where}', params).fetchall()
        with sqlite3.connect(self.path, timeout=30) as connection:
            connection.row_factory = sqlite3.Row
            return connection.execute(f'SELECT {columns} FROM {table} {where}', params).fetchall()

    def profiles(self) -> list[dict]:
        meta = {row['key']: json.loads(row['value']) if isinstance(row['value'], str) else row['value'] for row in self._rows('xixi_catalog_metadata', 'key,value')}
        result = []
        for row in self._rows('agents', 'id,payload,updated_at', "WHERE user_id=? AND source='user' ORDER BY created_at,id", (PLATFORM_OWNER,)):
            payload = json.loads(row['payload']) if isinstance(row['payload'], str) else row['payload']
            data = payload['data']; chat = data.get('chat_config') or {}; identity = row['id']; previous = meta.get(identity, {})
            config = dict(previous.get('config', {}))
            if data['name'] != previous.get('name'):
                config.pop('name_en', None)
            description = chat.get('invite_config', {}).get('invite_description') or ''
            if description != config.get('description'):
                config.pop('description_en', None)
            config.update(description=description, max_iters=chat.get('react_config', {}).get('max_iters', 8), context_trigger=chat.get('context_config', {}).get('trigger_ratio', .75), chat_config=chat, platform_managed=True, config_revision=str(row['updated_at']))
            config.setdefault('avatar', '✦')
            if identity != 'main':
                config.setdefault('tool_ids', ['read_file', 'create_file', 'convert_file', 'package_files', 'search_documents', 'workspace_write_plan'])
            result.append({'id': identity, 'kind': 'agent', 'name': data['name'], 'content': data['system_prompt'], 'enabled': True, 'builtin': True, 'config': config})
        return result

    async def close(self):
        self.ready = False
        await self.engine.dispose()
