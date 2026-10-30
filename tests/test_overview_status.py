"""Overview reports storage and deployment capabilities without leaking connection data."""
import json
import unittest
from unittest.mock import patch

import httpx

from service.runtime import AgentScopeRuntime
from tests.test_console import StoreFixture


class OverviewStatusTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.create_store()
        self.runtime = AgentScopeRuntime(self.store)
        self.runtime.capabilities = self.cap
        self.store.ensure_session('mine', self.user.id)
        self.store.add_message('mine', 'user', 'hello')
        self.store.ensure_session('private', self.other.id)
        self.store.add_message('private', 'user', 'private content')
        self.resource('memory')

    async def asyncTearDown(self):
        await self.cap.close()
        self.clean_store()

    async def test_status_uses_actual_database_backend_and_user_scoped_counts(self):
        from service import main
        with patch.object(main, 'runtime', self.runtime), patch.object(main, 'capabilities', self.cap):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
                self.assertEqual((await client.get('/console/status')).status_code, 401)
                for backend in ('sqlite', 'postgresql'):
                    with patch.object(self.store, 'backend', backend):
                        response = await client.get('/console/status', headers={'authorization': f'Bearer {self.token}'})
                    self.assertEqual(response.status_code, 200)
                    status = response.json()
                    self.assertEqual(status['database'], backend)
                    self.assertEqual(status['sessions'], 1)
                    self.assertEqual(status['messages'], 1)
                    self.assertEqual(status['resources']['memory'], 1)
                    for secret in ('db_path', 'database_url', 'api_key', 'token', 'password'):
                        self.assertNotIn(secret, status)

    async def test_scheduler_description_matches_deployment_mode(self):
        from service import main
        with patch.object(main, 'runtime', self.runtime), patch.object(main, 'capabilities', self.cap):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
                for serverless, expected in ((True, '当前部署仅支持手动执行'), (False, '后台服务运行时，每 5 秒检查到期任务')):
                    with patch.object(main, 'SERVERLESS', serverless):
                        response = await client.get('/console/status', headers={'authorization': f'Bearer {self.token}'})
                    self.assertEqual(response.json()['scheduler'], expected)

    async def test_chat_storage_event_does_not_claim_sqlite_on_postgresql(self):
        for backend, label in (('sqlite', '本地 SQLite'), ('postgresql', 'PostgreSQL')):
            with patch.object(self.store, 'backend', backend):
                stream = self.runtime._stream_impl('mine', '', user=self.user)
                try:
                    event = await anext(stream)
                finally:
                    await stream.aclose()
            data = json.loads(event.split('data: ', 1)[1])
            self.assertEqual(data['title'], '会话数据已连接')
            self.assertIn(label, data['detail'])
            if backend == 'postgresql': self.assertNotIn('SQLite', data['detail'])
        session = self.runtime.list_sessions(self.user, session_id='mine')[0]
        self.assertNotIn('SQLite', session['subtitle'])
