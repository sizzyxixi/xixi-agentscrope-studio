"""PostgreSQL connection for the existing store's small SQLite SQL surface.

Cloud schemas are installed with the reviewed Supabase migrations, never by
application requests. The local SQLite implementation remains available.
"""
from __future__ import annotations

import re
import sqlite3


class Row(dict):
    def __getitem__(self, key):
        return tuple(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


class Result:
    def __init__(self, rows=(), rowcount=0):
        self.rows = iter(rows)
        self.rowcount = rowcount

    def __iter__(self):
        return self.rows

    def fetchone(self):
        return next(self.rows, None)

    def fetchall(self):
        return list(self.rows)


def parameters(sql):
    # Preserve question marks inside SQL literals, and escape literal percent
    # signs for psycopg's parameter protocol.
    sql = sql.replace('%', '%%')
    return re.sub(r"'(?:''|[^'])*'|\?", lambda m: '%s' if m[0] == '?' else m[0], sql)


class PostgresConnection:
    def __init__(self, url):
        import psycopg
        self.psycopg = psycopg
        self.url = url
        self.connection = None
        self.columns = {}
        self.keys = {}
        self._connect()
        rows = self.connection.execute("""
            SELECT c.table_name, c.column_name,
              EXISTS (SELECT 1 FROM information_schema.table_constraints t
                JOIN information_schema.key_column_usage k
                  ON k.constraint_name=t.constraint_name AND k.table_schema=t.table_schema
                WHERE t.constraint_type='PRIMARY KEY' AND t.table_schema=c.table_schema
                  AND t.table_name=c.table_name AND k.column_name=c.column_name) AS primary_key
            FROM information_schema.columns c WHERE c.table_schema='agentscope'
            ORDER BY c.table_name,c.ordinal_position
        """).fetchall()
        for table, column, primary in rows:
            self.columns.setdefault(table, []).append(column)
            if primary:
                self.keys.setdefault(table, []).append(column)
        self.connection.commit()
        if len(self.columns) < 30:
            raise RuntimeError('Supabase agentscope schema is incomplete; apply supabase/migrations first.')

    def _connect(self):
        self.connection = self.psycopg.connect(
            self.url, connect_timeout=15, prepare_threshold=None,
            options='-c search_path=agentscope,public -c statement_timeout=30000',
        )

    def translate(self, sql):
        sql = sql.strip().rstrip(';')
        sql = re.sub(r"json_extract\((\w+),\s*'\$\.(\w+)'\)", r"(\1::jsonb ->> '\2')", sql)
        sql = re.sub(r"json_set\((\w+),\s*'\$\.(\w+)',\s*\?\)",
                     r"jsonb_set(\1::jsonb, '{\2}', to_jsonb(?::text))::text", sql)
        sql = re.sub(r"date\(([\w.]+),\s*'\+8 hours'\)",
                     r"((NULLIF(\1,'')::timestamptz AT TIME ZONE 'Asia/Shanghai')::date)::text", sql, flags=re.I)
        sql = re.sub(r"date\(([\w.]+)\)", r"(NULLIF(\1,'')::timestamptz::date)::text", sql, flags=re.I)
        # PostgreSQL cannot infer the type of a parameter used only by IS NULL.
        sql = re.sub(r'\?\s+IS NULL', '?::text IS NULL', sql, flags=re.I)
        # SQLite upsert permits an unqualified target column; PostgreSQL does not.
        if 'ON CONFLICT' in sql.upper():
            sql = sql.replace('revision=revision+1', 'revision=rag_documents.revision+1')
        match = re.match(r'INSERT OR (IGNORE|REPLACE) INTO (\w+)', sql, re.I)
        if match:
            mode, table = match.groups()
            sql = re.sub(r'INSERT OR (?:IGNORE|REPLACE)', 'INSERT', sql, count=1, flags=re.I)
            if mode.upper() == 'IGNORE':
                sql += ' ON CONFLICT DO NOTHING'
            else:
                keys = self.keys[table]
                cols = self.columns[table]
                assignments = ','.join(f'{col}=excluded.{col}' for col in cols if col not in keys)
                sql += f" ON CONFLICT ({','.join(keys)}) DO UPDATE SET {assignments}"
        return parameters(sql)

    def execute(self, sql, params=()):
        pragma = re.fullmatch(r'\s*PRAGMA table_info\((\w+)\)\s*', sql, re.I)
        if pragma:
            return Result([Row(name=name) for name in self.columns[pragma[1]]])
        if 'sqlite_master' in sql:
            sql = sql.replace('sqlite_master', 'information_schema.tables').replace("type='table'", "table_schema='agentscope'").replace("name=", 'table_name=').replace('SELECT name ', 'SELECT table_name AS name ')
        if re.match(r'\s*(CREATE|ALTER|PRAGMA)\b', sql, re.I):
            # DDL is performed by migrations, including RLS and privilege checks.
            return Result()
        if self.connection.closed:
            self._connect()
        try:
            if self.connection.info.transaction_status == self.psycopg.pq.TransactionStatus.IDLE:
                self.connection.execute('BEGIN')
            # A failed statement must not poison subsequent requests or prevent
            # the store from translating a duplicate username into a 400.
            with self.connection.transaction():
                cursor = self.connection.execute(self.translate(sql), params)
                rows = []
                if cursor.description:
                    names = [col.name for col in cursor.description]
                    rows = [Row(zip(names, row)) for row in cursor.fetchall()]
                return Result(rows, cursor.rowcount)
        except self.psycopg.IntegrityError as error:
            raise sqlite3.IntegrityError(str(error)) from error
        except Exception:
            self.connection.rollback()
            raise

    def executescript(self, sql):
        for statement in sql.split(';'):
            if statement.strip():
                self.execute(statement)

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()

    def __enter__(self):
        return self

    def __exit__(self, kind, value, traceback):
        self.rollback() if kind else self.commit()
