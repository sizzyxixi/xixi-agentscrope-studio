"""Authenticated profile changes preserve account ownership and password hashing."""
import unittest
from unittest.mock import patch

import httpx

from service.runtime import AgentScopeRuntime
from tests.test_console import StoreFixture


class ProfileSettingsTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from service import main
        self.create_store()
        self.runtime = AgentScopeRuntime(self.store)
        self.patch = patch.object(main, 'runtime', self.runtime)
        self.patch.start()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test')
        self.headers = {'authorization': f'Bearer {self.token}'}

    async def asyncTearDown(self):
        await self.client.aclose()
        self.patch.stop()
        await self.cap.close()
        self.clean_store()

    async def test_registered_date_and_rename_survive_login(self):
        first = (await self.client.get('/auth/me', headers=self.headers)).json()['user']
        self.assertTrue(first['created_at'])
        self.assertEqual(set(first), {'id', 'username', 'created_at'})
        renamed = await self.client.put('/auth/me', headers=self.headers, json={'username': '  NewName  ', 'id': self.other.id})
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.json()['user'], {**first, 'username': 'NewName'})
        self.assertEqual(self.store.get_user_by_token(self.other_token).username, self.other.username)
        self.assertEqual(self.store.get_user_by_token(self.token).username, 'NewName')
        login = await self.client.post('/auth/login', json={'username': 'newname', 'password': 'testing123'})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json()['user'], renamed.json()['user'])
        old_name = await self.client.post('/auth/login', json={'username': self.user.username, 'password': 'testing123'})
        self.assertEqual(old_name.status_code, 400)

    async def test_duplicate_and_invalid_names_do_not_mutate_account(self):
        for username in ('a', 'name with spaces', self.other.username.upper()):
            response = await self.client.put('/auth/me', headers=self.headers, json={'username': username})
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.store.get_user_by_token(self.token).username, self.user.username)
        same = await self.client.put('/auth/me', headers=self.headers, json={'username': self.user.username.upper()})
        self.assertEqual(same.status_code, 200)

    async def test_password_requires_only_six_characters_and_matching_confirmation(self):
        before = dict(self.store._conn.execute('SELECT password_hash,salt FROM users WHERE id=?', (self.user.id,)).fetchone())
        for password, confirmation in (('12345', '12345'), ('123456', '654321')):
            response = await self.client.post('/auth/password', headers=self.headers, json={'new_password': password, 'confirm_password': confirmation})
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.store.login_user(self.user.username, 'testing123')[0].id, self.user.id)
        response = await self.client.post('/auth/password', headers=self.headers, json={'new_password': '123456', 'confirm_password': '123456', 'id': self.other.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'success': True})
        after = dict(self.store._conn.execute('SELECT password_hash,salt FROM users WHERE id=?', (self.user.id,)).fetchone())
        self.assertNotEqual(before['salt'], after['salt'])
        self.assertNotEqual(before['password_hash'], after['password_hash'])
        self.assertNotEqual(after['password_hash'], '123456')
        with self.assertRaises(ValueError): self.store.login_user(self.user.username, 'testing123')
        self.assertEqual(self.store.login_user(self.user.username, '123456')[0].id, self.user.id)
        self.assertEqual(self.store.login_user(self.other.username, 'testing456')[0].id, self.other.id)
        self.assertEqual((await self.client.get('/auth/me', headers=self.headers)).status_code, 200)
        for password in ('abcdef', '只要六个汉字', '      '):
            self.assertEqual((await self.client.post('/auth/password', headers=self.headers, json={'new_password': password, 'confirm_password': password})).status_code, 200)
            self.assertEqual(self.store.login_user(self.user.username, password)[0].id, self.user.id)

    async def test_anonymous_and_invalid_tokens_cannot_change_profile(self):
        for headers in ({}, {'authorization': 'Bearer invalid'}):
            self.assertEqual((await self.client.put('/auth/me', headers=headers, json={'username': 'hijacked'})).status_code, 401)
            self.assertEqual((await self.client.post('/auth/password', headers=headers, json={'new_password': '123456', 'confirm_password': '123456'})).status_code, 401)

    async def test_registration_and_login_include_the_same_creation_time(self):
        registered = await self.client.post('/auth/register', json={'username': 'newaccount', 'password': '123456'})
        self.assertEqual(registered.status_code, 200)
        payload = registered.json()
        logged_in = (await self.client.post('/auth/login', json={'username': 'newaccount', 'password': '123456'})).json()
        me = (await self.client.get('/auth/me', headers={'authorization': f'Bearer {payload["token"]}'})).json()
        self.assertEqual(payload['user'], logged_in['user'])
        self.assertEqual(payload['user'], me['user'])
        self.assertTrue(payload['user']['created_at'])
