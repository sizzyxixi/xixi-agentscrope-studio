import unittest
from datetime import datetime, timezone
from service.scheduling import normalize_schedule, next_occurrence, within_validity


def moment(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


class RecurrenceTests(unittest.TestCase):
    def config(self, frequency='daily', start='2026-01-31T08:30:00+08:00', **values):
        return normalize_schedule({'frequency': frequency, 'next_run': start, **values})

    def test_calendar_month_skips_nonexistent_day(self):
        config = self.config('monthly')
        self.assertEqual(next_occurrence(config, moment('2026-01-31T01:00Z')), moment('2026-03-31T00:30Z'))

    def test_yearly_leap_day(self):
        config = self.config('yearly', '2024-02-29T08:30:00+08:00')
        self.assertEqual(next_occurrence(config, moment('2024-03-01T00:00Z')), moment('2028-02-29T00:30Z'))

    def test_weekly_first_run_matches_selected_weekday(self):
        config = self.config('weekly', '2026-10-20T08:30:00+08:00', weekdays=[0, 4])
        self.assertEqual(next_occurrence(config, moment(config['start_at']), inclusive=True), moment('2026-10-23T00:30Z'))

    def test_biweekly_anchors_to_start_week(self):
        config = self.config('biweekly', '2026-10-19T08:30:00+08:00', weekdays=[0, 4])
        self.assertEqual(next_occurrence(config, moment('2026-10-23T01:00Z')), moment('2026-11-02T00:30Z'))

    def test_interval_skips_missed_occurrences_without_drift(self):
        config = self.config('interval', '2026-10-20T08:30:00+08:00', interval_value=3, interval_unit='hours')
        self.assertEqual(next_occurrence(config, moment('2026-10-20T03:00Z')), moment('2026-10-20T03:30Z'))

    def test_expiration_includes_end_of_selected_day(self):
        config = self.config(end_date='2026-02-01')
        self.assertTrue(within_validity(config, moment('2026-02-01T15:59:59Z')))
        self.assertFalse(within_validity(config, moment('2026-02-01T16:00Z')))
        self.assertIsNone(next_occurrence(config, moment('2026-02-01T01:00Z')))

    def test_daily_keeps_local_clock_across_dst(self):
        config = self.config('daily', '2026-03-07T08:30:00-05:00', timezone='America/New_York')
        self.assertEqual(next_occurrence(config, moment('2026-03-07T15:00Z')), moment('2026-03-08T12:30Z'))

    def test_dst_gap_is_skipped(self):
        config = self.config('daily', '2026-03-07T02:30:00-05:00', timezone='America/New_York')
        self.assertEqual(next_occurrence(config, moment('2026-03-07T15:00Z')), moment('2026-03-09T06:30Z'))

    def test_once_has_no_following_occurrence(self):
        config = self.config('once')
        self.assertIsNone(next_occurrence(config, moment('2026-02-01T00:00Z')))

    def test_invalid_config_rejected(self):
        for values in ({'frequency': 'invalid'}, {'timezone': 'fake/timezone'}, {'frequency': 'weekly', 'weekdays': []}, {'frequency': 'interval', 'interval_value': 0}, {'end_date': '2026-01-01'}):
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.config(**values)
