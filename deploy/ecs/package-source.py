#!/usr/bin/env python3
"""Package the current source snapshot without local credentials or user data."""
import fnmatch
from pathlib import Path
import sys
import tarfile

root = Path(__file__).resolve().parents[2]
target = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/moonclaw-ecs-app.tar.gz').resolve()
folders = ['app', 'components', 'lib', 'public', 'service', 'docs', 'deploy',
           'scripts', 'supabase', 'db', 'drizzle', 'worker', 'vendor/agentscope-web-ui']
skip = {'node_modules', '.git', '__pycache__', 'state', 'dist', '.next', '.venv',
        '.local-tools', 'backups', 'pgdata', '.aws', '.codex', '.agents', '.ssh'}
patterns = ['*.env', '*.key', '*.pem', '*.sqlite*', '*.log', '*.pyc', '*.dump', '*.pgpass']
files = set()
for folder in folders:
    for path in (root / folder).rglob('*'):
        if not path.is_file() or path.is_symlink():
            continue
        if any(p in skip or p.startswith('.env') for p in path.relative_to(root).parts):
            continue
        if any(fnmatch.fnmatch(path.name, pattern) for pattern in patterns):
            continue
        files.add(path)
for name in ['package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts',
             'worker-configuration.d.ts', 'tsconfig.json', 'postcss.config.mjs',
             'eslint.config.mjs', '.dockerignore', 'README.md', 'pyproject.toml']:
    path = root / name
    if path.exists():
        files.add(path)
with tarfile.open(target, 'w:gz') as archive:
    for path in sorted(files):
        archive.add(path, arcname=str(path.relative_to(root)), recursive=False)
print('Packaged %s source files to %s' % (len(files), target))
