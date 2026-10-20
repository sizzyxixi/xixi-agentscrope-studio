import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from service.store import StudioStore


class TokenActivityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'state.db'
        self.store = StudioStore(self.path, Path(self.temp.name))
        self.user, _ = self.store.create_user('reporter', 'password')
        self.other, _ = self.store.create_user('outsider', 'password')
        self.store.ensure_session('mine', self.user.id)
        self.store.ensure_session('other', self.other.id)
        self.now = datetime(2026, 10, 20, 4, tzinfo=timezone.utc)

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    def record(self, call, incoming, outgoing, at, session='mine'):
        ledger = self.store.token_usage
        ledger.start_turn(session, session)
        ledger.start_call(session, call, 'fixture')
        ledger.update_call(call, incoming, outgoing, True)
        with self.store._conn:
            self.store._conn.execute('UPDATE token_calls SET created_at=? WHERE id=?', (at, call))

    def test_beijing_midnight_owner_filter_and_date_window(self):
        self.record('today', 100, 20, '2026-10-19T16:00:00+00:00')
        self.record('yesterday', 30, 3, '2026-10-19T15:59:59+00:00')
        self.record('other-user', 9000, 9000, '2026-10-20T00:00:00+00:00', 'other')
        self.record('future', 500, 500, '2026-10-20T16:00:00+00:00')
        self.record('old', 500, 500, '2025-01-01T00:00:00+00:00')
        result = self.store.token_usage.activity(self.user.id, self.now)
        self.assertEqual(len(result['data']), 182)
        self.assertEqual(result['today_tokens'], 120)
        self.assertEqual(result['last_30_days_tokens'], 153)
        self.assertEqual(result['total_tokens'], 153)
        self.assertEqual(result['call_count'], 2)
        self.assertEqual(result['data'][-2], {'date': '2026-10-19', 'count': 33})

    def test_cumulative_updates_zero_missing_and_undated_are_distinct(self):
        self.record('cumulative', 100, 20, '2026-10-20T00:00:00+00:00')
        self.store.token_usage.update_call('cumulative', 110, 25, True)
        self.record('missing', None, None, '2026-10-20T00:00:00+00:00')
        self.record('zero', 0, 0, '2026-10-20T00:00:00+00:00')
        self.record('undated', 1000, 1000, '')
        result = self.store.token_usage.activity(self.user.id, self.now)
        self.assertEqual(result['total_tokens'], 135)
        self.assertEqual(result['missing_calls'], 1)
        self.assertEqual(result['undated_calls'], 1)
        self.assertEqual(result['call_count'], 3)

    def test_empty_user_has_zero_filled_calendar(self):
        result = self.store.token_usage.activity(self.user.id, self.now)
        self.assertEqual(result['total_tokens'], 0)
        self.assertTrue(all(point['count'] == 0 for point in result['data']))

    def test_legacy_call_dates_are_recovered_only_from_linked_messages(self):
        self.record('legacy', 10, 5, '')
        self.store.add_message('mine', 'assistant', 'reply', message_id='reply')
        self.store.token_usage.link('mine', 'reply', 'mine')
        with self.store._conn:
            self.store._conn.execute("UPDATE messages SET created_at='2026-10-20T00:00:00+00:00' WHERE id='reply'")
            self.store._conn.execute('DROP INDEX token_calls_created')
            self.store._conn.execute('ALTER TABLE token_calls DROP COLUMN created_at')
        self.store._conn.close()
        self.store = StudioStore(self.path, Path(self.temp.name))
        self.assertEqual(self.store.token_usage.activity(self.user.id, self.now)['today_tokens'], 15)
