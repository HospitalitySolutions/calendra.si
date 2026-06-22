CREATE TABLE IF NOT EXISTS scheduled_job_runs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    job_name VARCHAR(120) NOT NULL,
    status VARCHAR(32) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    duration_ms BIGINT,
    instance_id VARCHAR(160),
    locked_by VARCHAR(160),
    records_processed INTEGER,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_started
    ON scheduled_job_runs (job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_status_started
    ON scheduled_job_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_created
    ON scheduled_job_runs (created_at);
