#!/bin/bash
set -euo pipefail
umask 077
cd /opt/moonclaw/database
archive="backups/agentscope-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f "${archive}.pending"' EXIT
docker compose exec -T postgres pg_dump -U postgres -d agentscope -Fc < /dev/null > "${archive}.pending"
docker compose exec -T postgres pg_restore --list < "${archive}.pending" > /dev/null
mv "${archive}.pending" "$archive"
sha256sum "$archive" > "${archive}.sha256"
printf 'Backup verified: %s\n' "$archive"
