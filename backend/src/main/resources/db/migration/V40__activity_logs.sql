CREATE TABLE activity_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    location_id BIGINT NULL,
    space_id BIGINT NULL,
    actor_type VARCHAR(40) NOT NULL,
    actor_login_account_id BIGINT NULL,
    actor_user_id BIGINT NULL,
    actor_name_snapshot VARCHAR(240) NOT NULL,
    module VARCHAR(40) NOT NULL,
    action_code VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id BIGINT NULL,
    entity_label VARCHAR(320) NULL,
    secondary_entity_type VARCHAR(80) NULL,
    secondary_entity_id BIGINT NULL,
    secondary_entity_label VARCHAR(320) NULL,
    summary VARCHAR(1000) NOT NULL,
    details_json TEXT NULL,
    source VARCHAR(60) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_activity_logs_workspace_time ON activity_logs (workspace_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_company_time ON activity_logs (company_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_actor_time ON activity_logs (actor_user_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_entity_time ON activity_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_location_time ON activity_logs (location_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_module_time ON activity_logs (company_id, module, occurred_at DESC);
CREATE INDEX idx_activity_logs_action_time ON activity_logs (company_id, action_code, occurred_at DESC);
