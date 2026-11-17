#!/usr/bin/env python3
"""Build, probe and release only Web, retaining the previous Compose for rollback."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.request import urlopen


APP = Path('/opt/moonclaw/app')
COMPOSE = APP / 'compose.ecs.yml'


def run(*args, **kwargs):
    return subprocess.run(args, cwd=str(APP), check=True, **kwargs)


def output(*args):
    return subprocess.check_output(args, cwd=str(APP)).decode().strip()


def compose(path, *args):
    return ['docker', 'compose', '--project-directory', str(APP), '--env-file',
            str(APP / '.env'), '-p', 'agentscope-ecs', '-f', str(path), *args]


def configuration(path):
    return json.loads(output(*compose(path, 'config', '--format', 'json')))


def probe(base, commit):
    for attempt in range(60):
        try:
            with urlopen(base + '/release.json', timeout=5) as response:
                if json.load(response)['commit'] != commit:
                    raise ValueError('Unexpected release')
            for route in ['/', '/products-demo', '/materials-demo', '/store-demo',
                          '/api/console/health']:
                with urlopen(base + route, timeout=10) as response:
                    if response.status != 200:
                        raise ValueError('Unhealthy route')
                    if route.endswith('/health'):
                        health = json.load(response)
                        if health.get('database') != 'postgresql':
                            raise ValueError('Unexpected database')
            return
        except Exception:
            if attempt == 59:
                raise RuntimeError('Release HTTP verification failed')
            time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--commit', required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    if not re.fullmatch(r'[0-9a-f]{40}', args.commit):
        raise ValueError('Expected a full Git commit SHA')
    if source.parent.parent != Path('/opt/moonclaw/releases') or source.name != 'source':
        raise ValueError('Source must be /opt/moonclaw/releases/<release>/source')
    release = source.parent.name
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{1,80}', release):
        raise ValueError('Invalid release name')
    image = 'agentscope-ecs-web:' + release
    previous = configuration(COMPOSE)
    previous_text = COMPOSE.read_text()
    backup = source.parent / 'previous-compose.yml'
    if backup.exists():
        raise RuntimeError('This release already has a rollback snapshot; use a new release')
    backup.write_text(previous_text)
    backup.chmod(0o600)
    candidate = APP / ('.compose-' + release + '.yml')
    lines = previous_text.splitlines(keepends=True)
    in_web = False
    replaced = 0
    for index, line in enumerate(lines):
        if re.match(r'^  [a-zA-Z0-9_-]+:\s*$', line):
            in_web = line.strip() == 'web:'
        if in_web and line.startswith('    image:'):
            lines[index] = '    image: ' + image + '\n'
            replaced += 1
        if in_web and line.startswith('      context:'):
            lines[index] = '      context: ' + str(source) + '\n'
            replaced += 1
    if replaced != 2:
        raise RuntimeError('Unrecognized Web Compose configuration')
    candidate.write_text(''.join(lines))
    candidate.chmod(0o600)
    updated = configuration(candidate)
    expected = json.loads(json.dumps(previous))
    expected['services']['web']['image'] = image
    expected['services']['web']['build']['context'] = str(source)
    if expected != updated:
        raise RuntimeError('Release would change services other than Web')
    untouched = {name: output('docker', 'inspect', '--format', '{{.Id}}', name)
                 for name in ['agentscope-ecs-backend-1', 'agentscope-ecs-proxy-1',
                              'moonclaw-db-postgres-1', 'intent-platform-app']}
    metadata = {'commit': args.commit, 'release': release,
                'built_at': datetime.datetime.utcnow().isoformat() + 'Z'}
    (source / 'public' / 'release.json').write_text(json.dumps(metadata) + '\n')
    run('docker', 'build', '-f', str(source / 'deploy/railway/Dockerfile.web'),
        '-t', image, str(source))
    preview = output('docker', 'run', '-d', '--rm', '--network', 'agentscope-ecs_default',
                     '-e', 'AGENTSCOPE_SERVICE_URL=http://backend:8790',
                     '-p', '127.0.0.1::8080', image)
    try:
        port = output('docker', 'port', preview, '8080/tcp').split(':')[-1]
        probe('http://127.0.0.1:' + port, args.commit)
        print('PASS candidate image and HTTP routes', flush=True)
    finally:
        run('docker', 'stop', preview, stdout=subprocess.DEVNULL)
    run('/opt/moonclaw/database/backup-database.sh')
    try:
        if COMPOSE.read_text() != previous_text:
            raise RuntimeError('Compose changed during build; refusing activation')
        os.replace(str(candidate), str(COMPOSE))
        run(*compose(COMPOSE, 'up', '-d', '--no-deps', 'web'))
        probe('http://127.0.0.1:8080', args.commit)
        run('python3', str(source / 'deploy/ecs/smoke-app.py'))
        for name, container_id in untouched.items():
            if output('docker', 'inspect', '--format', '{{.Id}}', name) != container_id:
                raise RuntimeError('Unexpected container replacement: ' + name)
    except BaseException:
        COMPOSE.write_text(previous_text)
        COMPOSE.chmod(0o600)
        run(*compose(COMPOSE, 'up', '-d', '--no-deps', 'web'))
        print('ROLLBACK restored previous Web image', flush=True)
        raise
    metadata['previous_image'] = previous['services']['web']['image']
    (source.parent / 'release.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print('RELEASE_SUCCESS ' + release + ' ' + args.commit, flush=True)


if __name__ == '__main__':
    main()
