# Supabase database

Project: `bmfppeqixqhinyklhbzo` (`xixi-agentscope-studio`).

- Dashboard: https://supabase.com/dashboard/project/bmfppeqixqhinyklhbzo
- API URL: https://bmfppeqixqhinyklhbzo.supabase.co
- Region: Tokyo (`ap-northeast-1`).
- Business schema: `agentscope`.

## Applied database structure

`migrations/202610200001_initial_agentscope.sql` was applied through the
Supabase SQL Editor on 2026-10-20. It creates the 19 business tables, preserves
existing indexes and foreign keys, and adds a case-insensitive unique username
index. Text dates, JSON strings and integer flags deliberately retain the
current application's representations for the future PostgreSQL adapter.

All 19 tables have RLS enabled. The schema and tables are not accessible to
`PUBLIC`, `anon` or `authenticated`. There are no browser-facing RLS policies.
Do not expose this schema through the Data API or grant browser clients access
to authentication tokens, password hashes or model credentials. Existing
Supabase Auth and Storage schemas were not modified.

This SQL is schema-only: local users, conversations and credentials were not
uploaded. It was applied manually; it is not registered in the Supabase CLI
migration history. Baseline that history before adopting CLI-based deployments.

## Workspace schema alignment (2026-10-20)

`migrations/202610200002_workspace_features.sql` adds 11 tables for files,
knowledge bases, scheduling idempotency and token usage, plus three columns for
message activity/resources and run soft deletion. The database now has 30
business tables, all with RLS enabled and no browser-role schema access.
`rag_documents.body` uses PostgreSQL `BYTEA` instead of SQLite `BLOB`.

Pre-update verification found all 19 existing business tables empty. No user
records, tokens, model keys, conversations or documents were copied. Existing
Storage bucket `xixi-agentscope-studio` and its assets were preserved. Official
agent/skill/template defaults are initialized by application code; they do not
need a bulk seed while this database is disconnected from the application.

Both migrations were applied manually in the SQL Editor; reconcile CLI migration
history before adopting automated schema deployment.

## Backend connection: not activated yet

The Python application still uses SQLite. The project URL and publishable API
key cannot replace a PostgreSQL connection string. Switching requires a
PostgreSQL store implementation, server-side database credentials, connection
pooling, schema selection and integration tests.

For an IPv4-only server, the dashboard provides this Session pooler endpoint:

```text
postgresql://postgres.bmfppeqixqhinyklhbzo:<URL_ENCODED_DATABASE_PASSWORD>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require
```

Use the dashboard Connect dialog as the source of truth. Keep the real password
in an ignored local environment file or the deployment secret manager; never
commit it. A future backend connection must select the `agentscope` schema
explicitly. The current application does not read `DATABASE_URL` yet.

Before production, provision an appropriately scoped backend database role and
define its ownership/RLS behavior. Do not assume that enabling RLS applies user
isolation to a privileged database owner connection. Retain and verify the
backend's user authorization checks.

Keep `AGENTSCOPE_CHANNEL_KEY` stable when migrating channel ciphertext, and add
encryption for model API keys before moving those secrets to the cloud. Plan a
data migration with backup, row-count/relationship validation and rollback.

## Verification

Run `verify.sql` in the SQL Editor for an exact comparison of all 196 expected
column names and PostgreSQL types. Verified result on 2026-10-20:
`schema_mismatches=0`, `business_tables=30`, `columns=196`,
`all_rls_enabled=true`, `anon_access=false`, `browser_user_access=false`.
All business tables remain empty; the existing Storage bucket retains 49 assets.

```sql
select count(*) as business_tables,
       bool_and(rowsecurity) as all_rls_enabled
from pg_tables
where schemaname = 'agentscope';
-- Latest applied result: 30, true.
```
