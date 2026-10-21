"""Automation history is read-only, account-isolated and uses three public states."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import httpx
from service.store import StudioStore, utc_now
from service.capabilities import ConsoleCapabilities
from tests.test_console import StoreFixture


class AutomationRunTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.create_store()
        self.task = self.resource('schedule', config={'next_run': '2099-01-01T10:00Z'})
        self.store.ensure_session('run-test', self.user.id)
        self.store.add_message('run-test', 'assistant', '保留执行结果')
        self.store._conn.execute('INSERT INTO console_runs (id,user_id,resource_id,name,session_id,status,detail,created_at,updated_at,snapshot_json) VALUES (?,?,?,?,?,?,?,?,?,?)', ('record',self.user.id,self.task['id'],'测试任务','run-test','success','已完成',utc_now(),utc_now(),json.dumps({'kind':'schedule'})))
        self.store._conn.commit()
        from service import main
        self.main = main
        self.patches = [patch.object(main,'runtime',SimpleNamespace(store=self.store)),patch.object(main,'capabilities',self.cap)]
        for p in self.patches: p.start()
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        for p in reversed(self.patches): p.stop()
        self.clean_store()

    async def test_deletion_endpoint_is_unavailable_and_history_is_preserved(self):
        response = await self.client.delete('/console/runs/record', headers={'authorization': f'Bearer {self.token}'})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(self.cap.runs(self.user.id, 'schedule')), 1)
        self.assertEqual(self.store.list_messages('run-test')[0]['content'], '保留执行结果')
        self.assertEqual(self.cap.get(self.user.id, self.task['id'])['id'], self.task['id'])

    async def test_history_reads_remain_account_isolated(self):
        self.assertEqual(self.cap.runs(self.other.id), [])
        self.assertEqual((await self.client.get('/console/runs')).status_code, 401)

    async def test_public_history_has_only_three_states(self):
        for internal, public in [('running', 'running'), ('waiting_approval', 'running'), ('interrupted', 'failed'), ('failed', 'failed'), ('success', 'success')]:
            self.store._conn.execute("UPDATE console_runs SET status=? WHERE id='record'", (internal,))
            self.store._conn.commit()
            self.assertEqual(self.cap.runs(self.user.id)[0]['status'], public)

    async def test_previously_hidden_history_remains_available(self):
        self.store._conn.execute("UPDATE console_runs SET deleted_at=? WHERE id='record'", (utc_now(),))
        self.store._conn.commit()
        self.assertEqual(len(self.cap.runs(self.user.id)), 1)
