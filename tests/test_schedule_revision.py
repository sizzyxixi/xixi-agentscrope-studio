"""Published server templates, linked tasks, UTC boundaries and live run replies."""
import asyncio
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from agentscope.event import TextBlockDeltaEvent, ThinkingBlockDeltaEvent
from service.schedule_templates import published
from service.runtime import AgentScopeRuntime, SessionRuntime
from service.scheduling import normalize_schedule, next_occurrence, within_validity
from tests.test_console import StoreFixture


class ScheduleRevisionTests(StoreFixture, unittest.TestCase):
    def setUp(self): self.create_store()
    def tearDown(self): self.clean_store()

    def test_templates_use_current_enabled_record_without_versions_or_tags(self):
        original = published(self.store)[0]
        self.store._conn.execute('UPDATE schedule_templates SET name=?,name_en=?,config_json=? WHERE id=?', ('后台新模板','Updated template',json.dumps({'frequency':'interval','interval_unit':'hours','interval_value':12,'agent_id':'main','model_id':'private-model'}),original['id']))
        self.store._conn.commit()
        chosen = next(x for x in published(self.store) if x['id']==original['id'])
        self.assertEqual((chosen['name'],chosen['name_en'],chosen['config']['interval_value']), ('后台新模板','Updated template',12))
        self.assertNotIn('version', chosen); self.assertNotIn('tags', chosen)
        self.assertNotIn('model_id', chosen['config']); self.assertNotIn('legacy_payload_json', chosen)
        self.store._conn.execute('UPDATE schedule_templates SET enabled=0 WHERE id=?', (original['id'],)); self.store._conn.commit()
        self.assertNotIn(original['id'], [x['id'] for x in published(self.store)])
        self.store._conn.execute('UPDATE schedule_templates SET enabled=1,visible=0 WHERE id=?', (original['id'],)); self.store._conn.commit()
        self.assertNotIn(original['id'], [x['id'] for x in published(self.store)])

    def test_user_task_is_independent_from_future_template_edits(self):
        template = published(self.store)[0]
        task = self.resource('schedule', content=template['content'], config={**template['config'], 'next_run':'2099-01-01T00:00Z', 'source_template_id':template['id'], 'source_template_version':99})
        self.store._conn.execute('UPDATE schedule_templates SET content=?, enabled=0 WHERE id=?', ('changed', template['id'])); self.store._conn.commit()
        saved = self.cap.get(self.user.id, task['id'])
        self.assertEqual(saved['content'], template['content'])
        self.assertEqual(saved['config']['source_template_id'], template['id'])
        self.assertNotIn('source_template_version', saved['config'])

    def test_both_languages_are_required_and_available(self):
        template = published(self.store)[0]
        self.assertTrue(template['name_en']); self.assertTrue(template['content_en'])
        self.assertNotEqual(template['content'],template['content_en'])
        self.store._conn.execute("UPDATE schedule_templates SET content_en='' WHERE id=?", (template['id'],)); self.store._conn.commit()
        self.assertNotIn(template['id'], [x['id'] for x in published(self.store)])

    def test_official_resources_are_resolved_per_account(self):
        from service.schedule_templates import prepare
        from service.official_connectors import OFFICIAL_CONNECTORS
        template = published(self.store)[0]
        config={**template['config'],'agent_id':'official-amazon','skill_slugs':['pdf'],'connector_ids':['official-logistics']}
        self.store._conn.execute('UPDATE schedule_templates SET config_json=? WHERE id=?', (json.dumps(config),template['id'])); self.store._conn.commit()
        with patch.dict(OFFICIAL_CONNECTORS, {'official-logistics': {'name':'Official Logistics','url':'https://example.com/mcp','enabled':True}}):
            first=prepare(self.cap,self.user.id,template['id']); second=prepare(self.cap,self.other.id,template['id'])
            self.assertNotEqual(first['config']['skill_ids'],second['config']['skill_ids'])
            self.assertNotEqual(first['config']['mcp_ids'],second['config']['mcp_ids'])
            again=prepare(self.cap,self.user.id,template['id'])
            self.assertEqual(first['config'],again['config'])
            skill=self.cap.get(self.user.id,first['config']['skill_ids'][0])
            self.assertEqual(skill['config']['package'],'pdf')
            self.store._conn.execute('UPDATE console_resources SET enabled=0 WHERE id=?',(skill['id'],)); self.store._conn.commit()
            prepare(self.cap,self.user.id,template['id'])
            self.assertFalse(self.cap.get(self.user.id,skill['id'])['enabled'])
            self.assertNotIn('model_id',first['config'])
        self.assertNotIn(template['id'],[x['id'] for x in published(self.store)])

    def test_private_agent_and_unknown_skill_cannot_be_used_by_public_templates(self):
        template=published(self.store)[0]
        for config in ({'agent_id':'private-agent'}, {'skill_slugs':['private-skill']}, {'connector_ids':['account-mcp']}):
            self.store._conn.execute('UPDATE schedule_templates SET config_json=? WHERE id=?',(json.dumps(config),template['id'])); self.store._conn.commit()
            self.assertNotIn(template['id'],[x['id'] for x in published(self.store)])

    def test_sqlite_legacy_migration_preserves_original_records_in_hidden_backup(self):
        from service.schedule_templates import install
        self.store._conn.execute('DROP TABLE schedule_templates')
        self.store._conn.execute("""CREATE TABLE schedule_templates (id TEXT,version INTEGER,name TEXT,content TEXT,description TEXT,icon TEXT,tags_json TEXT,config_json TEXT,enabled INTEGER,visible INTEGER,created_at TEXT,updated_at TEXT,PRIMARY KEY(id,version))""")
        for version in (1,2):
            self.store._conn.execute('INSERT INTO schedule_templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', ('legacy',version,f'legacy {version}','text','description','','["old tag"]','{"model_id":"old-model"}',1,1,'2026-01-01','2026-01-02'))
        self.store._conn.commit(); install(self.store)
        columns={row['name'] for row in self.store._conn.execute('PRAGMA table_info(schedule_templates)').fetchall()}
        self.assertNotIn('version',columns); self.assertNotIn('tags_json',columns)
        legacy=dict(self.store._conn.execute("SELECT * FROM schedule_templates WHERE id='legacy'").fetchone())
        self.assertEqual(legacy['name'],'legacy 2')
        self.assertEqual(len(json.loads(legacy['legacy_payload_json'])),2)
        self.assertNotIn('model_id',json.loads(legacy['config_json']))

    def test_related_schedules_are_enabled_and_account_scoped(self):
        skill = self.resource('skill')
        active = self.resource('schedule', config={'next_run':'2099-01-01T00:00Z','skill_ids':[skill['id']]})
        self.resource('schedule', name='paused', enabled=False, config={'next_run':'2099-01-01T00:00Z','skill_ids':[skill['id']]})
        self.assertEqual([t['id'] for t in self.cap.related_schedules(self.user.id,'skill',skill['id'])], [active['id']])
        self.assertEqual([t['id'] for t in self.cap.related_schedules(self.user.id,'agent','main')], [active['id']])
        with self.assertRaises(ValueError): self.cap.related_schedules(self.other.id,'skill',skill['id'])

    def test_review_metadata_does_not_disable_enabled_resources(self):
        self.assertTrue(self.cap.schedule_resource_available({'enabled':True,'config':{'review_status':'rejected'}}))
        self.assertFalse(self.cap.schedule_resource_available({'enabled':False,'config':{'review_status':'approved'}}))

    def test_interval_limits_and_removed_weekday_filter(self):
        base = dict(frequency='interval',timezone='UTC',next_run='2099-01-01T00:00Z',interval_unit='hours')
        for value in (1,24): self.assertEqual(normalize_schedule({**base,'interval_value':value,'weekdays':[]})['weekdays'],list(range(7)))
        for extra in ({'interval_value':0},{'interval_value':25},{'interval_value':1.5},{'interval_value':True},{'interval_value':1,'interval_unit':'minutes'}):
            with self.subTest(extra=extra), self.assertRaises(ValueError): normalize_schedule({**base,**extra})

    def test_absolute_datetimes_are_utc_and_range_end_is_inclusive(self):
        config = normalize_schedule(dict(frequency='daily', timezone='Asia/Shanghai', next_run='2099-01-01T09:00+08:00', end_date='2099-01-02'))
        self.assertEqual(config['start_at'],'2099-01-01T01:00:00+00:00')
        self.assertEqual(config['end_at'],'2099-01-02T15:59:59.999999+00:00')
        self.assertTrue(within_validity(config,datetime.fromisoformat(config['end_at'])))
        self.assertFalse(within_validity(config,datetime(2099,1,2,16,tzinfo=timezone.utc)))
        # User switches display timezone: the persisted absolute boundary is unchanged.
        projected = normalize_schedule({**config,'timezone':'America/New_York'})
        self.assertEqual(projected['end_at'],config['end_at'])


class LiveScheduleReplyTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.create_store(); self.runtime=AgentScopeRuntime(self.store)
        self.store.ensure_session('run-live', self.user.id)
        self.session=SessionRuntime(id='run-live',agent=None,model_key='test')
    async def asyncTearDown(self): self.clean_store()

    async def test_partial_reply_is_readable_before_reply_end(self):
        with patch('service.runtime.time.monotonic', return_value=100) as mono:
            for event in [ThinkingBlockDeltaEvent(reply_id='reply',block_id='thought',delta='正在分析'),TextBlockDeltaEvent(reply_id='reply',block_id='answer',delta='第一段')]:
                mono.return_value += 1
                async for _ in self.runtime._map_agent_event(self.session,event): pass
            message=self.store.list_messages('run-live')[0]
            self.assertEqual(message['content'],'第一段')
            self.assertTrue(any(part['type']=='reasoning' for part in message['parts']))
            mono.return_value += 1
            async for _ in self.runtime._map_agent_event(self.session,TextBlockDeltaEvent(reply_id='reply',block_id='answer',delta='第二段')): pass
            self.assertEqual(self.store.list_messages('run-live')[0]['content'],'第一段第二段')

    async def test_throttled_last_chunk_is_flushed_even_when_model_goes_silent(self):
        for text in ('first', 'last'):
            async for _ in self.runtime._map_agent_event(self.session, TextBlockDeltaEvent(reply_id='reply',block_id='answer',delta=text)): pass
        self.assertEqual(self.store.list_messages('run-live')[0]['content'], 'first')
        await asyncio.sleep(0.6)
        self.assertEqual(self.store.list_messages('run-live')[0]['content'], 'firstlast')


class TemplateApiTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import httpx
        from types import SimpleNamespace
        from service import main
        self.create_store()
        self.patches = [patch.object(main, 'runtime', SimpleNamespace(store=self.store)), patch.object(main, 'capabilities', self.cap)]
        for item in self.patches: item.start()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        for item in reversed(self.patches): item.stop()
        self.clean_store()

    async def test_template_preparation_requires_login_and_uses_current_enabled_copy(self):
        template = published(self.store)[0]
        endpoint = f'/console/schedule-templates/{template["id"]}/prepare'
        self.assertEqual((await self.client.post(endpoint)).status_code, 401)
        headers = {'authorization': f'Bearer {self.token}'}
        response = await self.client.post(endpoint, headers=headers)
        self.assertEqual(response.status_code, 200)
        prepared = response.json()['template']
        self.assertEqual(prepared['name_en'], template['name_en'])
        self.assertEqual(prepared['content_en'], template['content_en'])
        self.assertNotIn('model_id', prepared['config'])
        self.assertNotIn('version', prepared)
        self.store._conn.execute('UPDATE schedule_templates SET enabled=0 WHERE id=?', (template['id'],))
        self.store._conn.commit()
        self.assertEqual((await self.client.post(endpoint, headers=headers)).status_code, 400)
