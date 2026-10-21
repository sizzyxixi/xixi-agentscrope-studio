"""Automation provenance, exact prompts, and server-side task/session pagination."""
import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import httpx
from service.runtime import AgentScopeRuntime
from tests.test_console import StoreFixture, FakeRuntime


class AutomationSessionTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.create_store()
        self.store.create_model_setting(self.user.id, 'openai', 'test', 'test-model', '', 'dummy-test-key', True)
        self.fake = FakeRuntime(self.store); self.cap.runtime = self.fake
        self.runtime = AgentScopeRuntime(self.store); self.runtime.capabilities = self.cap

    async def asyncTearDown(self):
        await self.cap.close(); self.clean_store()

    async def test_schedule_title_prompt_and_source_survive_task_deletion(self):
        prompt = 'Analyze inventory.\n---\nPreserve this separator inside the task prompt.'
        task = self.resource('schedule', name='Inventory monitor', content=prompt, config={'next_run':'2099-01-01T10:00Z'})
        run = self.cap.start_run(self.user,task['id'],automatic=True)
        self.assertEqual(self.store.list_sessions(self.user.id,session_id=run['session_id'])[0]['title'],task['name'])
        await asyncio.gather(*list(self.cap.tasks))
        self.assertEqual(self.fake.calls[0][1],prompt)
        self.assertEqual(self.store.list_messages(run['session_id'])[0]['content'],prompt)
        self.cap.delete(self.user.id,task['id'])
        session = self.runtime.list_sessions(self.user,session_id=run['session_id'])[0]
        self.assertEqual(session['source_kind'],'schedule'); self.assertEqual(session['title'],task['name'])
        self.assertEqual(self.runtime.list_sessions(self.other),[])

    async def test_workflow_and_normal_conversations_are_not_automation(self):
        workflow = self.resource('workflow', content='first step')
        run = self.cap.start_run(self.user,workflow['id']); await asyncio.gather(*list(self.cap.tasks))
        self.assertIn('步骤 1/1',self.fake.calls[0][1])
        self.store.ensure_session('ordinary',self.user.id); self.store.add_message('ordinary','user','ordinary prompt')
        sessions = self.runtime.list_sessions(self.user)
        self.assertTrue(all(session['source_kind']=='' for session in sessions))
        self.assertTrue(any(session['id']==run['session_id'] for session in sessions))

    async def test_session_api_pages_are_owned_and_summary_does_not_load_body(self):
        from service import main
        for number in range(7):
            sid=f'ordinary-{number}'; self.store.ensure_session(sid,self.user.id); self.store.add_message(sid,'user',f'prompt {number}')
        self.store.ensure_session('private',self.other.id)
        with patch.object(main,'runtime',self.runtime):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url='http://test') as client:
                self.assertEqual((await client.get('/sessions?limit=3')).status_code,401)
                headers={'authorization':f'Bearer {self.token}'}
                first=(await client.get('/sessions?limit=3&summary=true',headers=headers)).json()
                second=(await client.get(f'/sessions?limit=3&offset={first["next_offset"]}&summary=true',headers=headers)).json()
                last=(await client.get('/sessions?limit=3&offset=6&summary=true',headers=headers)).json()
        self.assertTrue(first['has_more']); self.assertFalse(last['has_more'])
        self.assertEqual(len(first['sessions']),3)
        self.assertFalse(set(s['id'] for s in first['sessions']) & set(s['id'] for s in second['sessions']))
        self.assertTrue(all(s['messages']==[] and s['summary_only'] for s in first['sessions']))
        self.assertTrue(all(s['title'].startswith('prompt') for s in first['sessions']))


class TaskPaginationTests(StoreFixture, unittest.TestCase):
    def setUp(self): self.create_store()
    def tearDown(self): self.clean_store()

    def test_status_counts_page_boundaries_search_ordering_and_isolation(self):
        created=[]
        for number in range(23):
            day=number+1
            created.append(self.resource('schedule',name=f'Page task {number:02}',config={'next_run':f'2099-01-{day:02}T10:00Z'}))
        paused=self.resource('schedule',name='Paused first',enabled=False,config={'next_run':'2099-01-01T10:00Z'})
        newer=self.resource('schedule',name='Paused newest',enabled=False,config={'next_run':'2099-01-01T10:00Z'})
        self.store._conn.execute('UPDATE console_resources SET updated_at=? WHERE id=?',('2099-01-01',newer['id']));self.store._conn.commit()
        self.cap.save(self.other.id,{'kind':'schedule','name':'Private','content':'private','config':{'next_run':'2099-01-01T10:00Z'}})
        first=self.cap.schedule_page(self.user.id,page=1); second=self.cap.schedule_page(self.user.id,page=2)
        self.assertEqual(first['counts'],{'active':23,'paused':2,'ended':0})
        self.assertEqual(first['all_total'],25);self.assertEqual(first['pages'],2)
        self.assertEqual([r['id'] for r in first['resources']],[r['id'] for r in created[:20]])
        self.assertEqual([r['id'] for r in second['resources']],[r['id'] for r in created[20:]])
        self.assertEqual(self.cap.schedule_page(self.user.id,page=999)['page'],2)
        self.assertEqual(self.cap.schedule_page(self.user.id,status='paused')['resources'][0]['id'],newer['id'])
        self.assertEqual(self.cap.schedule_page(self.user.id,search='task 22')['total'],1)
        self.assertEqual(self.cap.schedule_page(self.user.id,search='%')['total'],0)
        with self.assertRaises(ValueError): self.cap.schedule_page(self.user.id,status='fake')
