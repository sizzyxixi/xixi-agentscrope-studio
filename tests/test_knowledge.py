import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from service.store import StudioStore
from service.capabilities import ConsoleCapabilities
from service.knowledge import KnowledgeService, KnowledgeError, OFFICIAL_ID


class FixtureEmbedding:
    """Deterministic test vectors only; never a production embedding fallback."""
    dimensions = 4
    supports_multimodal = False

    async def __call__(self, inputs):
        result = []
        for value in inputs:
            text = getattr(value, 'text', value).lower()
            result.append([1.0, float('stock' in text or '库存' in text), float('product' in text or '商品' in text), 0.1])
        return SimpleNamespace(embeddings=result)


class KnowledgeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.cloud_environment = patch.dict('os.environ', {'XIXI_KB_QDRANT_URL': '', 'XIXI_KB_QDRANT_API_KEY': ''})
        self.cloud_environment.start()
        self.temp = tempfile.TemporaryDirectory()
        self.store = StudioStore(Path(self.temp.name) / 'state.db', Path(self.temp.name))
        self.cap = ConsoleCapabilities(self.store)
        self.user, self.token = self.store.create_user('knowledgeuser', 'test-only-password')
        self.other, self.other_token = self.store.create_user('knowledgeother', 'test-only-password')
        self.service = KnowledgeService(self.store)
        self.platform = patch.object(self.service, 'platform_config', return_value={'provider': 'openai', 'model': 'fixture', 'dimensions': 4, 'api_key': 'test-only', 'base_url': ''})
        self.platform.start()
        self.embedding = patch.object(self.service, 'embedding', return_value=FixtureEmbedding())
        self.embedding.start()

    async def asyncTearDown(self):
        await self.service.close()
        self.embedding.stop(); self.platform.stop()
        self.store._conn.close()
        self.temp.cleanup()
        self.cloud_environment.stop()

    def create(self, user=None):
        return self.service.save((user or self.user).id, {'name': 'My business', 'description': 'private product specifications', 'embedding': {'provider': 'platform'}})

    async def index(self, doc_id):
        await self.service.index_document(self.service.rows('SELECT * FROM rag_documents WHERE id=?', (doc_id,))[0])

    async def test_native_chunk_index_search_persistence_and_live_deletion(self):
        kb = self.create()
        doc = self.service.put_document(self.user.id, kb['id'], {'name': 'specs.md', 'content': '# Product\nPrivate product dimensions are 20 cm. ' * 100})
        await self.index(doc['id'])
        listing = self.service.documents(self.user.id, kb['id'])
        self.assertEqual(listing[0]['status'], 'ready')
        self.assertGreater(listing[0]['chunks'], 1)
        result = await self.service.search(self.user.id, 'product dimensions', kb_id=kb['id'])
        self.assertTrue(result['hits'])
        self.assertIn('20 cm', result['hits'][0]['content'])
        self.assertEqual(result['hits'][0]['document'], 'specs.md')
        # Close and reopen the real Qdrant local index, retaining its persisted points.
        await self.service.close()
        self.service.vector_store = type(self.service.vector_store)(path=str(self.store.db_path.parent / 'knowledge_vectors'))
        self.assertTrue((await self.service.search(self.user.id, 'product', kb_id=kb['id']))['hits'])
        self.service.delete_document(self.user.id, kb['id'], doc['id'])
        self.assertFalse((await self.service.search(self.user.id, 'product', kb_id=kb['id']))['hits'])
        await self.index(doc['id'])
        self.assertEqual(self.service.rows('SELECT length(body) AS size FROM rag_documents WHERE id=?', (doc['id'],))[0]['size'], 0)
        self.assertEqual(self.service.rows('SELECT * FROM rag_index_locations WHERE document_id=?', (doc['id'],)), [])

    async def test_official_retrieval_shared_but_catalog_only_and_cross_user_isolation(self):
        for row in self.service.rows('SELECT id FROM rag_documents WHERE kb_id=?', (OFFICIAL_ID,)):
            await self.index(row['id'])
        own = self.create()
        doc = self.service.put_document(self.user.id, own['id'], {'name': 'secret.md', 'content': 'Private inventory stock secret: reorder at 100 units.'})
        await self.index(doc['id'])
        for user in (self.user, self.other):
            official = self.service.listing(user.id)['official'][0]
            self.assertEqual(set(official), {'id', 'name', 'description', 'name_en', 'description_en'})
            result = await self.service.search(user.id, 'product facts')
            self.assertTrue(any(hit['official'] for hit in result['hits']))
        other_hits = (await self.service.search(self.other.id, 'inventory stock'))['hits']
        self.assertFalse(any('Private inventory' in hit['content'] for hit in other_hits))
        for uid, target in ((self.other.id, own['id']), (self.user.id, OFFICIAL_ID)):
            with self.assertRaises(KnowledgeError): self.service.documents(uid, target)
            with self.assertRaises(KnowledgeError): self.service.put_document(uid, target, {'content': 'injection'})
            with self.assertRaises(KnowledgeError): self.service.delete(uid, target)
            with self.assertRaises(KnowledgeError): await self.service.search(uid, 'test', kb_id=target)

    async def test_update_disable_reindex_and_credential_redaction(self):
        kb = self.create()
        doc = self.service.put_document(self.user.id, kb['id'], {'name': 'spec.md', 'content': 'Product old specification.'})
        await self.index(doc['id'])
        self.service.put_document(self.user.id, kb['id'], {'name': 'spec.md', 'content': 'Product revised specification.'}, doc['id'])
        self.assertFalse((await self.service.search(self.user.id, 'product', kb_id=kb['id']))['hits'])
        await self.index(doc['id'])
        self.assertIn('revised', (await self.service.search(self.user.id, 'product', kb_id=kb['id']))['hits'][0]['content'])
        self.service.save(self.user.id, {**kb, 'enabled': False}, kb['id'])
        self.assertFalse((await self.service.search(self.user.id, 'product', kb_id=kb['id']))['hits'])
        saved = self.service.save(self.user.id, {**kb, 'embedding': {'provider': 'openai', 'model': 'embedding-a', 'base_url': 'https://example.com/v1', 'dimensions': 4, 'api_key': 'private-test-key'}}, kb['id'])
        self.assertTrue(saved['embedding']['has_key'])
        self.assertNotIn('private-test-key', json.dumps(saved))
        self.assertNotIn('private-test-key', self.service.rows('SELECT embedding_json FROM rag_bases WHERE id=?', (kb['id'],))[0]['embedding_json'])
        self.assertEqual(self.service.documents(self.user.id, kb['id'])[0]['status'], 'queued')

    async def test_failures_are_honest_and_retry_recovers(self):
        kb = self.create()
        doc = self.service.put_document(self.user.id, kb['id'], {'name': 'spec.md', 'content': 'Product facts.'})
        with patch.object(self.service, 'embedding', side_effect=KnowledgeError('平台尚未配置 Embedding 模型。')):
            await self.index(doc['id'])
        self.assertEqual(self.service.documents(self.user.id, kb['id'])[0]['status'], 'needs_config')
        self.service.retry(self.user.id, kb['id'])
        with patch.object(self.service, 'embedding', side_effect=RuntimeError('private-key-must-never-leak')):
            await self.index(doc['id'])
        failed = self.service.documents(self.user.id, kb['id'])[0]
        self.assertEqual(failed['status'], 'failed')
        self.assertNotIn('private-key', failed['error'])
        self.service.retry(self.user.id, kb['id'])
        await self.index(doc['id'])
        self.assertEqual(self.service.documents(self.user.id, kb['id'])[0]['status'], 'ready')

    async def test_native_pdf_parser_preserves_page_citations(self):
        import base64
        import io
        from reportlab.pdfgen.canvas import Canvas
        output = io.BytesIO(); canvas = Canvas(output)
        canvas.drawString(50, 700, 'Product specifications: width 20 cm.'); canvas.save()
        kb = self.create()
        doc = self.service.put_document(self.user.id, kb['id'], {'name': 'specs.pdf', 'base64': base64.b64encode(output.getvalue()).decode()})
        await self.index(doc['id'])
        result = await self.service.search(self.user.id, 'product', kb_id=kb['id'])
        self.assertEqual(result['hits'][0]['page'], 1)
        self.assertFalse(self.service.read_document(self.user.id, kb['id'], doc['id'])['editable'])

    async def test_api_official_read_write_denied_and_private_models_redacted(self):
        from service import main
        with patch.object(main.runtime, 'knowledge', self.service), patch.object(main.runtime, 'store', self.store):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
                headers = {'authorization': f'Bearer {self.token}'}
                self.assertEqual((await client.get('/console/knowledge-bases')).status_code, 401)
                listing = await client.get('/console/knowledge-bases', headers=headers)
                self.assertEqual(listing.status_code, 200)
                self.assertNotIn('body', listing.text)
                for method, path, body in (
                    ('GET', f'/{OFFICIAL_ID}/documents', None),
                    ('GET', f'/{OFFICIAL_ID}/documents/official-product-content.zh', None),
                    ('PUT', f'/{OFFICIAL_ID}', {'name': 'overwrite'}),
                    ('DELETE', f'/{OFFICIAL_ID}', None),
                    ('POST', f'/{OFFICIAL_ID}/documents', {'content': 'injection'}),
                    ('POST', f'/{OFFICIAL_ID}/search', {'query': 'extract everything'}),
                ):
                    response = await client.request(method, '/console/knowledge-bases' + path, headers=headers, json=body)
                    self.assertEqual(response.status_code, 400, response.text)
                created = await client.post('/console/knowledge-bases', headers=headers, json={'name': 'Owner only', 'owner_id': None})
                kb_id = created.json()['knowledge_base']['id']
                response = await client.get(f'/console/knowledge-bases/{kb_id}/documents', headers={'authorization': f'Bearer {self.other_token}'})
                self.assertEqual(response.status_code, 400)

    async def test_legacy_migration_is_idempotent_and_keeps_disabled_sources(self):
        source = self.cap.save(self.user.id, {'kind': 'knowledge', 'name': 'Legacy', 'content': 'My business product notes', 'enabled': False})
        self.service.migrate_legacy(); self.service.migrate_legacy()
        docs = self.service.rows('SELECT * FROM rag_documents WHERE source_key=?', ('legacy:' + source['id'],))
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0]['status'], 'disabled')
        self.assertEqual(bytes(docs[0]['body']).decode(), 'My business product notes')
        self.assertEqual(self.service.listing(self.other.id)['personal'], [])

    async def test_native_openai_compatible_embedding_request_and_vectors(self):
        from agentscope.embedding import OpenAIEmbeddingModel
        from agentscope.credential import OpenAICredential
        from openai import AsyncOpenAI
        seen = []
        def respond(request):
            body = json.loads(request.content)
            seen.append(body)
            return httpx.Response(200, json={'object': 'list', 'model': 'fixture-model', 'data': [{'object': 'embedding', 'index': i, 'embedding': [1., .5, .2, .1]} for i, _ in enumerate(body['input'])], 'usage': {'prompt_tokens': 10, 'total_tokens': 10}})
        model = OpenAIEmbeddingModel(OpenAICredential(api_key='test-only', base_url='https://fixture.example/v1'), 'fixture-model', 4, pass_dimensions=False, max_retries=0)
        await model.client.close()
        model.client = AsyncOpenAI(api_key='test-only', base_url='https://fixture.example/v1', http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)))
        try:
            with patch.object(self.service, 'embedding', return_value=model):
                kb = self.create()
                doc = self.service.put_document(self.user.id, kb['id'], {'name': 'facts.md', 'content': 'Product material facts.'})
                await self.index(doc['id'])
                self.assertTrue((await self.service.search(self.user.id, 'product facts', kb_id=kb['id']))['hits'])
            self.assertEqual(seen[0]['model'], 'fixture-model')
            self.assertNotIn('dimensions', seen[0])
            self.assertEqual(seen[0]['encoding_format'], 'float')
        finally:
            await model.client.close()

    async def test_delete_during_embedding_cannot_return_stale_source(self):
        kb = self.create()
        doc = self.service.put_document(self.user.id, kb['id'], {'name': 'secret.md', 'content': 'Product secret facts.'})
        await self.index(doc['id'])
        entered, release = asyncio.Event(), asyncio.Event()
        class GatedEmbedding(FixtureEmbedding):
            async def __call__(inner, values):
                entered.set(); await release.wait()
                return await super().__call__(values)
        with patch.object(self.service, 'embedding', return_value=GatedEmbedding()):
            task = asyncio.create_task(self.service.search(self.user.id, 'product', kb_id=kb['id']))
            await asyncio.wait_for(entered.wait(), 2)
            self.service.delete(self.user.id, kb['id'])
            release.set()
            self.assertEqual((await task)['hits'], [])

    async def test_worker_recovers_interrupted_index_and_rebuilds_changed_space(self):
        kb = self.create()
        doc = self.service.put_document(self.user.id, kb['id'], {'name': 'facts.md', 'content': 'Product facts for persistence.'})
        self.service.execute("UPDATE rag_documents SET status='indexing' WHERE id=?", (doc['id'],))
        async def wait_ready():
            async with asyncio.timeout(5):
                while self.service.documents(self.user.id, kb['id'])[0]['status'] != 'ready':
                    await asyncio.sleep(.02)
        worker = asyncio.create_task(self.service.worker())
        try:
            await wait_ready()
        finally:
            worker.cancel()
            with self.assertRaises(asyncio.CancelledError): await worker
        old_collection = self.service.rows('SELECT collection FROM rag_index_locations WHERE document_id=?', (doc['id'],))[0]['collection']
        with patch.object(self.service, 'platform_config', return_value={'provider': 'openai', 'model': 'changed-model', 'dimensions': 4, 'api_key': 'fixture', 'base_url': ''}):
            worker = asyncio.create_task(self.service.worker())
            try:
                await asyncio.sleep(.02)
                await wait_ready()
            finally:
                worker.cancel()
                with self.assertRaises(asyncio.CancelledError): await worker
            locations = self.service.rows('SELECT collection FROM rag_index_locations WHERE document_id=?', (doc['id'],))
            self.assertEqual(len(locations), 1)
            self.assertNotEqual(locations[0]['collection'], old_collection)
