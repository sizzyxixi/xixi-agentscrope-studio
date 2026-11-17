-- Generated from pinned AgentScope 2.0.11 SQLAlchemy models; no business data.
BEGIN;
CREATE SCHEMA IF NOT EXISTS agentscope_config AUTHORIZATION agentscope_app;
REVOKE ALL ON SCHEMA agentscope_config FROM PUBLIC;
SET LOCAL ROLE agentscope_app;

CREATE TABLE IF NOT EXISTS agentscope_config.agents (
	user_id VARCHAR(255) NOT NULL,
	source VARCHAR(16) NOT NULL,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id)
)

;
CREATE INDEX IF NOT EXISTS ix_agents_user_source ON agentscope_config.agents (user_id, source);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_agents_created_at ON agentscope_config.agents (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_agents_source ON agentscope_config.agents (source);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_agents_updated_at ON agentscope_config.agents (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_agents_user_id ON agentscope_config.agents (user_id);
ALTER TABLE agentscope_config."agents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."agents" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.channels (
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	user_id VARCHAR(255) NOT NULL,
	platform_bot_id VARCHAR(255) NOT NULL,
	id VARCHAR(255) NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_channels_bot UNIQUE (platform_bot_id)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_channels_created_at ON agentscope_config.channels (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_channels_updated_at ON agentscope_config.channels (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_channels_user_id ON agentscope_config.channels (user_id);
ALTER TABLE agentscope_config."channels" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."channels" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.credentials (
	user_id VARCHAR(255) NOT NULL,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_credentials_created_at ON agentscope_config.credentials (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_credentials_updated_at ON agentscope_config.credentials (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_credentials_user_id ON agentscope_config.credentials (user_id);
ALTER TABLE agentscope_config."credentials" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."credentials" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.knowledge_bases (
	user_id VARCHAR(255) NOT NULL,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_knowledge_bases_created_at ON agentscope_config.knowledge_bases (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_knowledge_bases_updated_at ON agentscope_config.knowledge_bases (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_knowledge_bases_user_id ON agentscope_config.knowledge_bases (user_id);
ALTER TABLE agentscope_config."knowledge_bases" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."knowledge_bases" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.mcps (
	user_id VARCHAR(255) NOT NULL,
	name VARCHAR(255) NOT NULL,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_mcps_user_name UNIQUE (user_id, name)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_mcps_created_at ON agentscope_config.mcps (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_mcps_updated_at ON agentscope_config.mcps (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_mcps_user_id ON agentscope_config.mcps (user_id);
ALTER TABLE agentscope_config."mcps" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."mcps" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.messages (
	session_id VARCHAR(255) NOT NULL,
	msg_id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (session_id, msg_id)
)

;
CREATE INDEX IF NOT EXISTS ix_messages_session_created ON agentscope_config.messages (session_id, created_at);
ALTER TABLE agentscope_config."messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."messages" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.schedules (
	user_id VARCHAR(255) NOT NULL,
	agent_id VARCHAR(255) NOT NULL,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_schedules_agent_id ON agentscope_config.schedules (agent_id);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_schedules_created_at ON agentscope_config.schedules (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_schedules_updated_at ON agentscope_config.schedules (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_schedules_user_id ON agentscope_config.schedules (user_id);
ALTER TABLE agentscope_config."schedules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."schedules" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.sessions (
	user_id VARCHAR(255) NOT NULL,
	agent_id VARCHAR(255) NOT NULL,
	source VARCHAR(16) NOT NULL,
	source_schedule_id VARCHAR(255),
	team_id VARCHAR(255),
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sessions_agent_id ON agentscope_config.sessions (agent_id);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sessions_created_at ON agentscope_config.sessions (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sessions_source ON agentscope_config.sessions (source);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sessions_source_schedule_id ON agentscope_config.sessions (source_schedule_id);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sessions_team_id ON agentscope_config.sessions (team_id);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sessions_updated_at ON agentscope_config.sessions (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sessions_user_id ON agentscope_config.sessions (user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_user_agent ON agentscope_config.sessions (user_id, agent_id);
ALTER TABLE agentscope_config."sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."sessions" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.skills (
	user_id VARCHAR(255) NOT NULL,
	name VARCHAR(255) NOT NULL,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_skills_user_name UNIQUE (user_id, name)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_skills_created_at ON agentscope_config.skills (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_skills_updated_at ON agentscope_config.skills (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_skills_user_id ON agentscope_config.skills (user_id);
ALTER TABLE agentscope_config."skills" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."skills" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.sop_runs (
	user_id VARCHAR(255) NOT NULL,
	sop_id VARCHAR(255) NOT NULL,
	phase VARCHAR(16) NOT NULL,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sop_runs_created_at ON agentscope_config.sop_runs (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sop_runs_phase ON agentscope_config.sop_runs (phase);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sop_runs_sop_id ON agentscope_config.sop_runs (sop_id);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sop_runs_updated_at ON agentscope_config.sop_runs (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sop_runs_user_id ON agentscope_config.sop_runs (user_id);
CREATE INDEX IF NOT EXISTS ix_sop_runs_user_phase ON agentscope_config.sop_runs (user_id, phase);
CREATE INDEX IF NOT EXISTS ix_sop_runs_user_sop ON agentscope_config.sop_runs (user_id, sop_id);
ALTER TABLE agentscope_config."sop_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."sop_runs" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.sops (
	user_id VARCHAR(255) NOT NULL,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sops_created_at ON agentscope_config.sops (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sops_updated_at ON agentscope_config.sops (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_sops_user_id ON agentscope_config.sops (user_id);
ALTER TABLE agentscope_config."sops" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."sops" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.teams (
	user_id VARCHAR(255) NOT NULL,
	session_id VARCHAR(255) NOT NULL,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id)
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_teams_created_at ON agentscope_config.teams (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_teams_updated_at ON agentscope_config.teams (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_teams_user_id ON agentscope_config.teams (user_id);
ALTER TABLE agentscope_config."teams" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."teams" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.xixi_catalog_metadata (
	key VARCHAR(160) NOT NULL,
	value JSON NOT NULL,
	PRIMARY KEY (key)
)

;
ALTER TABLE agentscope_config."xixi_catalog_metadata" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."xixi_catalog_metadata" FROM PUBLIC;

CREATE TABLE IF NOT EXISTS agentscope_config.knowledge_documents (
	user_id VARCHAR(255) NOT NULL,
	knowledge_base_id VARCHAR(255) NOT NULL,
	processing_node VARCHAR(128),
	status VARCHAR(16) NOT NULL,
	lease_expires_at TIMESTAMP WITHOUT TIME ZONE,
	id VARCHAR(255) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	payload JSON NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(knowledge_base_id) REFERENCES agentscope_config.knowledge_bases (id) ON DELETE CASCADE
)

;
CREATE INDEX IF NOT EXISTS ix_agentscope_config_knowledge_documents_created_at ON agentscope_config.knowledge_documents (created_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_knowledge_documents_knowledge_base_id ON agentscope_config.knowledge_documents (knowledge_base_id);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_knowledge_documents_status ON agentscope_config.knowledge_documents (status);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_knowledge_documents_updated_at ON agentscope_config.knowledge_documents (updated_at);
CREATE INDEX IF NOT EXISTS ix_agentscope_config_knowledge_documents_user_id ON agentscope_config.knowledge_documents (user_id);
CREATE INDEX IF NOT EXISTS ix_kd_status_lease ON agentscope_config.knowledge_documents (status, lease_expires_at);
CREATE INDEX IF NOT EXISTS ix_kd_user_kb ON agentscope_config.knowledge_documents (user_id, knowledge_base_id);
ALTER TABLE agentscope_config."knowledge_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agentscope_config."knowledge_documents" FROM PUBLIC;
COMMIT;
