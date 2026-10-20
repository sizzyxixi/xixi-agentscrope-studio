"""Upload the approved MasterGo artwork to the public agent asset prefix.

Requires server-side Supabase credentials in .env. Existing differing objects
are never overwritten. Only the ten explicitly mapped design assets are sent.
"""
from pathlib import Path
import hashlib
import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ASSETS = {
    'banner.png': 'image-3-58638.png',
    'amazon.png': '矩形-13730-3-58417.png',
    'shopee.png': '矩形-13730-3-58494.png',
    'temu.png': '矩形-13730-3-58401.png',
    'lazada.png': '矩形-13730-3-58622.png',
    'shein.png': '矩形-13730-3-58490.png',
    'tiktok.png': '矩形-13730-3-58535.png',
    'wildberries.png': '矩形-13730-3-58568.png',
    '1688.png': '矩形-13730-3-58564.png',
    'aliexpress.png': '矩形-13730-5-46495.png',
}

def main():
    env = dotenv_values(ROOT / '.env')
    url = env.get('SUPABASE_URL', '').rstrip('/')
    bucket = env.get('SUPABASE_STORAGE_BUCKET', 'xixi-agentscope-studio')
    secret = env.get('SUPABASE_SECRET_KEY') or env.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not secret:
        raise SystemExit('Supabase server credentials are required.')
    headers = {'apikey': secret}
    if not secret.startswith('sb_secret_'):
        headers['Authorization'] = f'Bearer {secret}'
    with httpx.Client(timeout=60) as client:
        for name, source in ASSETS.items():
            data = (ROOT / 'outputs/mastergo-agent/asset/images' / source).read_bytes()
            path = f'assert/agent/{name}'
            public = f'{url}/storage/v1/object/public/{bucket}/{path}'
            old = client.get(public)
            if old.is_success:
                if old.content != data:
                    raise SystemExit(f'Refusing to replace different existing object: {path}')
                action = 'verified'
            else:
                if old.status_code not in (400, 404):
                    raise SystemExit(f'Cannot inspect {path}: HTTP {old.status_code}')
                response = client.post(f'{url}/storage/v1/object/{bucket}/{path}', headers={**headers, 'Content-Type': 'image/png', 'x-upsert': 'false', 'cache-control': '3600'}, content=data)
                if not response.is_success:
                    raise SystemExit(f'Upload failed for {path}: HTTP {response.status_code}')
                actual = client.get(public)
                if not actual.is_success or hashlib.sha256(actual.content).digest() != hashlib.sha256(data).digest():
                    raise SystemExit(f'Public asset verification failed: {path}')
                action = 'uploaded'
            print(f'{action}: {path} ({len(data)} bytes)', flush=True)

if __name__ == '__main__':
    main()
