"""Retention cleanup entry points, shared by persistent workers and external schedulers."""
import hmac
import json
import os
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException


def maintenance_router(files):
    router = APIRouter()

    @router.post("/internal/files/cleanup", include_in_schema=False)
    def cleanup(authorization: str | None = Header(default=None)):
        secret = os.getenv("FILE_CLEANUP_SECRET", "")
        if not secret or not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
            raise HTTPException(403, "Forbidden")
        return files.cleanup_expired()

    return router


def main():
    import argparse
    from dotenv import load_dotenv
    from .store import StudioStore
    from .files import FileService, RETENTION_DAYS

    parser = argparse.ArgumentParser(description="Audit file retention; --apply deletes expired files including historical versions.")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    store = StudioStore()
    files = FileService(store)
    try:
        if args.apply:
            # Bounded invocations; repeat from an external scheduler for large backlogs.
            result = files.cleanup_expired()
        else:
            from datetime import datetime, timedelta, timezone
            result = {"upload": 0, "artifact": 0, "expired": 0}
            for row in store._conn.execute("SELECT origin,created_at,expires_at FROM studio_files WHERE deleted_at IS NULL").fetchall():
                origin = row["origin"]
                result[origin] = result.get(origin, 0) + 1
                expiry = min(datetime.fromisoformat(row["expires_at"]), datetime.fromisoformat(row["created_at"]) + timedelta(days=RETENTION_DAYS.get(origin, 3)))
                result["expired"] += int(expiry <= datetime.now(timezone.utc))
        print(json.dumps(result))
    finally:
        store._conn.close()


if __name__ == "__main__":
    main()
