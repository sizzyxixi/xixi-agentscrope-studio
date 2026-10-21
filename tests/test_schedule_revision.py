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

    def test_templates_come_from_latest_enabled_version_without_review(self):
        original = published(self.store)[0]
        row = self.store._conn.execute('SELECT * FROM schedule_templates WHERE id=? AND version=?', (original['id'], original['version'])).fetchone()
        newer = dict(row); newer.update(version=2, name='后台新模板', enabled=0, tags_json='["后台标签"]', config_json=json.dumps({'frequency':'interval','interval_unit':'hours','interval_value':12,'agent_id':'main','skill_ids':[],'mcp_ids':[],'time':'12:00'}))
        cols = list(newer)
        self.store._conn.execute(f'INSERT INTO schedule_templates ({",".join(cols)}) VALUES ({",".join("?" for _ in cols)})', tuple(newer.values()))
        self.store._conn.commit()
        self.assertEqual(next(x for x in published(self.store) if x['id']==original['id'])['version'], 1)
        self.store._conn.execute('UPDATE schedule_templates SET enabled=1 WHERE id=? AND version=2', (original['id'],)); self.store._conn.commit()
        chosen = next(x for x in published(self.store) if x['id']==original['id'])
        self.assertEqual((chosen['version'],chosen['name'],chosen['tags'],chosen['config']['interval_value']), (2,'后台新模板',['后台标签'],12))
        self.store._conn.execute('UPDATE schedule_templates SET visible=0 WHERE id=? AND version=2', (original['id'],)); self.store._conn.commit()
        self.assertNotIn(original['id'], [x['id'] for x in published(self.store)])

    def test_user_task_is_independent_from_future_template_edits(self):
        template = published(self.store)[0]
        task = self.resource('schedule', content=template['content'], config={**template['config'], 'next_run':'2099-01-01T00:00Z', 'source_template_id':template['id'], 'source_template_version':template['version']})
        self.store._conn.execute('UPDATE schedule_templates SET content=?, enabled=0 WHERE id=?', ('changed', template['id'])); self.store._conn.commit()
        saved = self.cap.get(self.user.id, task['id'])
        self.assertEqual(saved['content'], template['content'])
        self.assertEqual(saved['config']['source_template_version'], template['version'])

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
