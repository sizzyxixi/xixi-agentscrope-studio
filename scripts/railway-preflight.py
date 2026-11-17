"""Check deployment prerequisites without printing secrets or changing cloud data."""
from __future__ import annotations

import argparse
import base64
import os
from pathlib import Path

from dotenv import dotenv_values


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-cloud", action="store_true", help="Read-only Supabase connectivity checks")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    config = {**dotenv_values(root / ".env"), **os.environ}
    required = (
        "DATABASE_URL", "SUPABASE_URL", "SUPABASE_STORAGE_BUCKET",
        "AGENTSCOPE_FILE_KEY", "AGENTSCOPE_KNOWLEDGE_KEY", "AGENTSCOPE_CHANNEL_KEY",
    )
    failed = False
    for name in required:
        present = bool(config.get(name))
        print(f'{name}: {"configured" if present else "MISSING"}')
        failed |= not present
    secret = config.get("SUPABASE_SECRET_KEY") or config.get("SUPABASE_SERVICE_ROLE_KEY")
    print(f'Supabase server credential: {"configured" if secret else "MISSING"}')
    failed |= not bool(secret)
    for name in ("AGENTSCOPE_FILE_KEY", "AGENTSCOPE_KNOWLEDGE_KEY", "AGENTSCOPE_CHANNEL_KEY", "AGENTSCOPE_MCP_KEY"):
        if not config.get(name):
            continue
        try:
            if len(base64.b64decode(config[name], altchars=b"-_", validate=True)) != 32:
                raise ValueError("invalid length")
        except (ValueError, TypeError):
            print(f"{name}: INVALID key format")
            failed = True
    if not config.get("AGENTSCOPE_MCP_KEY"):
        print("Personal MCP credentials: unavailable until AGENTSCOPE_MCP_KEY is configured")
    if failed or not args.check_cloud:
        return int(failed)

    import httpx
    import psycopg
    from urllib.parse import quote

    try:
        with psycopg.connect(
            config["DATABASE_URL"], connect_timeout=15,
            options="-c default_transaction_read_only=on -c statement_timeout=15000",
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='agentscope'")
                count = cursor.fetchone()[0]
                print(f"Supabase agentscope schema: {count} tables")
                if count < 30:
                    failed = True
                    print("Database schema is incomplete; no migrations were executed")
    except Exception as error:
        print(f"Supabase database check failed ({type(error).__name__}); credentials were not printed")
        failed = True
    headers = {"apikey": secret}
    if not secret.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {secret}"
    try:
        url = config["SUPABASE_URL"].rstrip("/") + "/storage/v1/bucket/" + quote(config["SUPABASE_STORAGE_BUCKET"], safe="")
        response = httpx.get(url, headers=headers, timeout=20)
        print(f"Supabase existing storage bucket: HTTP {response.status_code}")
        failed |= not response.is_success
    except Exception as error:
        print(f"Supabase storage check failed ({type(error).__name__}); credentials were not printed")
        failed = True
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
