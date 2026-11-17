#!/usr/bin/env python3
"""Exercise the ECS HTTP/API boundary with disposable data; no paid model calls."""
import json
from pathlib import Path
import secrets
import subprocess
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE = 'http://127.0.0.1:8080'

def request(path, method='GET', payload=None, token=None, content_type=None):
    headers = {}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if isinstance(payload, dict):
        payload = json.dumps(payload).encode()
        content_type = 'application/json'
    if content_type:
        headers['Content-Type'] = content_type
    try:
        response = urlopen(Request(BASE + path, data=payload, headers=headers, method=method), timeout=30)
    except HTTPError as error:
        response = error
    raw = response.read()
    try:
        result = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        result = raw
    return response.status, result

def check(condition, label):
    if not condition:
        raise RuntimeError('FAIL ' + label)
    print('PASS ' + label, flush=True)

credentials = json.loads(Path('/opt/moonclaw/config/initial-admin.json').read_text())
user_id = None
file_info = None
session = 'ecs-smoke-' + secrets.token_hex(8)
user_token = None
admin_token = None
try:
    status, health = request('/api/console/health')
    check(status == 200 and health['database'] == 'postgresql', 'health uses PostgreSQL')
    check(request('/api/auth/me')[0] == 401, 'anonymous API blocked')
    status, admin = request('/api/auth/login', 'POST', credentials)
    check(status == 200, 'administrator login')
    admin_token = admin['token']
    status, access = request('/api/console/platform-access', token=admin_token)
    check(status == 200 and access['can_manage'], 'administrator permission')
    status, agents = request('/api/agentscope-service/agent', token=admin_token)
    check(status == 200, 'official configuration API')
    status, account = request('/api/auth/register', 'POST', {'username': 'EcsCheck' + secrets.token_hex(5), 'password': secrets.token_urlsafe(24)})
    check(status == 200, 'ordinary account registration')
    user_id = account['user']['id']
    user_token = account['token']
    status, access = request('/api/console/platform-access', token=user_token)
    check(status == 200 and not access['can_manage'], 'ordinary account has no administrator access')
    check(request('/api/agentscope-service/agent', token=user_token)[0] == 403, 'official configuration denies ordinary account')
    status, _ = request('/api/console/sessions/' + session, 'PUT', {'title': 'ECS disposable verification', 'create_if_missing': True}, token=user_token)
    check(status == 200, 'session persisted')
    boundary = 'EcsBoundary' + secrets.token_hex(10)
    sample = b'MoonClaw ECS persistence verification\n'
    body = ('--' + boundary + '\r\nContent-Disposition: form-data; name="session_id"\r\n\r\n' + session + '\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="ecs-check.txt"\r\nContent-Type: text/plain\r\n\r\n').encode() + sample + ('\r\n--' + boundary + '--\r\n').encode()
    status, uploaded = request('/api/files/upload', 'POST', body, token=user_token, content_type='multipart/form-data; boundary=' + boundary)
    check(status == 200, 'encrypted local file upload')
    file_info = uploaded['file']
    if '--restart' in sys.argv:
        subprocess.run(['docker', 'compose', '-f', 'compose.ecs.yml', 'restart', 'backend'], check=True, stdin=subprocess.DEVNULL)
        subprocess.run(['docker', 'compose', '-f', 'compose.ecs.yml', 'up', '-d', 'backend', '--wait', '--wait-timeout', '90'], check=True, stdin=subprocess.DEVNULL)
        print('PASS backend restart completed; verifying persisted token and file', flush=True)
    status, downloaded = request('/api/files/' + file_info['id'] + '/content', token=user_token)
    check(status == 200 and downloaded == sample, 'file download matches original')
    check(request('/api/files/' + file_info['id'] + '/content', token=admin_token)[0] == 404, 'administrator cannot read another user private file')
    print('HTTP_ACCEPTANCE_SUCCESS', flush=True)
finally:
    if file_info:
        request('/api/files/' + file_info['id'], 'DELETE', {'version': file_info['version']}, token=user_token)
    if user_token:
        request('/api/console/sessions/' + session, 'DELETE', token=user_token)
    cleanup = '''
import json,sys
from service.store import StudioStore
c=json.load(sys.stdin)
s=StudioStore()
try:
 if c['user_id']:
  for table in ['studio_file_versions','studio_file_deliveries','file_cleanup']:
   s._conn.execute('DELETE FROM '+table+' WHERE file_id IN (SELECT id FROM studio_files WHERE user_id=?)',(c['user_id'],))
  for table in ['studio_files','auth_tokens','user_onboarding','console_resources','skill_market_users','model_settings']:
   s._conn.execute('DELETE FROM '+table+' WHERE user_id=?',(c['user_id'],))
  s._conn.execute('DELETE FROM users WHERE id=?',(c['user_id'],))
 if c['admin_token']:
  s._conn.execute('DELETE FROM auth_tokens WHERE token=?',(c['admin_token'],))
 s._conn.commit()
 print('Disposable account and test authentication cleaned up.')
finally:s._conn.close()
'''
    subprocess.run(['docker','compose','-f','compose.ecs.yml','exec','-T','backend','python','-c',cleanup], input=json.dumps({'user_id':user_id,'admin_token':admin_token}), universal_newlines=True, check=True)
