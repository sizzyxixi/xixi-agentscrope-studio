#!/usr/bin/env python3
"""Run the service suite against disposable local state, never the developer DB."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
env = os.environ.copy()
for key in list(env):
    if key.startswith(('SUPABASE_', 'OPENAI_', 'ANTHROPIC_', 'GEMINI_', 'DASHSCOPE_')):
        env.pop(key, None)
with tempfile.TemporaryDirectory(prefix='xixi-service-tests-') as folder:
    env.update(DATABASE_URL='', PYTHON_DOTENV_DISABLED='1', AGENTSCOPE_SERVERLESS='0',
               AGENTSCOPE_STATE_DB=str(Path(folder) / 'state.sqlite3'),
               AGENTSCOPE_FILE_STORAGE='local', AGENTSCOPE_PLATFORM_ADMIN_USERS='')
    result = subprocess.run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests',
                             '-p', 'test_*.py', '-v', *sys.argv[1:]], cwd=root, env=env)
sys.exit(result.returncode)
