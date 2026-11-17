#!/bin/sh
set -eu
: "${DATABASE_URL:?Set the existing Supabase DATABASE_URL}"
: "${SUPABASE_URL:?Set the existing Supabase URL}"
: "${SUPABASE_STORAGE_BUCKET:?Set the existing storage bucket}"
: "${AGENTSCOPE_FILE_KEY:?Reuse the existing file encryption key}"
: "${AGENTSCOPE_KNOWLEDGE_KEY:?Reuse the existing knowledge encryption key}"
: "${AGENTSCOPE_CHANNEL_KEY:?Reuse the existing channel encryption key}"
if [ -z "${SUPABASE_SECRET_KEY:-}${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo 'Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY' >&2
  exit 1
fi
exec python -m uvicorn service.main:app --host 0.0.0.0 --port "${PORT:-8790}" --workers 1
