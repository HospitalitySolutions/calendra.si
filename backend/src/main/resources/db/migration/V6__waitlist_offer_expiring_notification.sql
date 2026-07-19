ALTER TABLE waitlist_offers
    ADD COLUMN IF NOT EXISTS expiring_notified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_waitlist_offer_expiring_notification
    ON waitlist_offers(status, expires_at, expiring_notified_at);
