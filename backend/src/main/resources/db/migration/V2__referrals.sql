-- Refer a friend: personal referral codes and per-tenant referral tracking.

-- backend/src/main/java/com/example/app/referral/ReferralCode.java
CREATE TABLE IF NOT EXISTS referral_codes (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    code VARCHAR(64) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uk_referral_codes_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes (user_id);

-- backend/src/main/java/com/example/app/referral/Referral.java
CREATE TABLE IF NOT EXISTS referrals (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    referrer_company_id BIGINT NOT NULL,
    referrer_user_id BIGINT NOT NULL,
    code VARCHAR(64) NOT NULL,
    referred_company_id BIGINT,
    referred_email VARCHAR(255),
    status VARCHAR(32) NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE,
    qualified_at TIMESTAMP WITH TIME ZONE,
    referrer_reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
    referred_reward_granted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_referrals_referred_company ON referrals (referred_company_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_company ON referrals (referrer_company_id);
