-- Tenant staff notification center and platform announcements.
CREATE TABLE IF NOT EXISTS platform_announcements (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    title VARCHAR(180) NOT NULL,
    message VARCHAR(2000) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'SYSTEM',
    severity VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    show_banner BOOLEAN NOT NULL DEFAULT FALSE,
    action_url VARCHAR(600),
    target_company_ids_json TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tenant_notifications (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(40) NOT NULL,
    type VARCHAR(60) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    title VARCHAR(180) NOT NULL,
    message VARCHAR(1200) NOT NULL,
    source VARCHAR(50),
    entity_type VARCHAR(50),
    entity_id BIGINT,
    action_url VARCHAR(600),
    dedupe_key VARCHAR(180) NOT NULL,
    metadata_json TEXT,
    read_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_tenant_notification_dedupe UNIQUE (recipient_user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_notifications_recipient_created
    ON tenant_notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_notifications_company_created
    ON tenant_notifications (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_announcement_reads (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    announcement_id BIGINT NOT NULL REFERENCES platform_announcements(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_platform_announcement_read UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_announcement_reads_user
    ON platform_announcement_reads (user_id, announcement_id);
