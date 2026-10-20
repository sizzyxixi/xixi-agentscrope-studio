"""Regression coverage for the client schedule lifecycle and execution contract."""
import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone
from service.scheduling import normalize_schedule, next_occurrence
from tests.test_console import StoreFixture, FakeRuntime


def stamp():
    return datetime.now(timezone.utc)


class ScheduleRequirementTests(StoreFixture, unittest.TestCase):
    def setUp(self): self.create_store()
    def tearDown(self): self.clean_store()

    def task(self, **values):
        return self.resource('schedule', config={'next_run': '2099-01-01T10:00Z'}, **values)

    def test_trim_unique_name_prompt_limit_and_create_idempotency(self):
        body = {'kind': 'schedule', 'name': '  报表  ', 'content': '  生成报表  ', 'request_id': 'same-submit', 'config': {'next_run': '2099-01-01T10:00Z'}}
        first = self.cap.save(self.user.id, body)
        self.assertEqual(first['name'], '报表')
        self.assertEqual(first['content'], '生成报表')
        self.assertEqual(self.cap.save(self.user.id, body)['id'], first['id'])
        self.assertEqual(len(self.cap.list(self.user.id, 'schedule')), 1)
        with self.assertRaisesRegex(ValueError, '任务名称已存在'):
            self.cap.save(self.user.id, {**body, 'request_id': 'another-submit'})
        self.assertEqual(self.cap.save(self.other.id, body)['name'], '报表')
        for content in ['   ', 'a' * 2001]:
            with self.assertRaises(ValueError): self.task(name='invalid', content=content)

    def test_concurrent_edit_uses_revision_and_keeps_winner(self):
        first = self.task()
        updated = self.cap.save(self.user.id, {**first, 'content': 'first edit'}, first['id'])
        self.assertEqual(updated['revision'], first['revision'] + 1)
        with self.assertRaisesRegex(ValueError, '刷新后重新编辑'):
            self.cap.save(self.user.id, {**first, 'content': 'stale edit'}, first['id'])
        self.assertEqual(self.cap.get(self.user.id, first['id'])['content'], 'first edit')

    def test_past_period_start_is_valid_and_never_replays_past_ticks(self):
        task = self.resource('schedule', config={'frequency': 'daily', 'next_run': '2000-01-01T10:00Z', 'time': '09:30'})
        self.assertGreater(datetime.fromisoformat(task['config']['next_run']), stamp())
        with self.assertRaises(ValueError):
            self.resource('schedule', name='past once', config={'frequency': 'once', 'next_run': '2000-01-01T10:00Z'})

    def test_pause_then_resume_recalculates_from_now(self):
        first = self.task()
        paused = self.cap.set_schedule_enabled(self.user.id, first['id'], False, first['revision'])
        self.assertEqual(paused['status'], 'paused')
        config = {**paused['config'], 'start_at': '2000-01-01T10:00Z', 'next_run': '2000-01-01T10:00Z'}
        self.store._conn.execute('UPDATE console_resources SET config_json=? WHERE id=?', (json.dumps(config), first['id']))
        self.store._conn.commit()
        resumed = self.cap.set_schedule_enabled(self.user.id, first['id'], True, paused['revision'])
        self.assertEqual(resumed['status'], 'active')
        self.assertGreater(datetime.fromisoformat(resumed['config']['next_run']), stamp())

    def test_pause_still_works_after_bound_skill_is_deleted(self):
        skill = self.resource('skill')
        first = self.resource('schedule', config={'next_run': '2099-01-01T10:00Z', 'skill_ids': [skill['id']]})
        self.cap.delete(self.user.id, skill['id'])
        paused = self.cap.set_schedule_enabled(self.user.id, first['id'], False, first['revision'])
        self.assertEqual(paused['status'], 'paused')

    def test_expired_task_is_ended_and_cannot_resume_without_new_time(self):
        first = self.task()
        config = {**first['config'], 'start_at': '2000-01-01T10:00Z', 'next_run': '2000-01-01T10:00Z', 'end_date': '2001-01-01'}
        self.store._conn.execute('UPDATE console_resources SET enabled=0,config_json=? WHERE id=?', (json.dumps(config), first['id']))
        self.store._conn.commit()
        ended = self.cap.get(self.user.id, first['id'])
        self.assertEqual(ended['status'], 'ended')
        with self.assertRaisesRegex(ValueError, '超过截止时间'):
            self.cap.set_schedule_enabled(self.user.id, ended['id'], True, ended['revision'])
        with self.assertRaisesRegex(ValueError, '新的有效执行时间'):
            self.cap.save(self.user.id, {**ended, 'content': 'edited'}, ended['id'])
        revived = self.cap.save(self.user.id, {**ended, 'config': {**ended['config'], 'end_date': ''}}, ended['id'])
        self.assertEqual(revived['status'], 'active')

    def test_month_day_and_clock_are_independent_from_period_start(self):
        config = normalize_schedule({'frequency': 'monthly', 'next_run': '2099-01-20T18:00Z', 'timezone': 'UTC', 'month_day': 15, 'time': '09:30'})
        self.assertEqual(next_occurrence(config, datetime(2099, 1, 21, tzinfo=timezone.utc)), datetime(2099, 2, 15, 9, 30, tzinfo=timezone.utc))
        config = normalize_schedule({**config, 'frequency': 'yearly', 'month': 2, 'month_day': 29})
        self.assertEqual(next_occurrence(config, datetime(2099, 1, 21, tzinfo=timezone.utc)), datetime(2104, 2, 29, 9, 30, tzinfo=timezone.utc))
        with self.assertRaises(ValueError): normalize_schedule({**config, 'month': 4, 'month_day': 31})

    def test_interval_filters_weekdays_without_resetting_anchor(self):
        config = normalize_schedule({'frequency': 'interval', 'timezone': 'Asia/Shanghai', 'next_run': '2026-10-19T08:00:00+08:00', 'interval_value': 3, 'interval_unit': 'hours', 'weekdays': [0, 2, 4]})
        after = datetime.fromisoformat('2026-10-20T00:00:00+08:00')
        due = next_occurrence(config, after)
        self.assertEqual(due, datetime.fromisoformat('2026-10-21T02:00:00+08:00'))
        for values in ({'weekdays': []}, {'interval_value': 1000000}, {'interval_value': 1.5}, {'interval_unit': 'days'}):
            with self.assertRaises(ValueError): normalize_schedule({**config, **values})
        self.assertEqual(normalize_schedule({**config, 'interval_value': 999999})['interval_value'], 999999)

    def test_schedule_run_limit_is_applied_before_workflow_filtering(self):
        now = stamp()
        for index in range(60):
            when = (now + timedelta(seconds=index)).isoformat()
            kind = 'schedule' if index < 55 else 'workflow'
            self.store._conn.execute("INSERT INTO console_runs (id,user_id,resource_id,name,session_id,status,detail,created_at,updated_at,snapshot_json) VALUES (?,?,?,?,?,'success','',?,?,?)", (str(index), self.user.id, 'deleted-task', 'snapshot name', f'run-{index}', when, when, json.dumps({'kind': kind})))
        self.store._conn.commit()
        runs = self.cap.runs(self.user.id, 'schedule')
        self.assertEqual(len(runs), 50)
        self.assertEqual(runs[0]['id'], '54')
        self.assertTrue(all(run['kind'] == 'schedule' for run in runs))
        self.assertEqual(self.cap.runs(self.other.id, 'schedule'), [])

    def test_direct_session_lookup_is_owned_and_not_limited_to_recent_sessions(self):
        self.store.ensure_session('old-session', self.user.id)
        for index in range(55): self.store.ensure_session(f'new-session-{index}', self.user.id)
        self.assertNotIn('old-session', {row['id'] for row in self.store.list_sessions(self.user.id)})
        self.assertEqual(self.store.list_sessions(self.user.id, session_id='old-session')[0]['id'], 'old-session')
        self.assertEqual(self.store.list_sessions(self.other.id, session_id='old-session'), [])

    def test_legacy_interval_days_are_migrated_without_changing_cadence(self):
        from service.capabilities import ConsoleCapabilities
        task = self.task()
        config = {**task['config'], 'frequency': 'interval', 'interval_unit': 'days', 'interval_value': 3}
        self.store._conn.execute('UPDATE console_resources SET config_json=? WHERE id=?', (json.dumps(config), task['id']))
        self.store._conn.commit()
        migrated = ConsoleCapabilities(self.store).get(self.user.id, task['id'])
        self.assertEqual(migrated['config']['interval_unit'], 'hours')
        self.assertEqual(migrated['config']['interval_value'], 72)
        self.assertEqual(migrated['config']['weekdays'], list(range(7)))


