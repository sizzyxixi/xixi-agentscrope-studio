BEGIN;
CREATE TABLE IF NOT EXISTS agentscope.mcp_connector_secrets (
  resource_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  cipher TEXT NOT NULL
);
ALTER TABLE agentscope.mcp_connector_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope.mcp_connector_secrets FROM PUBLIC, anon, authenticated;
COMMIT;
