BEGIN;
CREATE TABLE IF NOT EXISTS agentscope.mcp_app_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mcp_app_results_owner ON agentscope.mcp_app_results(user_id, session_id);
ALTER TABLE agentscope.mcp_app_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope.mcp_app_results FROM PUBLIC, anon, authenticated;
COMMIT;
