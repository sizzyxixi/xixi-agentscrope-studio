#!/usr/bin/env python3
"""Prepare a fresh ECS environment without reading Supabase credentials."""
import base64
import os
from pathlib import Path
import shutil

root = Path('/opt/moonclaw')
os.umask(0o077)
for name in ['config', 'app-data', 'caddy-data', 'caddy-config']:
    (root / name).mkdir(parents=True, exist_ok=True)
target = root / 'config/backend.env'
if not target.exists():
    database = (root / 'database/backend-database.env').read_text().strip()
    database = database.replace('@127.0.0.1:5432/', '@postgres:5432/')
    values = [database, 'AGENTSCOPE_STATE_DB=/data/state.sqlite3',
              'AGENTSCOPE_FILE_STORAGE=local', 'AGENTSCOPE_SERVERLESS=0',
              'HF_HOME=/data/huggingface', 'XIXI_KB_QDRANT_URL=',
              'AGENTSCOPE_PLATFORM_ADMIN_USERS=']
    for name in ['FILE', 'KNOWLEDGE', 'CHANNEL', 'MCP']:
        values.append('AGENTSCOPE_' + name + '_KEY=' + base64.urlsafe_b64encode(os.urandom(32)).decode())
    fd = os.open(str(target), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        output.write('\n'.join(values) + '\n')
caddy = root / 'config/Caddyfile'
if not caddy.exists():
    caddy.write_text(':80 {\n    reverse_proxy web:8080 {\n        flush_interval -1\n    }\n}\n')
shutil.copyfile('deploy/ecs/app.compose.yml', 'compose.ecs.yml')
Path('.env').write_text('APP_RELEASE=20261112-ecs-01\n')
print('ECS application configuration prepared; no credentials printed.')
