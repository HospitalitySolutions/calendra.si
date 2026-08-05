CREATE TABLE IF NOT EXISTS workspace_public_booking_settings (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    slug VARCHAR(80) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    location_selection_mode VARCHAR(24) NOT NULL DEFAULT 'LOCATION_FIRST',
    allow_any_location BOOLEAN NOT NULL DEFAULT TRUE,
    show_prices BOOLEAN NOT NULL DEFAULT TRUE,
    allow_employee_selection BOOLEAN NOT NULL DEFAULT TRUE,
    default_language VARCHAR(8) NOT NULL DEFAULT 'sl',
    primary_color VARCHAR(20),
    logo_url VARCHAR(512),
    page_title VARCHAR(180),
    introduction TEXT,
    confirmation_text TEXT,
    privacy_url VARCHAR(512),
    terms_url VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_workspace_public_booking_selection_mode
        CHECK (location_selection_mode IN ('LOCATION_FIRST', 'SERVICE_FIRST')),
    CONSTRAINT ck_workspace_public_booking_language
        CHECK (default_language IN ('sl', 'en', 'sr'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_workspace_public_booking_slug_lower
    ON workspace_public_booking_settings (LOWER(slug));

ALTER TABLE company
    ADD COLUMN IF NOT EXISTS workspace_public_booking_enabled BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO workspace_public_booking_settings (
    workspace_id, slug, enabled, location_selection_mode, allow_any_location,
    show_prices, allow_employee_selection, default_language, page_title,
    created_at, updated_at
)
SELECT w.id,
       'workspace-' || w.id,
       FALSE,
       'LOCATION_FIRST',
       TRUE,
       TRUE,
       TRUE,
       'sl',
       w.name,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM workspaces w
WHERE NOT EXISTS (
    SELECT 1 FROM workspace_public_booking_settings s WHERE s.workspace_id = w.id
);

CREATE INDEX IF NOT EXISTS ix_company_workspace_public_booking
    ON company (workspace_id, workspace_public_booking_enabled, id);
CREATE INDEX IF NOT EXISTS ix_location_public_workspace_booking
    ON locations (company_id, active, public_booking_enabled, id);
CREATE INDEX IF NOT EXISTS ix_session_type_workspace_public_booking
    ON session_type (company_id, active, widget_group_booking_enabled, workspace_service_template_id, id);
