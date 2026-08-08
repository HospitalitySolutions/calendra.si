ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS max_participants_override INTEGER;
