"""History removal must preserve executions, isolate accounts and reject live runs."""
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

    async def test_removed_entry_survives_reload_and_preserves_task_and_conversation(self):
        response=await self.client.delete('/console/runs/record',headers={'authorization':f'Bearer {self.token}'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.cap.runs(self.user.id,'schedule'),[])
        self.assertEqual(self.cap.get(self.user.id,self.task['id'])['id'],self.task['id'])
        self.assertEqual(self.store.list_messages('run-test')[0]['content'],'保留执行结果')
        reopened=StudioStore(self.store.db_path,self.root)
        try:
            self.assertEqual(ConsoleCapabilities(reopened).runs(self.user.id),[])
            self.assertIsNotNone(reopened._conn.execute("SELECT deleted_at FROM console_runs WHERE id='record'").fetchone()['deleted_at'])
        finally: reopened._conn.close()

    async def test_another_account_cannot_remove_or_list_record(self):
        response=await self.client.delete('/console/runs/record',headers={'authorization':f'Bearer {self.other_token}'})
        self.assertEqual(response.status_code,404)
        self.assertEqual(self.cap.runs(self.other.id),[])
        self.assertEqual(len(self.cap.runs(self.user.id)),1)

    async def test_running_and_waiting_approval_cannot_be_removed(self):
        for status in ('running','waiting_approval'):
            self.store._conn.execute("UPDATE console_runs SET status=? WHERE id='record'",(status,));self.store._conn.commit()
            response=await self.client.delete('/console/runs/record',headers={'authorization':f'Bearer {self.token}'})
            self.assertEqual(response.status_code,409)
            self.assertEqual(len(self.cap.runs(self.user.id)),1)

    async def test_authentication_required(self):
        self.assertEqual((await self.client.delete('/console/runs/record')).status_code,401)
