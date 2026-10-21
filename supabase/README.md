# Supabase production persistence

## Current migration status

**Production cutover completed on 2026-10-21.** `https://xixi.rest` uses the
North Virginia project below. The migration cutover deployment was
`dpl_8fdG42YTNGBEE9PahAhFPGGxRKuD`; later releases keep the same US environment.
All 33 deployed functions are in `iad1`. Vercel production variables and the
ignored local server configuration point to the US database/storage; encryption
keys remain unchanged.

Verified: 30 business tables / 39 original rows, column definitions, indexes,
foreign keys and RLS flags; 57 storage objects copied and SHA-256 verified.
All 222 local backend tests and the production build passed. Production-domain
registration, case-insensitive login, authenticated APIs and session persistence
were verified with a disposable test account, which was then removed.

The Tokyo source is retained **read-only**: temporary statement triggers named
`_region_migration_readonly` reject business writes. Reads and stored objects
remain available. Keep the source and the private snapshot for rollback.
Before reverting to Tokyo, synchronize any new US writes, remove the migration
write guards, restore the source environment variables and switch the deployment.

- Production project: `xixi-agent-studio` (`hccmjailahbrxtsmvxot`).
- Dashboard: https://supabase.com/dashboard/project/hccmjailahbrxtsmvxot
- Region: North Virginia (`us-east-1`), aligned with Vercel functions (`iad1`).
- Business schema: `agentscope`; the Python backend connects through the TLS session pooler.
- Storage bucket: `xixi-agentscope-studio`; uploaded/generated private files remain encrypted.

## Schema and permissions

Apply `migrations/202610200001_initial_agentscope.sql` followed by
`migrations/202610200002_workspace_features.sql`, then
`migrations/202610210001_schedule_templates.sql`. The current schema has 31
business tables, including six published schedule templates. The third migration
is additive and was verified in the US production database before release.
All tables have RLS enabled; `PUBLIC`, `anon` and `authenticated` have no access
to the business schema or its tables. Authentication and account/resource isolation
are enforced by the Python backend; browser clients never receive database credentials.

The migrations were applied directly, outside Supabase CLI migration history.
Baseline that history before adopting CLI migration deployments. See `verify.sql`
for the expected column types. The PostgreSQL adapter lives in `service/postgres.py`;
SQLite remains available for local development and tests.

## Tokyo → North Virginia migration (2026-10-21)

Source project: `xixi-agentscope-studio` (`bmfppeqixqhinyklhbzo`), Tokyo
(`ap-northeast-1`). Keep this project and its storage intact until the rollback
window has ended.

Migration uses a consistent read-only snapshot and binary PostgreSQL COPY. Verify
all row contents, columns, indexes, foreign keys and RLS flags before cutover.
Copy storage objects byte-for-byte and verify SHA-256 after upload. Preserve
`AGENTSCOPE_FILE_KEY`, `AGENTSCOPE_KNOWLEDGE_KEY` and `AGENTSCOPE_CHANNEL_KEY`;
changing these keys can make existing encrypted data unreadable.

Private snapshots are stored under ignored `work/migrations/`; environment files
and this backup directory must never enter Git, the deployment upload, or a
function bundle. Keep actual credentials only in ignored local files and Vercel
server-side environment variables.

Cutover changes `DATABASE_URL`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, then
promotes a validated production deployment. The bucket name and encryption keys
stay unchanged. Before promotion, stop source writes and recheck both databases.
After new writes reach the US database, rollback requires synchronizing those
writes back; restoring the old connection alone would lose new records.

## Validation

Use `scripts/check-postgres.py` against the target environment to verify login,
authenticated APIs, cross-connection message persistence and token accounting.
The smoke check creates and removes only its own disposable account and records.
Run local tests with `DATABASE_URL=''` so they never use the production database.
