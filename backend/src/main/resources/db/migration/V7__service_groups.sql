CREATE TABLE IF NOT EXISTS service_group (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_service_group_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT uq_service_group_company_name UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_service_group_company_sort
    ON service_group(company_id, sort_order, id);

ALTER TABLE session_type
    ADD COLUMN IF NOT EXISTS service_group_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_type_service_group'
    ) THEN
        ALTER TABLE session_type
            ADD CONSTRAINT fk_session_type_service_group
            FOREIGN KEY (service_group_id) REFERENCES service_group(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_type_service_group_sort
    ON session_type(company_id, service_group_id, guest_sort_order, id);
