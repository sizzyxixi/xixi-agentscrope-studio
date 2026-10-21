"""Sidebar groups filter before pagination, including unloaded search results."""
import json
import unittest
from unittest.mock import patch

import httpx

from service.runtime import AgentScopeRuntime
from tests.test_console import StoreFixture


class SessionGroupPaginationTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.create_store()
        self.runtime = AgentScopeRuntime(self.store)
        self.runtime.capabilities = self.cap
        for group in ('recent', 'automation'):
            for number in range(45):
                sid = f'{group}-{number:02}'
                self.store.ensure_session(sid, self.user.id)
                self.store.add_message(sid, 'user', f'{group} prompt {number:02}')
                # Every recent session is newer than every automated session.
                date = f'2099-01-{2 if group == "recent" else 1:02}T00:{number:02}:00Z'
                self.store._conn.execute('UPDATE sessions SET title=?,updated_at=? WHERE id=?', (f'{group} {number:02}', date, sid))
                if group == 'automation':
                    self.store._conn.execute(
                        'INSERT INTO console_runs (id,user_id,resource_id,name,session_id,status,detail,created_at,updated_at,snapshot_json) VALUES (?,?,?,?,?,?,?,?,?,?)',
                        (f'run-{sid}', self.user.id, 'deleted-task', f'Automation {number:02}', sid, 'success', '', date, date, json.dumps({'kind': 'schedule'})),
                    )
        self.store.ensure_session('private', self.other.id)
        self.store._conn.commit()

    async def asyncTearDown(self):
        await self.cap.close()
        self.clean_store()

    async def test_each_group_loads_ten_then_twenty_without_overlap(self):
        from service import main
        with patch.object(main, 'runtime', self.runtime):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
                headers = {'authorization': f'Bearer {self.token}'}
                for group in ('recent', 'automation'):
                    pages = []
                    offset = 0
                    for limit in (10, 20, 20):
                        response = await client.get('/sessions', params={'group': group, 'summary': 'true', 'offset': offset, 'limit': limit}, headers=headers)
                        self.assertEqual(response.status_code, 200)
                        page = response.json()
                        pages.append(page)
                        offset = page['next_offset']
                    self.assertEqual([len(page['sessions']) for page in pages], [10, 20, 15])
                    self.assertEqual([page['has_more'] for page in pages], [True, True, False])
                    ids = [session['id'] for page in pages for session in page['sessions']]
                    self.assertEqual(ids, [f'{group}-{number:02}' for number in reversed(range(45))])
                    self.assertEqual(len(set(ids)), 45)
                    self.assertTrue(all(session['messages'] == [] and session['summary_only'] for page in pages for session in page['sessions']))
                self.assertEqual((await client.get('/sessions?group=invalid', headers=headers)).status_code, 422)
                private = (await client.get('/sessions?group=automation', headers={'authorization': f'Bearer {self.other_token}'})).json()
                self.assertEqual(private['sessions'], [])

    async def test_search_covers_unloaded_rows_and_escapes_wildcards(self):
        for group in ('recent', 'automation'):
            result = self.runtime.list_sessions(self.user, group=group, search=f'{group} 00', summary=True, limit=10)
            self.assertEqual([row['id'] for row in result], [f'{group}-00'])
        self.store._conn.execute('UPDATE sessions SET title=? WHERE id=?', ('Discount 50%_today', 'recent-00'))
        self.store._conn.commit()
        self.assertEqual([row['id'] for row in self.runtime.list_sessions(self.user, group='recent', search='%_', summary=True)], ['recent-00'])
        self.assertEqual(self.runtime.list_sessions(self.user, group='automation', search='%_', summary=True), [])
        self.assertEqual([row['id'] for row in self.runtime.list_sessions(self.user, group='recent', search='DISCOUNT', summary=True)], ['recent-00'])

    async def test_pinned_order_and_run_name_fallback(self):
        self.store._conn.execute('UPDATE sessions SET pinned=1 WHERE id=?', ('automation-00',))
        self.store._conn.execute("UPDATE sessions SET title='' WHERE id=?", ('automation-01',))
        self.store._conn.commit()
        result = self.runtime.list_sessions(self.user, group='automation', limit=10, summary=True)
        self.assertEqual(result[0]['id'], 'automation-00')
        result = self.runtime.list_sessions(self.user, group='automation', search='Automation 01', summary=True)
        self.assertEqual([row['id'] for row in result], ['automation-01'])
