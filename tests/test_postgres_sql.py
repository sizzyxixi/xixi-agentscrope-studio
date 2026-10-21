"""SQL parity checks that do not need database credentials."""
import unittest
from unittest.mock import Mock

from service.postgres import PostgresConnection, Row, parameters


class PostgresSQLTests(unittest.TestCase):
    def setUp(self):
        self.connection = PostgresConnection.__new__(PostgresConnection)
        self.connection.columns = {'execution_scopes': ['session_id', 'user_id', 'config_json']}
        self.connection.keys = {'execution_scopes': ['session_id']}

    def test_sql_literals_are_not_parameters(self):
        self.assertEqual(parameters("SELECT '?' AS literal, ? WHERE name LIKE '%foo%'"),
                         "SELECT '?' AS literal, %s WHERE name LIKE '%%foo%%'")

    def test_replace_updates_existing_scope(self):
        sql = self.connection.translate('INSERT OR REPLACE INTO execution_scopes VALUES (?,?,?)')
        self.assertIn('ON CONFLICT (session_id) DO UPDATE SET user_id=excluded.user_id,config_json=excluded.config_json', sql)

    def test_ignore_uses_all_unique_constraints(self):
        self.assertTrue(self.connection.translate('INSERT OR IGNORE INTO users VALUES (?)').endswith('ON CONFLICT DO NOTHING'))

    def test_json_update_remains_text(self):
        sql = self.connection.translate("UPDATE console_runs SET snapshot_json=json_set(snapshot_json, '$.kind', ?) WHERE json_extract(snapshot_json, '$.kind') IS NULL")
        self.assertIn("jsonb_set(snapshot_json::jsonb, '{kind}', to_jsonb(%s::text))::text", sql)
        self.assertIn("(snapshot_json::jsonb ->> 'kind') IS NULL", sql)

    def test_empty_usage_dates_remain_unknown(self):
        sql = self.connection.translate("SELECT date(c.created_at, '+8 hours'), date(c.created_at)")
        self.assertIn("NULLIF(c.created_at,'')", sql)
        self.assertIn("AT TIME ZONE 'Asia/Shanghai'", sql)

    def test_nullable_filter_has_known_type(self):
        self.assertIn('%s::text IS NULL', self.connection.translate('SELECT 1 WHERE (? IS NULL OR id=?)'))

    def test_rows_support_names_positions_and_dict(self):
        row = Row(name='test', count=2)
        self.assertEqual(row[0], row['name'])
        self.assertEqual(dict(row), {'name': 'test', 'count': 2})

    def test_rollback_of_a_lost_connection_does_not_mask_error(self):
        self.connection.connection = Mock(closed=True)
        self.connection.dirty = True
        self.connection.rollback()
        self.connection.connection.rollback.assert_not_called()
        self.assertFalse(self.connection.dirty)
