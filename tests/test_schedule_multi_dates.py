"""Calendar multi-selection and validity boundaries used by the automation editor."""
import unittest
from datetime import datetime, timezone
from service.scheduling import next_occurrence, normalize_schedule
from tests.test_console import StoreFixture


def utc(value):
    return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)


class CalendarSelectionTests(unittest.TestCase):
    def config(self, **changes):
        return normalize_schedule(dict(frequency='monthly', timezone='UTC', next_run='2099-01-01T00:00Z', time='09:30', **changes))

    def test_multiple_dates_run_in_order_and_roll_to_next_month(self):
        config = self.config(month_days=[23, 21, 22, 21])
        self.assertEqual(config['month_days'], [21, 22, 23])
        due = next_occurrence(config, utc('2099-01-21T09:30'))
        self.assertEqual(due, utc('2099-01-22T09:30'))
        self.assertEqual(next_occurrence(config, utc('2099-01-23T09:30')), utc('2099-02-21T09:30'))

    def test_short_months_skip_missing_dates(self):
        config = self.config(month_days=[30, 31])
        self.assertEqual(next_occurrence(config, utc('2099-02-01T00:00')), utc('2099-03-30T09:30'))
        self.assertEqual(next_occurrence(config, utc('2099-04-30T09:30')), utc('2099-05-30T09:30'))

    def test_single_date_legacy_configuration_keeps_working(self):
        config = self.config(month_day=15)
        self.assertEqual(config['month_days'], [15])
        self.assertEqual(next_occurrence(config, utc('2099-01-14T00:00')), utc('2099-01-15T09:30'))

    def test_invalid_multi_selection_is_rejected(self):
        for days in ([], [0], [32], [True], ['21'], 21, None):
            with self.subTest(days=days), self.assertRaises(ValueError):
                self.config(month_days=days)

    def test_range_start_and_inclusive_end_are_enforced(self):
        config = normalize_schedule(dict(frequency='monthly', timezone='Asia/Shanghai', next_run='2099-01-22T00:00+08:00', time='23:30', month_days=[21, 22, 23], end_date='2099-01-22'))
        self.assertEqual(next_occurrence(config, utc('2099-01-01T00:00')), utc('2099-01-22T15:30'))
        self.assertIsNone(next_occurrence(config, utc('2099-01-22T15:30')))

    def test_unrestricted_interval_runs_on_weekend(self):
        config = normalize_schedule(dict(frequency='interval', timezone='UTC', next_run='2026-10-23T23:00Z', interval_value=1, interval_unit='hours'))
        self.assertEqual(next_occurrence(config, utc('2026-10-23T23:00')), utc('2026-10-24T00:00'))


class PersistedCalendarSelectionTests(StoreFixture, unittest.TestCase):
    def setUp(self): self.create_store()
    def tearDown(self): self.clean_store()

    def test_save_and_edit_preserve_all_dates_and_recompute_due(self):
        first = self.resource('schedule', config=dict(frequency='monthly', timezone='UTC', next_run='2099-01-01T00:00Z', month_days=[21, 22, 23], time='09:30'))
        self.assertEqual(first['config']['month_days'], [21, 22, 23])
        self.assertEqual(datetime.fromisoformat(first['config']['next_run']), utc('2099-01-21T09:30'))
        edited = self.cap.save(self.user.id, {**first, 'config': {**first['config'], 'month_days': [22, 23]}}, first['id'])
        self.assertEqual(self.cap.get(self.user.id, first['id'])['config']['month_days'], [22, 23])
        self.assertEqual(datetime.fromisoformat(edited['config']['next_run']), utc('2099-01-22T09:30'))
