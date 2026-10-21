"""Single-record, bilingual platform templates with official resource references."""
import json
from pathlib import Path
from .store import utc_now
from .agent_catalog import official_agents
from . import skill_market, official_connectors

SCHEMA = '''CREATE TABLE IF NOT EXISTS schedule_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL, content_en TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '', config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    legacy_payload_json TEXT NOT NULL DEFAULT '[]'
)'''
PUBLIC_COLUMNS = 'id,name,name_en,content,content_en,description,description_en,icon,config_json,enabled,visible,created_at,updated_at'
CONFIG_KEYS = {'frequency','time','weekdays','month','month_day','month_days','interval_value','interval_unit',
               'start_at','end_date','end_at','agent_id','skill_slugs','connector_ids'}


def clean_config(config):
    return {key: value for key, value in config.items() if key in CONFIG_KEYS}


def validate(item):
    for key, limit in [('name',100),('name_en',100),('content',2000),('content_en',2000)]:
        if not isinstance(item.get(key), str) or not 1 <= len(item[key].strip()) <= limit:
            raise ValueError('请完整填写中英文模板名称和提示词。')
    config = item['config']
    allowed_agents = {'main'} | {agent['id'] for agent in official_agents() if agent['enabled']}
    if config.get('agent_id', 'main') not in allowed_agents:
        raise ValueError('模板只能关联智能体市场中已生效的官方智能体。')
    for key, available in [('skill_slugs',{skill['slug'] for skill in skill_market.catalog()}),
                           ('connector_ids',{connector['id'] for connector in official_connectors.catalog()})]:
        values = config.get(key, [])
        if not isinstance(values,list) or len(values)>3 or any(not isinstance(value,str) or value not in available for value in values) or len(set(values))!=len(values):
            raise ValueError('模板技能和连接器只能引用已启用的官方条目，各最多3个。')


def install(store):
    with store._lock:
        if store.backend == 'sqlite':
            columns = {row['name'] for row in store._conn.execute('PRAGMA table_info(schedule_templates)').fetchall()}
            if 'version' in columns:
                rows = [dict(row) for row in store._conn.execute('SELECT * FROM schedule_templates ORDER BY id,version').fetchall()]
                grouped = {}
                for row in rows: grouped.setdefault(row['id'], []).append(row)
                store._conn.execute('BEGIN')
                try:
                    store._conn.execute('ALTER TABLE schedule_templates RENAME TO schedule_templates_legacy_migration')
                    store._conn.execute(SCHEMA)
                    for records in grouped.values():
                        row = records[-1]
                        config = json.loads(row['config_json'])
                        private_bindings = bool(config.get('skill_ids') or config.get('mcp_ids'))
                        enabled = row['enabled'] and not private_bindings
                        config = clean_config(config)
                        store._conn.execute('INSERT INTO schedule_templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (
                            row['id'],row['name'],'',row['content'],'',row['description'],'',row['icon'],json.dumps(config),
                            int(enabled),row['visible'],records[0]['created_at'],row['updated_at'],json.dumps(records)))
                    store._conn.execute('DROP TABLE schedule_templates_legacy_migration')
                    store._conn.commit()
                except BaseException:
                    store._conn.rollback()
                    raise
            else:
                store._conn.execute(SCHEMA)
            for item in json.loads(Path(__file__).with_suffix('.json').read_text()):
                validate(item)
                store._conn.execute('INSERT OR IGNORE INTO schedule_templates ('+PUBLIC_COLUMNS+') VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', (
                    item['id'],item['name'],item['name_en'],item['content'],item['content_en'],item['description'],item['description_en'],item['icon'],json.dumps(item['config']),
                    int(item['enabled']),int(item['visible']),utc_now(),utc_now()))
                # Backfill translations only for unchanged bundled copy.
                store._conn.execute("UPDATE schedule_templates SET name_en=?,content_en=?,description_en=? WHERE id=? AND name=? AND content=? AND name_en='' AND content_en=''", (
                    item['name_en'],item['content_en'],item['description_en'],item['id'],item['name'],item['content']))
        store._conn.commit()


def published(store):
    with store._lock:
        rows = store._conn.execute('SELECT '+PUBLIC_COLUMNS+' FROM schedule_templates WHERE enabled=1 AND visible=1 ORDER BY created_at,id').fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item['config'] = clean_config(json.loads(item.pop('config_json')))
        try: validate(item)
        except ValueError: continue
        item['enabled'] = bool(item['enabled'])
        item['visible'] = bool(item['visible'])
        result.append(item)
    return result


def prepare(capabilities, user_id, template_id):
    template = next((item for item in published(capabilities.store) if item['id']==template_id), None)
    if template is None: raise ValueError('模板已停用或关联的官方能力不可用，请选择其他模板。')
    config = dict(template['config'])
    # Resolve platform package slugs to this account; never copy another user's IDs.
    config['skill_ids'] = [capabilities.install_market_skill(user_id, slug)['id'] for slug in config.pop('skill_slugs', [])]
    connector_ids = config.pop('connector_ids', [])
    definitions = {item['id']:item for item in official_connectors.catalog()}
    installed = capabilities.list(user_id, 'mcp')
    config['mcp_ids'] = []
    for identity in connector_ids:
        definition = definitions[identity]
        resource = next((item for item in installed if item['config'].get('official_connector_id')==identity and item['config'].get('url')==definition['url']), None)
        if resource is None:
            import uuid
            resource_id, now = 'mcp-' + uuid.uuid5(uuid.NAMESPACE_URL, f'xixi:{user_id}:official:{identity}:{definition["url"]}').hex, utc_now()
            with capabilities.store._lock:
                capabilities.store._conn.execute('INSERT OR IGNORE INTO console_resources VALUES (?,?,?,?,?,?,?,?,?)', (
                    resource_id,user_id,'mcp',definition['name'],definition.get('description',''),1,
                    json.dumps({'url':definition['url'],'transport':'streamable-http','official_connector_id':identity}),now,now))
                capabilities.store._conn.commit()
            resource = capabilities.get(user_id,resource_id)
        config['mcp_ids'].append(resource['id'])
    return {**template,'config':config}
