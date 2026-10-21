# Vercel personal demo

The repository deploys one Vercel project with a Next.js service and a private
FastAPI service. `AGENTSCOPE_SERVICE_URL` is injected by a Vercel service binding;
the browser calls the existing authenticated Next.js API routes.

## Persistence

- Business state uses PostgreSQL in the private `agentscope` Supabase schema, in
  North Virginia (`us-east-1`), alongside Vercel functions (`iad1`).
  The Tokyo source is retained read-only for rollback (see `supabase/README.md`).
- Apply the checked-in SQL migrations before deploying. The request runtime
  does not grant privileges or create cloud tables.
- Uploaded/generated files use encrypted Supabase Storage objects.
- `/tmp/agentscope` holds disposable working files only. SQLite is retained for
  local development and tests, and is never the production source of truth.
- Preserve all three encryption keys between deployments. Losing the file key
  makes stored files unreadable; losing other keys breaks saved credentials.
- Local accounts, chat history and model secrets are not automatically copied
  to production. Register an account and configure a model in the deployed app.

## Production environment

Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`,
`SUPABASE_SECRET_KEY`, `AGENTSCOPE_FILE_KEY`, `AGENTSCOPE_KNOWLEDGE_KEY`,
`AGENTSCOPE_CHANNEL_KEY`, `AGENTSCOPE_SERVERLESS=1` and
`NEXT_PUBLIC_DEMO_MODE=1`. Keep all credentials as server-side Vercel Secrets.
Never prefix credentials with `NEXT_PUBLIC_` or commit `.env` files.

Use the Supabase session pooler with TLS and a URL-encoded password. The backend
uses parameterized SQL and does not expose a raw SQL HTTP endpoint.

## Demo scope

Supported: registration/login, model and agent settings, persisted chat history,
streamed model responses, Token dashboard, file upload/download and the file
formats included in `pyproject.toml`. A model API key is required for real chat.

Automatic scheduled execution and channel long connections are disabled.
Manual workflow/task runs execute within the HTTP request instead of relying on
a detached background task. Requests remain subject to Vercel function limits.
Image and scanned-PDF OCR use bundled RapidOCR Chinese/English CPU models with
headless OpenCV. Models are loaded once per warm worker; inference is serialized
and input images are limited to 2400 pixels per side. Scanned PDFs process at most
20 pages. No external OCR service or model download is required.
Knowledge base indexing, local speech recognition and local media tools are
outside this demo deployment. Use chat attachments for document demonstrations.
Foreground chat cancellation uses a request-scoped database marker across workers.
Tool approval resumes and background-run interruption still rely on the warm
process; avoid long approval-driven workflows for demonstrations.

## Validation and deployment

Run `npm run build:vercel`, `npm run typecheck`, `npm run lint`,
`DATABASE_URL='' npm run test:service` and `node --test tests/*.test.mjs`.
Verify cloud registration, login, persisted sessions and files before binding
`xixi.rest`. Use the project's exact DNS recommendations and preserve unrelated
DNS records. GitHub automatic deployment requires the Vercel GitHub App to have
access to the private repository.
