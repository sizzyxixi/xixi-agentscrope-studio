"""Provision a requested administrator without logging tokens or passwords.

Run after configuring AGENTSCOPE_PLATFORM_ADMIN_USERS. Password comes from
getpass, never command-line arguments, source code, defaults or logs.
"""
import asyncio
import getpass
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv
load_dotenv()
from service.store import StudioStore
from service.platform_catalog import PlatformCatalog, platform_admin_names


def ensure_admin(store, username, password):
    if username.casefold() not in platform_admin_names():
        raise ValueError('请先将管理员登录名加入 AGENTSCOPE_PLATFORM_ADMIN_USERS。')
    with store._lock:
        exists = store._conn.execute('SELECT id FROM users WHERE lower(username)=lower(?)', (username,)).fetchone()
    if exists:
        # Never reset an existing user's password as a side effect of migration.
        user, _ = store.login_user(username, password)
        return user, False
    user, _ = store.create_user(username, password)
    return user, True


async def provision(username, password):
    store = StudioStore()
    try:
        user, created = ensure_admin(store, username, password)
        catalog = PlatformCatalog(store)
        try:
            await catalog.prepare_schema()
            async with catalog.storage:
                migrated = await catalog.seed()
                total = len(catalog.profiles())
        finally:
            await catalog.close()
        return {'username': user.username, 'account_created': created, 'agents_imported': len(migrated), 'platform_agents': total}
    finally:
        store._conn.close()


if __name__ == '__main__':
    import json
    name = input('管理员登录名：').strip()
    password = getpass.getpass('管理员密码：')
    print(json.dumps(asyncio.run(provision(name, password)), ensure_ascii=False))
