ALTER TABLE session_type
    ADD COLUMN IF NOT EXISTS break_minutes_overridden BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing positive values were explicitly configured before tenant defaults existed.
-- Existing zero/null values become inherited defaults.
UPDATE session_type
SET break_minutes_overridden = CASE WHEN COALESCE(break_minutes, 0) > 0 THEN TRUE ELSE FALSE END,
    break_minutes = COALESCE(break_minutes, 0);
