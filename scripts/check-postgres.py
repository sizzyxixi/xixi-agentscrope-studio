"""Opt-in cloud smoke check; creates and removes its own disposable account."""
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
if not os.getenv('DATABASE_URL'):
    raise SystemExit('DATABASE_URL must be configured locally.')
os.environ['AGENTSCOPE_SERVERLESS'] = '1'

from fastapi.testclient import TestClient
from service.main import app, runtime, capabilities
from service.store import StudioStore

client = TestClient(app)
username = 'DeployCheck' + secrets.token_hex(5)
password = secrets.token_urlsafe(24)
response = client.post('/auth/register', json={'username': username, 'password': password})
if response.status_code != 200:
    raise RuntimeError(f'Registration failed: {response.status_code} {response.text}')
user_id = response.json()['user']['id']
headers = {'Authorization': 'Bearer ' + response.json()['token']}
session_id = 'deploy-check-' + secrets.token_hex(8)
other_connection = None
try:
    response = client.post('/auth/login', json={'username': username.upper(), 'password': password})
    response.raise_for_status()
    print('PASS registration and case-insensitive login', flush=True)
    # A rejected write must not leave the PostgreSQL transaction unusable.
    response = client.post('/auth/register', json={'username': username.upper(), 'password': password})
    assert response.status_code == 400
    for path in ['/auth/me', '/sessions', '/console/resources', '/console/knowledge-bases', '/console/status']:
        response = client.get(path, headers=headers)
        response.raise_for_status()
        print('PASS', path, flush=True)
    store = runtime.store
    store.ensure_session(session_id, user_id)
    store.add_message(session_id, 'user', 'Cloud persistence check')
    # Opening a separate connection proves data is committed outside this process.
    other_connection = StudioStore()
    assert other_connection.list_messages(session_id)[0]['content'] == 'Cloud persistence check'
    print('PASS persisted messages visible from a separate connection', flush=True)
    recent = store.list_sessions(user_id, include_source=True, group='recent', search='Cloud persistence')
    assert [item['id'] for item in recent] == [session_id]
    assert store.list_sessions(user_id, include_source=True, group='automation') == []
    assert store.list_sessions(user_id, include_source=True, group='recent', offset=1) == []
    from service.schedule_templates import published
    templates = published(store)
    assert len(templates) == 6 and all(item['name_en'] and item['content_en'] for item in templates)
    print('PASS grouped session search/pagination and bilingual published templates', flush=True)
    ledger = store.token_usage
    ledger.start_turn(session_id, 'check-' + session_id)
    ledger.start_call('check-' + session_id, 'call-' + session_id, 'fixture')
    ledger.update_call('call-' + session_id, 2, 3, True)
    ledger.link(session_id, 'message-' + session_id, 'check-' + session_id)
    ledger.link(session_id, 'message-' + session_id, 'check-' + session_id)
    assert ledger.activity(user_id)['total_tokens'] == 5
    assert capabilities.runs(user_id) == []
    print('PASS usage aggregation, upsert, nullable JSON filters', flush=True)
finally:
    if other_connection:
        other_connection._conn.close()
    with runtime.store._lock:
        connection = runtime.store._conn
        connection.rollback()
        for table, column, value in [
            ('token_calls', 'id', 'call-' + session_id),
            ('token_messages', 'session_id', session_id),
            ('token_turns', 'session_id', session_id),
            ('messages', 'session_id', session_id),
            ('sessions', 'id', session_id),
            *[(table, 'user_id', user_id) for table in
              ['auth_tokens', 'user_onboarding', 'console_resources', 'skill_market_users', 'model_settings']],
            ('users', 'id', user_id),
        ]:
            connection.execute(f'DELETE FROM {table} WHERE {column}=?', (value,))
        connection.commit()
    print('Removed disposable test account and records.', flush=True)