class ScheduleExecutionRequirementTests(StoreFixture, unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.create_store()
        self.store.create_model_setting(self.user.id, 'openai', 'test', 'test-model', '', 'dummy-test-key', True)
        self.fake = FakeRuntime(self.store)
        self.cap.runtime = self.fake
    async def asyncTearDown(self):
        await self.cap.close()
        self.clean_store()
    async def drain(self): await asyncio.gather(*list(self.cap.tasks))

    async def test_selected_resources_do_not_replace_task_id_and_block_duplicate_run(self):
        skill = self.resource('skill')
        mcp = self.resource('mcp', config={'url': 'http://127.0.0.1:8888/mcp'})
        task = self.resource('schedule', config={'next_run': '2099-01-01T10:00Z', 'skill_ids': [skill['id']], 'mcp_ids': [mcp['id']]})
        first = self.cap.start_run(self.user, task['id'])
        with self.assertRaisesRegex(ValueError, '任务正在执行'): self.cap.start_run(self.user, task['id'])
        record = self.cap.runs(self.user.id)[0]
        self.assertEqual(record['resource_id'], task['id'])
        self.assertEqual(record['session_id'], first['session_id'])
        self.assertTrue(self.cap.get(self.user.id, task['id'])['executing'])
        self.assertEqual(self.cap.get(self.user.id, task['id'])['config']['next_run'], task['config']['next_run'])
        await self.drain()

    async def test_pause_or_delete_does_not_cancel_started_execution(self):
        task = self.resource('schedule', config={'next_run': '2099-01-01T10:00Z'})
        run = self.cap.start_run(self.user, task['id'])
        self.cap.set_schedule_enabled(self.user.id, task['id'], False, task['revision'])
        with self.assertRaisesRegex(ValueError, '仅运行中'): self.cap.start_run(self.user, task['id'])
        self.cap.delete(self.user.id, task['id'])
        await self.drain()
        record = self.cap.runs(self.user.id, 'schedule')[0]
        self.assertEqual(record['status'], 'success')
        self.assertEqual(record['name'], task['name'])
        self.assertTrue(self.store.list_sessions(self.user.id, session_id=run['session_id']))

    async def test_deleted_task_still_continues_from_approval_snapshot(self):
        self.fake.events = [{'type': 'approval_required'}]
        task = self.resource('schedule', config={'next_run': '2099-01-01T10:00Z'})
        run = self.cap.start_run(self.user, task['id'])
        await self.drain()
        self.cap.delete(self.user.id, task['id'])
        self.cap.after_approval(self.user, run['session_id'], True, True)
        await self.drain()
        self.assertEqual(self.cap.runs(self.user.id, 'schedule')[0]['status'], 'success')

    async def test_failure_does_not_disable_repeating_task(self):
        self.fake.events = [{'type': 'done', 'level': 'warning', 'detail': 'provider unavailable'}]
        task = self.resource('schedule', config={'next_run': '2099-01-01T10:00Z'})
        self.cap.start_run(self.user, task['id'])
        await self.drain()
        self.assertEqual(self.cap.runs(self.user.id)[0]['status'], 'failed')
        self.assertEqual(self.cap.get(self.user.id, task['id'])['status'], 'active')

    async def test_api_schedule_state_and_session_lookup_require_ownership(self):
        import httpx
        from unittest.mock import patch
        from service import main
        from service.runtime import AgentScopeRuntime
        task = self.resource('schedule', config={'next_run': '2099-01-01T10:00Z'})
        self.store.ensure_session('private-schedule-run', self.user.id)
        headers = {'authorization': f'Bearer {self.token}'}
        other_headers = {'authorization': f'Bearer {self.other_token}'}
        runtime = AgentScopeRuntime(self.store)
        runtime.capabilities = self.cap
        with patch.object(main, 'runtime', runtime), patch.object(main, 'capabilities', self.cap):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://test') as client:
                path = f"/console/resources/{task['id']}/schedule-state"
                payload = {'enabled': False, 'revision': task['revision']}
                self.assertEqual((await client.post(path, json=payload)).status_code, 401)
                self.assertEqual((await client.post(path, json=payload, headers=other_headers)).status_code, 400)
                paused = await client.post(path, json=payload, headers=headers)
                self.assertEqual(paused.json()['resource']['status'], 'paused')
                self.assertEqual((await client.post(path, json=payload, headers=headers)).status_code, 400)
                path = '/console/sessions/private-schedule-run'
                self.assertEqual((await client.get(path, headers=headers)).status_code, 200)
                denied = await client.get(path, headers=other_headers)
                self.assertEqual(denied.status_code, 404)
                self.assertEqual(denied.json()['detail'], '会话不可用。')
