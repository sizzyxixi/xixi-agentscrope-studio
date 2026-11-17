import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from service.capabilities import ConsoleCapabilities
from service.official_service import build_official_service
from service.platform_catalog import PLATFORM_OWNER
from service.runtime import AgentScopeRuntime, ModelSettings
from service.store import StudioStore


class PlatformCatalogTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = StudioStore(Path(self.temp.name) / 'legacy.db')
        self.admin, self.token = self.store.create_user('admin', 'testing-admin-password')
        self.user, self.user_token = self.store.create_user('customer', 'testing-user-password')
        self.env = patch.dict(os.environ, {'AGENTSCOPE_PLATFORM_ADMIN_USERS': 'admin'})
        self.env.start()
        def authenticate(value):
            user = self.store.get_user_by_token((value or '').removeprefix('Bearer '))
            if not user: raise HTTPException(401, '请先登录。')
            return user
        self.app, self.catalog, self.lifecycle = build_official_service(self.store, authenticate)
        self.context = self.lifecycle()
        await self.context.__aenter__()
        self.cap = ConsoleCapabilities(self.store)
        self.cap.platform_catalog = self.catalog
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://fixture')
        self.headers = {'Authorization': f'Bearer {self.token}'}

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.context.__aexit__(None, None, None)
        self.env.stop()
        self.store._conn.close()
        self.temp.cleanup()

    async def test_migration_imports_all_existing_agents_and_original_market_metadata(self):
        response = await self.client.get('/agent/', headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['total'], 10)
        profiles = self.cap.agents(self.user.id)
        self.assertEqual(len(profiles), 10)
        amazon = next(agent for agent in profiles if agent['id'] == 'official-amazon')
        self.assertIn('亚马逊', amazon['name'])
        self.assertIn('amazon.png', amazon['config']['cover_url'])
        self.assertEqual(amazon['config']['max_iters'], 8)
        self.assertTrue(amazon['config']['platform_managed'])
        self.assertEqual(await self.catalog.seed(), [])

    async def create_knowledge_fixture(self):
        response = await self.client.post('/knowledge_bases/', headers=self.headers, json={
            'name': '平台商品资料',
            'embedding_model_config': {'type': 'openai_credential', 'credential_id': 'unused-fixture', 'model': 'text-embedding-3-small', 'dimensions': 3},
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()['knowledge_base_id']

    async def test_official_knowledge_endpoints_and_persistent_collection_are_enabled(self):
        health = await self.client.get('/health', headers=self.headers)
        self.assertEqual(health.json()['components']['knowledge_base'], 'ok')
        for path in ['/knowledge_bases/', '/knowledge_bases/embedding_models', '/knowledge_bases/chunkers', '/knowledge_bases/supported_content_types']:
            response = await self.client.get(path, headers=self.headers)
            self.assertEqual(response.status_code, 200, response.text)
        identity = await self.create_knowledge_fixture()
        record = await self.catalog.storage.get_knowledge_base(PLATFORM_OWNER, identity)
        self.assertTrue(await self.app.state.knowledge_base_manager._vector_store.has_collection(record.data.collection_name))
        await self.client.aclose()
        await self.context.__aexit__(None, None, None)
        self.context = self.lifecycle()
        await self.context.__aenter__()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://fixture')
        listing = await self.client.get('/knowledge_bases/', headers=self.headers)
        self.assertEqual(listing.json()['total'], 1)
        self.assertEqual(listing.json()['knowledge_bases'][0]['id'], identity)
        self.assertTrue(await self.app.state.knowledge_base_manager._vector_store.has_collection(record.data.collection_name))
        self.assertEqual((await self.client.get('/knowledge_bases/', headers={'Authorization': f'Bearer {self.user_token}'})).status_code, 403)
        self.assertEqual((await self.client.delete(f'/knowledge_bases/{identity}', headers=self.headers)).status_code, 204)
        self.assertFalse(await self.app.state.knowledge_base_manager._vector_store.has_collection(record.data.collection_name))

    async def test_knowledge_original_file_uses_admin_auth_or_scoped_signed_preview(self):
        from fastapi import FastAPI
        from agentscope.app._service._download_token import sign_download_token
        identity = await self.create_knowledge_fixture()
        uploaded = await self.client.post(f'/knowledge_bases/{identity}/documents', headers=self.headers, files={'file': ('guide.txt', b'Product reference document.', 'text/plain')})
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        document = uploaded.json()['document_id']
        path = f'/knowledge_bases/{identity}/documents/{document}'
        fetched = await self.client.get(path, headers={**self.headers, 'X-User-ID': self.user.id})
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.content, b'Product reference document.')
        self.assertEqual((await self.client.get(path, headers={'X-User-ID': PLATFORM_OWNER})).status_code, 401)
        signed = await self.client.post(f'{path}/download_token', headers=self.headers)
        self.assertEqual(signed.status_code, 200, signed.text)
        token = signed.json()['token']
        # The same route is mounted in production; root_path must not break
        # resource-bound signature validation for iframe/native previews.
        parent = FastAPI()
        parent.mount('/agentscope-service', self.app)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=parent), base_url='http://fixture') as client:
            preview = await client.get('/agentscope-service' + path, params={'token': token})
            self.assertEqual(preview.status_code, 200, preview.text)
            self.assertEqual(preview.content, fetched.content)
        for target in [path + '-other', '/agent/']:
            self.assertEqual((await self.client.get(target, params={'token': token})).status_code, 401)
        self.assertEqual((await self.client.delete(path, params={'token': token})).status_code, 401)
        for owner, ttl in [(PLATFORM_OWNER, -1), (self.user.id, 60)]:
            invalid, _ = sign_download_token(self.app.state.download_secret, owner, f'kb/{identity}/{document}', ttl=ttl)
            self.assertEqual((await self.client.get(path, params={'token': invalid})).status_code, 401)

    async def test_official_ui_update_and_create_are_immediately_used_by_all_customers(self):
        edited = await self.client.patch('/agent/official-amazon', headers=self.headers, json={'name': '平台新版选品助手', 'system_prompt': 'New platform instructions.', 'chat_config': {'react_config': {'max_iters': 17}, 'context_config': {'trigger_ratio': .65, 'reserve_ratio': .1}, 'invite_config': {'invite_description': '新的简介'}}})
        self.assertEqual(edited.status_code, 200, edited.text)
        profile = self.cap.agent(self.user.id, 'official-amazon')
        self.assertEqual(profile['name'], '平台新版选品助手')
        self.assertEqual(profile['content'], 'New platform instructions.')
        self.assertEqual(profile['config']['max_iters'], 17)
        self.assertEqual(profile['config']['description'], '新的简介')
        self.assertNotIn('name_en', profile['config'])
        self.cap.set_chat_agent(self.user.id, 'new-chat', 'official-amazon')
        self.assertEqual(self.cap.session_config(self.user.id, 'new-chat')['agent_prompt'], 'New platform instructions.')
        created = await self.client.post('/agent/', headers=self.headers, json={'name': '新平台助手', 'system_prompt': 'New assistant.'})
        self.assertEqual(created.status_code, 201, created.text)
        identity = created.json()['agent_id']
        self.assertTrue(self.cap.agent(self.user.id, identity)['builtin'])
        self.assertEqual(self.cap.agent(self.user.id, identity)['content'], 'New assistant.')
        cleared = await self.client.patch('/agent/official-amazon', headers=self.headers, json={'chat_config': {'invite_config': {'invite_description': ''}}})
        self.assertEqual(cleared.status_code, 200, cleared.text)
        self.assertEqual(self.cap.agent(self.user.id, 'official-amazon')['config']['description'], '')

    async def test_customer_and_forged_user_header_cannot_read_or_write_admin_configuration(self):
        for method, path, payload in [('GET', '/agent/', None), ('PATCH', '/agent/official-amazon', {'name': 'hacked'}), ('GET', '/docs', None), ('GET', '/openapi.json', None)]:
            response = await self.client.request(method, path, headers={'Authorization': f'Bearer {self.user_token}', 'X-User-ID': PLATFORM_OWNER}, json=payload)
            self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual((await self.client.get('/agent/', headers={'X-User-ID': PLATFORM_OWNER})).status_code, 401)
        self.assertEqual((await self.client.delete('/agent/main', headers=self.headers)).status_code, 409)

    async def test_public_registration_and_profile_cannot_claim_reserved_admin_names(self):
        import service.main as main
        with patch.object(main.runtime, 'store', self.store), patch.dict(os.environ, {'AGENTSCOPE_PLATFORM_ADMIN_USERS': 'admin,futureadmin'}):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://fixture') as client:
                response = await client.post('/auth/register', json={'username': ' FutureAdmin ', 'password': 'fixture-password'})
                self.assertEqual(response.status_code, 403)
                response = await client.put('/auth/me', headers={'Authorization': f'Bearer {self.user_token}'}, json={'username': 'futureadmin'})
                self.assertEqual(response.status_code, 403)
                response = await client.put('/auth/me', headers=self.headers, json={'username': 'renamedadmin'})
                self.assertEqual(response.status_code, 403)
                self.assertEqual(self.store.get_user_by_token(self.token).username, 'admin')

    async def test_deletion_does_not_resurrect_on_seed_and_account_resources_stay_private(self):
        personal = self.cap.save(self.user.id, {'kind': 'agent', 'name': '私有助手', 'content': 'private'})
        skill = self.cap.save(self.user.id, {'kind': 'skill', 'name': 'private skill', 'content': 'private'})
        self.assertEqual((await self.client.delete('/agent/official-amazon', headers=self.headers)).status_code, 204)
        await self.catalog.seed()
        with self.assertRaises(ValueError): self.cap.agent(self.user.id, 'official-amazon')
        self.assertEqual(self.cap.agent(self.user.id, personal['id'])['name'], '私有助手')
        admin_profiles = self.cap.agents(self.admin.id)
        self.assertFalse(any(agent['id'] == personal['id'] for agent in admin_profiles))
        self.assertNotIn(skill['id'], self.cap.agent(self.admin.id, 'official-tiktok')['config']['skill_ids'])
        self.assertIn(skill['id'], self.cap.agent(self.user.id, 'official-tiktok')['config']['skill_ids'])

    async def test_next_normal_turn_refreshes_platform_prompt_but_private_snapshot_is_unchanged(self):
        self.cap.set_chat_agent(self.user.id, 'existing-chat', 'official-tiktok')
        previous = self.cap.session_config(self.user.id, 'existing-chat')
        await self.client.patch('/agent/official-tiktok', headers=self.headers, json={'system_prompt': 'Latest configured role.'})
        self.cap.refresh_platform_agent(self.user.id, 'existing-chat')
        current = self.cap.session_config(self.user.id, 'existing-chat')
        self.assertEqual(current['agent_prompt'], 'Latest configured role.')
        self.assertNotEqual(current['agent_config']['config_revision'], previous['agent_config']['config_revision'])
        private = self.cap.save(self.user.id, {'kind': 'agent', 'name': 'private', 'content': 'original'})
        self.cap.set_chat_agent(self.user.id, 'private-chat', private['id'])
        self.cap.save(self.user.id, {**private, 'content': 'new private'}, private['id'])
        self.cap.refresh_platform_agent(self.user.id, 'private-chat')
        self.assertEqual(self.cap.session_config(self.user.id, 'private-chat')['agent_prompt'], 'original')

    async def test_cached_sdk_agent_refreshes_configs_and_waits_for_pending_confirmation(self):
        self.cap.set_chat_agent(self.user.id, 'live-chat', 'official-amazon')
        runtime = AgentScopeRuntime(self.store)
        runtime.capabilities = self.cap
        saved = self.store.create_model_setting(self.user.id, 'openai', 'fixture', 'fixture', '', 'fixture-key', True)
        model = ModelSettings(id=saved.id)
        original = runtime._get_or_create_session('live-chat', model, self.user)
        await self.client.patch('/agent/official-amazon', headers=self.headers, json={'system_prompt': 'Updated live role.', 'chat_config': {'react_config': {'max_iters': 14}, 'context_config': {'trigger_ratio': .6, 'reserve_ratio': .15}}})
        refreshed = runtime._get_or_create_session('live-chat', model, self.user)
        self.assertIsNot(refreshed, original)
        self.assertEqual(refreshed.agent._system_prompt, 'Updated live role.')
        self.assertEqual(refreshed.agent.react_config.max_iters, 14)
        self.assertEqual(refreshed.agent.context_config.reserve_ratio, .15)
        refreshed.pending_confirmations['fixture'] = object()
        await self.client.patch('/agent/official-amazon', headers=self.headers, json={'system_prompt': 'Another role.'})
        self.assertIs(runtime._get_or_create_session('live-chat', model, self.user), refreshed)
        refreshed.pending_confirmations.clear()
        self.assertIs(runtime._get_or_create_session('live-chat', model, self.user, refresh_platform=False), refreshed)
        self.assertEqual(runtime._get_or_create_session('live-chat', model, self.user).agent._system_prompt, 'Another role.')
        await self.client.patch('/agent/official-amazon', headers=self.headers, json={'system_prompt': ''})
        self.assertEqual(runtime._get_or_create_session('live-chat', model, self.user).agent._system_prompt, '')
