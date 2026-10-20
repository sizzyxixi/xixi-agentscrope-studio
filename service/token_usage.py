"""Per-user-submission usage ledger; capture actual provider usage, never estimate tokens."""
from __future__ import annotations

import uuid
from contextlib import aclosing
from collections.abc import AsyncIterable
from datetime import datetime, timedelta, timezone

from agentscope.middleware import MiddlewareBase


class TokenUsageLedger:
    def __init__(self, store):
        self.store = store
        with store._lock:
            store._conn.executescript('''
                CREATE TABLE IF NOT EXISTS token_turns (
                    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, phase TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS token_calls (
                    id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, model TEXT NOT NULL,
                    input_tokens INTEGER, output_tokens INTEGER, finished INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS token_calls_turn ON token_calls(turn_id);
                CREATE TABLE IF NOT EXISTS token_messages (
                    message_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, turn_id TEXT NOT NULL
                );
            ''')
            columns = {row['name'] for row in store._conn.execute('PRAGMA table_info(token_calls)')}
            if 'created_at' not in columns:
                store._conn.execute("ALTER TABLE token_calls ADD COLUMN created_at TEXT NOT NULL DEFAULT ''")
                # Recover dates only when an existing persisted message proves them.
                store._conn.execute('''UPDATE token_calls SET created_at = COALESCE((
                    SELECT MIN(m.created_at) FROM token_messages tm
                    JOIN messages m ON m.id = tm.message_id AND m.session_id = tm.session_id
                    WHERE tm.turn_id = token_calls.turn_id), '')''')
            store._conn.execute('CREATE INDEX IF NOT EXISTS token_calls_created ON token_calls(created_at)')
            store._conn.commit()

    def start_turn(self, session_id, turn_id):
        with self.store._lock, self.store._conn:
            self.store._conn.execute('INSERT OR IGNORE INTO token_turns VALUES (?,?,?)', (turn_id, session_id, 'running'))

    def phase(self, turn_id, phase):
        with self.store._lock, self.store._conn:
            self.store._conn.execute('UPDATE token_turns SET phase=? WHERE id=?', (phase, turn_id))

    def start_call(self, turn_id, call_id, model):
        with self.store._lock, self.store._conn:
            self.store._conn.execute('INSERT OR IGNORE INTO token_calls (id,turn_id,model,created_at) VALUES (?,?,?,?)',
                                     (call_id, turn_id, model, datetime.now(timezone.utc).isoformat()))

    def activity(self, user_id, now=None):
        """Daily provider-reported usage for this user's sessions, in Beijing time."""
        local_tz = timezone(timedelta(hours=8))
        today = (now or datetime.now(timezone.utc)).astimezone(local_tz).date()
        start = today - timedelta(days=181)
        with self.store._lock:
            rows = self.store._conn.execute('''
                SELECT date(c.created_at, '+8 hours') AS day,
                    COUNT(*) AS calls,
                    SUM(CASE WHEN c.input_tokens IS NOT NULL AND c.output_tokens IS NOT NULL
                        THEN c.input_tokens ELSE 0 END) AS input_tokens,
                    SUM(CASE WHEN c.input_tokens IS NOT NULL AND c.output_tokens IS NOT NULL
                        THEN c.output_tokens ELSE 0 END) AS output_tokens,
                    SUM(CASE WHEN c.input_tokens IS NULL OR c.output_tokens IS NULL
                        THEN 1 ELSE 0 END) AS missing_calls
                FROM token_calls c JOIN token_turns t ON t.id = c.turn_id
                JOIN sessions s ON s.id = t.session_id
                WHERE s.user_id = ? AND date(c.created_at, '+8 hours') BETWEEN ? AND ?
                GROUP BY day ORDER BY day
            ''', (user_id, start.isoformat(), today.isoformat())).fetchall()
            undated = self.store._conn.execute('''
                SELECT COUNT(*) FROM token_calls c JOIN token_turns t ON t.id = c.turn_id
                JOIN sessions s ON s.id = t.session_id
                WHERE s.user_id = ? AND date(c.created_at) IS NULL
            ''', (user_id,)).fetchone()[0]
        by_day = {row['day']: dict(row) for row in rows}
        data = []
        for offset in range(182):
            day = (start + timedelta(days=offset)).isoformat()
            row = by_day.get(day, {})
            data.append({'date': day, 'count': row.get('input_tokens', 0) + row.get('output_tokens', 0)})
        return {
            'start': start.isoformat(), 'end': today.isoformat(), 'timezone': 'Asia/Shanghai',
            'data': data, 'total_tokens': sum(point['count'] for point in data),
            'today_tokens': data[-1]['count'],
            'last_30_days_tokens': sum(point['count'] for point in data[-30:]),
            'input_tokens': sum(row['input_tokens'] for row in rows),
            'output_tokens': sum(row['output_tokens'] for row in rows),
            'call_count': sum(row['calls'] for row in rows),
            'missing_calls': sum(row['missing_calls'] for row in rows),
            'undated_calls': undated,
        }

    def update_call(self, call_id, input_tokens, output_tokens, finished):
        # Stream usage is a cumulative snapshot: overwrite the same call, never add deltas.
        with self.store._lock, self.store._conn:
            self.store._conn.execute('UPDATE token_calls SET input_tokens=?,output_tokens=?,finished=? WHERE id=?',
                                     (input_tokens, output_tokens, int(finished), call_id))

    def link(self, session_id, message_id, turn_id):
        with self.store._lock, self.store._conn:
            self.store._conn.execute('INSERT OR REPLACE INTO token_messages VALUES (?,?,?)', (message_id, session_id, turn_id))

    def summary(self, session_id, turn_id):
        with self.store._lock:
            turn = self.store._conn.execute('SELECT phase FROM token_turns WHERE id=? AND session_id=?', (turn_id, session_id)).fetchone()
            if not turn:
                return None
            calls = self.store._conn.execute('SELECT input_tokens,output_tokens,finished FROM token_calls WHERE turn_id=?', (turn_id,)).fetchall()
        known = [call for call in calls if call['input_tokens'] is not None and call['output_tokens'] is not None]
        input_tokens = sum(call['input_tokens'] for call in known)
        output_tokens = sum(call['output_tokens'] for call in known)
        complete = bool(calls) and len(known) == len(calls) and all(call['finished'] for call in calls)
        status = ('complete' if complete else 'incomplete') if turn['phase'] == 'completed' else (
            turn['phase'] if turn['phase'] in {'running', 'waiting'} else 'incomplete')
        return {'turn_id': turn_id, 'input_tokens': input_tokens if known else None,
                'output_tokens': output_tokens if known else None,
                'total_tokens': input_tokens + output_tokens if known else None,
                'call_count': len(calls), 'status': status}

    def for_message(self, session_id, message_id):
        with self.store._lock:
            row = self.store._conn.execute('SELECT turn_id FROM token_messages WHERE session_id=? AND message_id=?', (session_id, message_id)).fetchone()
        return self.summary(session_id, row['turn_id']) if row else None


