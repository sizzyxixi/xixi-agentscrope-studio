#!/usr/bin/env python3
"""Provision the explicitly authorized ECS admin; never print the password."""
import json
import os
from pathlib import Path
import secrets
import subprocess

path = Path('/opt/moonclaw/config/initial-admin.json')
if path.exists():
    credentials = json.loads(path.read_text())
else:
    credentials = {'username': 'sizzy', 'password': secrets.token_urlsafe(24)}
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(credentials, f)
code = '''
import json, os, sys
from service.store import StudioStore
from service.platform_catalog import platform_admin_names
c = json.load(sys.stdin)
assert c['username'].casefold() in platform_admin_names(), 'Administrator must be explicitly configured first.'
s = StudioStore()
try:
    exists = s._conn.execute('SELECT id FROM users WHERE lower(username)=lower(?)', (c['username'],)).fetchone()
    if exists:
        s.login_user(c['username'], c['password'])
    else:
        s.create_user(c['username'], c['password'])
    print(json.dumps({'admin': c['username'], 'ready': True}))
finally:
    s._conn.close()
'''
subprocess.run(['docker', 'compose', '-f', 'compose.ecs.yml', 'exec', '-T', 'backend', 'python', '-c', code], input=json.dumps(credentials), universal_newlines=True, check=True)
print('Initial credentials saved in root-only /opt/moonclaw/config/initial-admin.json')
