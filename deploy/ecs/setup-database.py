#!/usr/bin/env python3
"""Initialize a fresh, independent ECS database; never loads local .env files."""
import os
import re
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path('/opt/moonclaw/database')
SOURCE = Path(__file__).resolve().parent
MIGRATIONS = SOURCE / 'migrations'

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def compose(*args, **kwargs):
    return run(['docker', 'compose', '--project-directory', str(ROOT), '-f', str(ROOT / 'compose.yml'), *args], **kwargs)

def private_file(path, text):
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(text)

def main():
    if os.geteuid() != 0:
        sys.exit('Run as root on the target ECS instance.')
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True)
    os.chmod(str(ROOT), 0o700)
    if (ROOT / '.initialized').exists():
        sys.exit('Database already initialized; refusing to reapply migrations.')
    if any((ROOT / 'pgdata').glob('*')):
        sys.exit('Existing database files found; refusing to overwrite or initialize.')
    files = sorted(MIGRATIONS.glob('*.sql'))
    if len(files) != 6:
        sys.exit('Expected the six reviewed project migrations.')
    admin_password, app_password = secrets.token_hex(32), secrets.token_hex(32)
    private_file(ROOT / 'database.env', 'POSTGRES_DB=agentscope\nPOSTGRES_USER=postgres\nPOSTGRES_PASSWORD=' + admin_password + '\nPOSTGRES_INITDB_ARGS=--auth-host=scram-sha-256\n')
    private_file(ROOT / 'backend-database.env', 'DATABASE_URL=postgresql://agentscope_app:' + app_password + '@127.0.0.1:5432/agentscope?sslmode=disable\n')
    private_file(ROOT / 'app.pgpass', '127.0.0.1:5432:agentscope:agentscope_app:' + app_password + '\n')
    shutil.copyfile(str(SOURCE / 'compose.yml'), str(ROOT / 'compose.yml'))
    (ROOT / 'backups').mkdir(mode=0o700, exist_ok=True)
    compose('up', '-d', '--wait', '--wait-timeout', '180')
    count = compose('exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'agentscope', '-Atc', "SELECT count(*) FROM pg_tables WHERE schemaname='agentscope'", stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True).stdout.strip()
    if count != '0':
        sys.exit('Existing business schema found; refusing to modify it.')
    sql = ["BEGIN; CREATE ROLE agentscope_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '" + app_password + "';"]
    for path in files:
        # Supabase's browser roles do not exist in standalone PostgreSQL.
        text = path.read_text().replace(', anon, authenticated', '')
        text = re.sub(r'^(BEGIN;|COMMIT;)\s*$', '', text, flags=re.M)
        sql.append(text)
    sql.append('''
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE agentscope TO agentscope_app;
GRANT USAGE ON SCHEMA agentscope TO agentscope_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA agentscope TO agentscope_app;
DO $acl$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='agentscope' LOOP
    EXECUTE format('CREATE POLICY backend_access ON agentscope.%I TO agentscope_app USING (true) WITH CHECK (true)', t.tablename);
  END LOOP;
END $acl$;
COMMIT;
''')
    compose('exec', '-T', 'postgres', 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'agentscope', input='\n'.join(sql), universal_newlines=True)
    # TCP/password authentication as the non-superuser application account,
    # including a rolled-back write under RLS.
    check = """
SELECT current_user, count(*) AS business_tables FROM information_schema.tables WHERE table_schema='agentscope' GROUP BY current_user;
SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname=current_user;
BEGIN;
INSERT INTO agentscope.users VALUES ('ecs-install-check', 'ecs-install-check', 'test-only', 'test-only', CURRENT_TIMESTAMP::text);
SELECT count(*) AS test_rows FROM agentscope.users WHERE id='ecs-install-check';
ROLLBACK;
"""
    compose('exec', '-T', '-e', 'PGPASSFILE=/run/secrets/app.pgpass', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-U', 'agentscope_app', '-d', 'agentscope', input=check, universal_newlines=True)
    private_file(ROOT / '.initialized', '33 business tables; six source migrations; dedicated RLS backend policy\n')
    print('Database ready. Credentials remain only in root-readable files under ' + str(ROOT))

if __name__ == '__main__':
    main()
