"""Versioned server-owned automation templates; publication is an enable switch."""
import json
from pathlib import Path
from .store import utc_now

SCHEMA = '''CREATE TABLE IF NOT EXISTS schedule_templates (
    id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL,
    content TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]', config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(id, version)
)'''


def install(store):
    with store._lock:
        store._conn.execute(SCHEMA)
        # Cloud rows are installed by the migration, rather than by requests.
        if store.backend == 'sqlite':
            for item in json.loads(Path(__file__).with_suffix('.json').read_text()):
                store._conn.execute('INSERT OR IGNORE INTO schedule_templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', (
                    item['id'], item['version'], item['name'], item['content'], item['description'], item['icon'],
                    json.dumps(item['tags'], ensure_ascii=False), json.dumps(item['config']),
                    int(item['enabled']), int(item['visible']), utc_now(), utc_now()))
        store._conn.commit()


def published(store):
    with store._lock:
        rows = store._conn.execute('''SELECT t.* FROM schedule_templates t
            WHERE t.enabled=1 AND t.visible=1 AND t.version=(
                SELECT MAX(v.version) FROM schedule_templates v WHERE v.id=t.id AND v.enabled=1)
            ORDER BY t.created_at,t.id''').fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item['tags'] = json.loads(item.pop('tags_json'))[:3]
        item['config'] = json.loads(item.pop('config_json'))
        item['enabled'] = bool(item['enabled'])
        item['visible'] = bool(item['visible'])
        result.append(item)
    return result