class TokenUsageMiddleware(MiddlewareBase):
    def __init__(self, ledger, session_id):
        self.ledger = ledger
        self.session_id = session_id
        self.turn_id = ''

    async def on_model_call(self, agent, input_kwargs, next_handler):
        if not self.turn_id:
            return await next_handler(**input_kwargs)
        turn_id = self.turn_id
        call_id = uuid.uuid4().hex
        model = input_kwargs.get('current_model')
        self.ledger.start_call(turn_id, call_id, str(getattr(model, 'model', 'unknown')))
        counts = (None, None)

        def capture(response):
            nonlocal counts
            usage = getattr(response, 'usage', None)
            if usage is None:
                return
            incoming = getattr(usage, 'input_tokens', None)
            outgoing = getattr(usage, 'output_tokens', None)
            if type(incoming) is int and incoming >= 0 and type(outgoing) is int and outgoing >= 0:
                # Anthropic reports cache reads/writes outside its base input token count.
                if type(model).__name__ == 'AnthropicChatModel':
                    incoming += max(0, getattr(usage, 'cache_input_tokens', 0)) + max(0, getattr(usage, 'cache_creation_input_tokens', 0))
                counts = (incoming, outgoing)
                self.ledger.update_call(call_id, *counts, False)

        try:
            result = await next_handler(**input_kwargs)
        except BaseException:
            self.ledger.update_call(call_id, *counts, False)
            raise
        if not isinstance(result, AsyncIterable):
            capture(result)
            self.ledger.update_call(call_id, *counts, True)
            return result

        async def tracked_stream():
            finished = False
            try:
                async with aclosing(result):
                    async for response in result:
                        capture(response)
                        finished = finished or bool(getattr(response, 'is_last', False))
                        # Store before yielding the final response, so ModelCallEnd can read it.
                        self.ledger.update_call(call_id, *counts, finished)
                        yield response
            finally:
                self.ledger.update_call(call_id, *counts, finished)
        return tracked_stream()

    async def on_compress_context(self, agent, input_kwargs, next_handler):
        # AgentScope's context summarization bypasses on_model_call. Track each raw
        # structured request (including retries) through the same usage collector.
        model = agent.model
        original = getattr(model, '_call_api_with_structured_output', None)
        if original is None:
            return await next_handler(**input_kwargs)

        async def tracked(*args, **kwargs):
            async def invoke(**_ignored):
                return await original(*args, **kwargs)
            return await self.on_model_call(agent, {'current_model': model}, invoke)

        model._call_api_with_structured_output = tracked
        try:
            return await next_handler(**input_kwargs)
        finally:
            model._call_api_with_structured_output = original
