ALTER TABLE guest_users
    ADD COLUMN IF NOT EXISTS notify_reminder_minutes INTEGER NOT NULL DEFAULT 60;

CREATE TABLE IF NOT EXISTS booking_push_reminders (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    booking_id BIGINT NOT NULL,
    guest_user_id BIGINT NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    due_at TIMESTAMP NOT NULL,
    booking_start_at TIMESTAMP NOT NULL,
    reminder_minutes INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL,
    sent_at TIMESTAMP,
    failed_at TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_booking_push_reminders_booking_guest
    ON booking_push_reminders (booking_id, guest_user_id);
CREATE INDEX IF NOT EXISTS idx_booking_push_reminders_due
    ON booking_push_reminders (status, due_at, id);
CREATE INDEX IF NOT EXISTS idx_booking_push_reminders_guest_status
    ON booking_push_reminders (guest_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_booking_push_reminders_booking
    ON booking_push_reminders (booking_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_push_reminders_booking') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT fk_booking_push_reminders_booking
            FOREIGN KEY (booking_id) REFERENCES session_booking(id) ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_push_reminders_guest_user') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT fk_booking_push_reminders_guest_user
            FOREIGN KEY (guest_user_id) REFERENCES guest_users(id) ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_push_reminders_company') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT fk_booking_push_reminders_company
            FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_push_reminders_client') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT fk_booking_push_reminders_client
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_guest_notify_reminder_minutes') THEN
        ALTER TABLE guest_users ADD CONSTRAINT chk_guest_notify_reminder_minutes
            CHECK (notify_reminder_minutes IN (5, 15, 30, 60, 180, 1440)) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_booking_push_reminder_minutes') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT chk_booking_push_reminder_minutes
            CHECK (reminder_minutes IN (5, 15, 30, 60, 180, 1440)) NOT VALID;
    END IF;
END $$;
