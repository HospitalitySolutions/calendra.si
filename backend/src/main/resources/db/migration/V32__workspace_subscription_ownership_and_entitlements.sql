-- Phase 5E: one commercial subscription per workspace, centralized entitlements and usage.
-- Existing company settings remain as a compatibility projection for the retained billing owner.

-- Legacy subscription dates have historically been stored as free-form settings.
-- Keep the upgrade tolerant of malformed values instead of blocking all tenants.
CREATE OR REPLACE FUNCTION calendra_workspace_subscription_safe_date(value TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF value IS NULL OR btrim(value) = '' THEN RETURN NULL; END IF;
    RETURN btrim(value)::date;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION calendra_workspace_subscription_safe_int(value TEXT)
RETURNS INTEGER LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF value IS NULL OR btrim(value) = '' THEN RETURN NULL; END IF;
    RETURN btrim(value)::integer;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workspace_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id BIGINT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    legacy_primary_company_id BIGINT REFERENCES company(id) ON DELETE SET NULL,
    payer_legal_entity_id BIGINT REFERENCES legal_entities(id) ON DELETE SET NULL,
    plan_key VARCHAR(32) NOT NULL DEFAULT 'PROFESSIONAL',
    billing_interval VARCHAR(16) NOT NULL DEFAULT 'MONTHLY',
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    current_period_start DATE,
    current_period_end DATE,
    trial_ends_at DATE,
    grace_until DATE,
    external_customer_id VARCHAR(255),
    external_subscription_id VARCHAR(255),
    billing_contact_name VARCHAR(255),
    billing_email VARCHAR(320),
    billing_address VARCHAR(512),
    billing_postal_code VARCHAR(64),
    billing_city VARCHAR(255),
    billing_country VARCHAR(2) NOT NULL DEFAULT 'SI',
    billing_tax_id VARCHAR(64),
    purchase_order_reference VARCHAR(255),
    features_json TEXT NOT NULL DEFAULT '[]',
    addons_json TEXT NOT NULL DEFAULT '[]',
    max_operating_units INTEGER NOT NULL DEFAULT 1,
    max_locations INTEGER NOT NULL DEFAULT 1,
    max_active_users INTEGER NOT NULL DEFAULT 1,
    max_consultants INTEGER NOT NULL DEFAULT 1,
    max_clients INTEGER NOT NULL DEFAULT 0,
    max_monthly_bookings INTEGER NOT NULL DEFAULT 0,
    included_sms_parts INTEGER NOT NULL DEFAULT 0,
    included_email_messages INTEGER NOT NULL DEFAULT 0,
    storage_limit_mb BIGINT NOT NULL DEFAULT 0,
    max_public_booking_pages INTEGER NOT NULL DEFAULT 1,
    analytics_retention_days INTEGER NOT NULL DEFAULT 365,
    allow_sms_overage BOOLEAN NOT NULL DEFAULT FALSE,
    allow_email_overage BOOLEAN NOT NULL DEFAULT TRUE,
    allow_booking_overage BOOLEAN NOT NULL DEFAULT TRUE,
    api_access BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ck_workspace_subscription_plan CHECK (plan_key IN ('TRIAL','BASIC','PROFESSIONAL','PREMIUM','CUSTOM')),
    CONSTRAINT ck_workspace_subscription_interval CHECK (billing_interval IN ('MONTHLY','YEARLY')),
    CONSTRAINT ck_workspace_subscription_status CHECK (status IN ('TRIAL','ACTIVE','PENDING_PAYMENT','GRACE','PAST_DUE','SUSPENDED','CANCELLED')),
    CONSTRAINT ck_workspace_subscription_country CHECK (char_length(billing_country) = 2),
    CONSTRAINT ck_workspace_subscription_nonnegative CHECK (
        max_operating_units >= 0 AND max_locations >= 0 AND max_active_users >= 0
        AND max_consultants >= 0 AND max_clients >= 0 AND max_monthly_bookings >= 0
        AND included_sms_parts >= 0 AND included_email_messages >= 0 AND storage_limit_mb >= 0
        AND max_public_booking_pages >= 0 AND analytics_retention_days >= 0
    )
);

CREATE INDEX IF NOT EXISTS ix_workspace_subscriptions_status_period
    ON workspace_subscriptions(status, current_period_end, workspace_id);
CREATE INDEX IF NOT EXISTS ix_workspace_subscriptions_billing_owner
    ON workspace_subscriptions(legacy_primary_company_id);

CREATE TABLE IF NOT EXISTS workspace_subscription_legacy_sources (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_subscription_id BIGINT NOT NULL REFERENCES workspace_subscriptions(id) ON DELETE CASCADE,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    retained_billing_owner BOOLEAN NOT NULL DEFAULT FALSE,
    package_snapshot VARCHAR(64),
    interval_snapshot VARCHAR(32),
    status_snapshot VARCHAR(64),
    period_start_snapshot DATE,
    period_end_snapshot DATE,
    user_limit_snapshot INTEGER,
    sms_limit_snapshot INTEGER,
    due_amount_snapshot NUMERIC(19,4),
    CONSTRAINT uq_workspace_subscription_legacy_company UNIQUE (workspace_subscription_id, company_id)
);
CREATE INDEX IF NOT EXISTS ix_workspace_subscription_legacy_company
    ON workspace_subscription_legacy_sources(company_id, retained_billing_owner);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_subscription_retained_owner
    ON workspace_subscription_legacy_sources(workspace_subscription_id)
    WHERE retained_billing_owner;

CREATE TABLE IF NOT EXISTS workspace_usage_monthly (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    company_id BIGINT REFERENCES company(id) ON DELETE CASCADE,
    usage_month DATE NOT NULL,
    metric VARCHAR(40) NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workspace_usage_month_start CHECK (usage_month = date_trunc('month', usage_month)::date),
    CONSTRAINT ck_workspace_usage_quantity CHECK (quantity >= 0),
    CONSTRAINT uq_workspace_usage_monthly UNIQUE NULLS NOT DISTINCT (workspace_id, company_id, usage_month, metric)
);
CREATE INDEX IF NOT EXISTS ix_workspace_usage_monthly_lookup
    ON workspace_usage_monthly(workspace_id, usage_month, metric, company_id);

CREATE TABLE IF NOT EXISTS workspace_usage_events (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    company_id BIGINT REFERENCES company(id) ON DELETE CASCADE,
    usage_month DATE NOT NULL,
    metric VARCHAR(40) NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_id VARCHAR(128) NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT ck_workspace_usage_event_month_start CHECK (usage_month = date_trunc('month', usage_month)::date),
    CONSTRAINT ck_workspace_usage_event_quantity CHECK (quantity > 0),
    CONSTRAINT uq_workspace_usage_event_source UNIQUE (workspace_id, metric, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS ix_workspace_usage_events_lookup
    ON workspace_usage_events(workspace_id, usage_month, metric, company_id);

CREATE TABLE IF NOT EXISTS workspace_subscription_audit_log (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_subscription_id BIGINT NOT NULL REFERENCES workspace_subscriptions(id) ON DELETE CASCADE,
    actor_login_account_id BIGINT REFERENCES login_accounts(id) ON DELETE SET NULL,
    actor_membership_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    details TEXT
);
CREATE INDEX IF NOT EXISTS ix_workspace_subscription_audit
    ON workspace_subscription_audit_log(workspace_subscription_id, created_at DESC, id DESC);

WITH workspace_primary AS (
    SELECT w.id AS workspace_id,
           MIN(c.id) AS primary_company_id,
           COUNT(c.id)::int AS company_count,
           COALESCE((SELECT COUNT(*) FROM locations l JOIN company lc ON lc.id = l.company_id WHERE lc.workspace_id = w.id), 0)::int AS location_count,
           COALESCE((SELECT COUNT(DISTINCT u.login_account_id) FROM users u JOIN company uc ON uc.id = u.company_id WHERE uc.workspace_id = w.id AND u.active), 0)::int AS active_user_count,
           COALESCE((SELECT COUNT(DISTINCT u.login_account_id) FROM users u JOIN company uc ON uc.id = u.company_id WHERE uc.workspace_id = w.id AND u.active AND u.consultant), 0)::int AS consultant_count,
           (COALESCE((SELECT COUNT(*) FROM company pc WHERE pc.workspace_id = w.id AND pc.workspace_public_booking_enabled), 0)
             + COALESCE((SELECT COUNT(*) FROM workspace_public_booking_settings wps WHERE wps.workspace_id = w.id AND wps.enabled), 0))::int AS public_page_count,
           COALESCE((SELECT SUM(CASE WHEN s.value ~ '^[0-9]+$' THEN s.value::int ELSE 0 END)
                     FROM app_settings s JOIN company sc ON sc.id = s.company_id
                     WHERE sc.workspace_id = w.id AND s.key = 'SIGNUP_SMS_COUNT'), 0)::int AS sms_limit
    FROM workspaces w
    LEFT JOIN company c ON c.workspace_id = w.id
    GROUP BY w.id
), source AS (
    SELECT wp.*,
           COALESCE(NULLIF(upper((SELECT s.value FROM app_settings s WHERE s.company_id = wp.primary_company_id AND s.key = 'SIGNUP_PACKAGE_NAME' ORDER BY s.id DESC LIMIT 1)), ''), 'PROFESSIONAL') AS package_name,
           COALESCE(NULLIF(upper((SELECT s.value FROM app_settings s WHERE s.company_id = wp.primary_company_id AND s.key = 'BILLING_SUBSCRIPTION_INTERVAL' ORDER BY s.id DESC LIMIT 1)), ''), 'MONTHLY') AS billing_interval,
           COALESCE(NULLIF(upper((SELECT s.value FROM app_settings s WHERE s.company_id = wp.primary_company_id AND s.key = 'BILLING_SUBSCRIPTION_STATUS' ORDER BY s.id DESC LIMIT 1)), ''), 'PAID') AS billing_status,
           calendra_workspace_subscription_safe_date((SELECT s.value FROM app_settings s WHERE s.company_id = wp.primary_company_id AND s.key = 'BILLING_SUBSCRIPTION_START' ORDER BY s.id DESC LIMIT 1)) AS period_start,
           calendra_workspace_subscription_safe_date((SELECT s.value FROM app_settings s WHERE s.company_id = wp.primary_company_id AND s.key = 'BILLING_SUBSCRIPTION_END' ORDER BY s.id DESC LIMIT 1)) AS period_end,
           COALESCE(calendra_workspace_subscription_safe_int((SELECT s.value FROM app_settings s WHERE s.company_id = wp.primary_company_id AND s.key = 'SIGNUP_USER_COUNT' ORDER BY s.id DESC LIMIT 1)), 1) AS configured_users,
           NULLIF((SELECT s.value FROM app_settings s WHERE s.company_id = wp.primary_company_id AND s.key = 'COMPANY_EMAIL' ORDER BY s.id DESC LIMIT 1), '') AS billing_email
    FROM workspace_primary wp
)
INSERT INTO workspace_subscriptions (
    workspace_id, legacy_primary_company_id, payer_legal_entity_id, plan_key, billing_interval, status,
    current_period_start, current_period_end, trial_ends_at, billing_email, features_json,
    max_operating_units, max_locations, max_active_users, max_consultants,
    included_sms_parts, max_public_booking_pages, api_access, created_at, updated_at
)
SELECT s.workspace_id,
       s.primary_company_id,
       (SELECT cle.legal_entity_id FROM company_legal_entities cle WHERE cle.company_id = s.primary_company_id AND cle.active ORDER BY cle.default_issuer DESC, cle.id LIMIT 1),
       CASE WHEN s.package_name IN ('TRIAL','BASIC','PROFESSIONAL','PREMIUM','CUSTOM') THEN s.package_name ELSE 'CUSTOM' END,
       CASE WHEN s.billing_interval = 'YEARLY' THEN 'YEARLY' ELSE 'MONTHLY' END,
       CASE s.billing_status
           WHEN 'PENDING_PAYMENT' THEN 'PENDING_PAYMENT'
           WHEN 'PAST_DUE' THEN 'PAST_DUE'
           WHEN 'SUSPENDED' THEN 'SUSPENDED'
           WHEN 'CANCELLED' THEN 'CANCELLED'
           ELSE CASE WHEN s.package_name = 'TRIAL' THEN 'TRIAL' ELSE 'ACTIVE' END
       END,
       s.period_start,
       s.period_end,
       CASE WHEN s.package_name IN ('TRIAL','BASIC') AND s.period_start > CURRENT_DATE THEN s.period_start ELSE NULL END,
       s.billing_email,
       CASE
           WHEN s.package_name IN ('PREMIUM','CUSTOM') THEN '["CORE","MULTI_UNIT","WORKSPACE_ANALYTICS","WORKSPACE_PUBLIC_BOOKING","CONFIGURATION_COPY","API_ACCESS"]'
           ELSE '["CORE","MULTI_UNIT","WORKSPACE_ANALYTICS","WORKSPACE_PUBLIC_BOOKING","CONFIGURATION_COPY"]'
       END,
       CASE WHEN s.package_name = 'PREMIUM' THEN 0
            ELSE GREATEST(s.company_count, CASE WHEN s.package_name IN ('PROFESSIONAL','CUSTOM') THEN 3 ELSE 1 END) END,
       CASE WHEN s.package_name = 'PREMIUM' THEN 0
            ELSE GREATEST(s.location_count, CASE WHEN s.package_name IN ('PROFESSIONAL','CUSTOM') THEN 10 ELSE 2 END) END,
       GREATEST(s.active_user_count, s.configured_users),
       GREATEST(s.consultant_count, 1),
       GREATEST(s.sms_limit, 0),
       CASE WHEN s.package_name = 'PREMIUM' THEN 0
            ELSE GREATEST(s.public_page_count, CASE WHEN s.package_name IN ('PROFESSIONAL','CUSTOM') THEN 3 ELSE 1 END) END,
       s.package_name IN ('PREMIUM','CUSTOM'),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM source s
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO workspace_subscription_legacy_sources (
    workspace_subscription_id, company_id, retained_billing_owner, package_snapshot,
    interval_snapshot, status_snapshot, period_start_snapshot, period_end_snapshot,
    user_limit_snapshot, sms_limit_snapshot, due_amount_snapshot
)
SELECT ws.id,
       c.id,
       c.id = ws.legacy_primary_company_id,
       (SELECT s.value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'SIGNUP_PACKAGE_NAME' ORDER BY s.id DESC LIMIT 1),
       (SELECT s.value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'BILLING_SUBSCRIPTION_INTERVAL' ORDER BY s.id DESC LIMIT 1),
       (SELECT s.value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'BILLING_SUBSCRIPTION_STATUS' ORDER BY s.id DESC LIMIT 1),
       calendra_workspace_subscription_safe_date((SELECT s.value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'BILLING_SUBSCRIPTION_START' ORDER BY s.id DESC LIMIT 1)),
       calendra_workspace_subscription_safe_date((SELECT s.value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'BILLING_SUBSCRIPTION_END' ORDER BY s.id DESC LIMIT 1)),
       CASE WHEN (SELECT s.value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'SIGNUP_USER_COUNT' ORDER BY s.id DESC LIMIT 1) ~ '^[0-9]+$'
            THEN (SELECT s.value::int FROM app_settings s WHERE s.company_id = c.id AND s.key = 'SIGNUP_USER_COUNT' ORDER BY s.id DESC LIMIT 1) ELSE NULL END,
       CASE WHEN (SELECT s.value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'SIGNUP_SMS_COUNT' ORDER BY s.id DESC LIMIT 1) ~ '^[0-9]+$'
            THEN (SELECT s.value::int FROM app_settings s WHERE s.company_id = c.id AND s.key = 'SIGNUP_SMS_COUNT' ORDER BY s.id DESC LIMIT 1) ELSE NULL END,
       CASE WHEN (SELECT s.value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'BILLING_SUBSCRIPTION_DUE_AMOUNT' ORDER BY s.id DESC LIMIT 1) ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (SELECT s.value::numeric FROM app_settings s WHERE s.company_id = c.id AND s.key = 'BILLING_SUBSCRIPTION_DUE_AMOUNT' ORDER BY s.id DESC LIMIT 1) ELSE NULL END
FROM company c
JOIN workspace_subscriptions ws ON ws.workspace_id = c.workspace_id
ON CONFLICT (workspace_subscription_id, company_id) DO NOTHING;

INSERT INTO workspace_usage_monthly (workspace_id, company_id, usage_month, metric, quantity)
SELECT c.workspace_id,
       c.id,
       date_trunc('month', CURRENT_DATE)::date,
       'SMS_PARTS',
       COALESCE((SELECT CASE WHEN s.value ~ '^[0-9]+$' THEN s.value::bigint ELSE 0 END
                 FROM app_settings s WHERE s.company_id = c.id AND s.key = 'TENANCY_SMS_SENT_COUNT'
                 ORDER BY s.id DESC LIMIT 1), 0)
FROM company c
ON CONFLICT (workspace_id, company_id, usage_month, metric)
DO UPDATE SET quantity = GREATEST(workspace_usage_monthly.quantity, EXCLUDED.quantity), updated_at = CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION calendra_create_workspace_subscription()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO workspace_subscriptions (
        workspace_id, plan_key, billing_interval, status, features_json,
        max_operating_units, max_locations, max_active_users, max_consultants,
        max_public_booking_pages, created_at, updated_at
    ) VALUES (
        NEW.id, 'PROFESSIONAL', 'MONTHLY', 'ACTIVE',
        '["CORE","MULTI_UNIT","WORKSPACE_ANALYTICS","WORKSPACE_PUBLIC_BOOKING","CONFIGURATION_COPY"]',
        3, 10, 5, 5, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) ON CONFLICT (workspace_id) DO NOTHING;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_create_workspace_subscription ON workspaces;
CREATE TRIGGER trg_create_workspace_subscription
AFTER INSERT ON workspaces
FOR EACH ROW EXECUTE FUNCTION calendra_create_workspace_subscription();

-- The first company created in a new workspace becomes the retained subscription billing owner.
-- Additional companies are recorded as historical subscription sources without creating another subscription.
CREATE OR REPLACE FUNCTION calendra_attach_company_to_workspace_subscription()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subscription_id BIGINT; billing_owner_id BIGINT; old_subscription_id BIGINT; replacement_owner_id BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.workspace_id IS DISTINCT FROM NEW.workspace_id AND OLD.workspace_id IS NOT NULL THEN
        SELECT id INTO old_subscription_id FROM workspace_subscriptions WHERE workspace_id = OLD.workspace_id;
        IF old_subscription_id IS NOT NULL THEN
            DELETE FROM workspace_subscription_legacy_sources
             WHERE workspace_subscription_id = old_subscription_id AND company_id = NEW.id;
            IF EXISTS (
                SELECT 1 FROM workspace_subscriptions
                 WHERE id = old_subscription_id AND legacy_primary_company_id = NEW.id
            ) THEN
                SELECT MIN(id) INTO replacement_owner_id
                  FROM company
                 WHERE workspace_id = OLD.workspace_id AND id <> NEW.id;
                UPDATE workspace_subscriptions
                   SET legacy_primary_company_id = replacement_owner_id,
                       updated_at = CURRENT_TIMESTAMP
                 WHERE id = old_subscription_id;
                UPDATE workspace_subscription_legacy_sources
                   SET retained_billing_owner = FALSE
                 WHERE workspace_subscription_id = old_subscription_id;
                IF replacement_owner_id IS NOT NULL THEN
                    UPDATE workspace_subscription_legacy_sources
                       SET retained_billing_owner = TRUE
                     WHERE workspace_subscription_id = old_subscription_id
                       AND company_id = replacement_owner_id;
                END IF;
            END IF;
        END IF;
    END IF;

    IF NEW.workspace_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO workspace_subscriptions (
        workspace_id, plan_key, billing_interval, status, features_json,
        max_operating_units, max_locations, max_active_users, max_consultants,
        max_public_booking_pages, created_at, updated_at
    ) VALUES (
        NEW.workspace_id, 'PROFESSIONAL', 'MONTHLY', 'ACTIVE',
        '["CORE","MULTI_UNIT","WORKSPACE_ANALYTICS","WORKSPACE_PUBLIC_BOOKING","CONFIGURATION_COPY"]',
        3, 10, 5, 5, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) ON CONFLICT (workspace_id) DO NOTHING;

    UPDATE workspace_subscriptions
       SET legacy_primary_company_id = COALESCE(legacy_primary_company_id, NEW.id),
           updated_at = CURRENT_TIMESTAMP
     WHERE workspace_id = NEW.workspace_id
     RETURNING id, legacy_primary_company_id INTO subscription_id, billing_owner_id;

    DELETE FROM workspace_subscription_legacy_sources
     WHERE company_id = NEW.id AND workspace_subscription_id <> subscription_id;

    INSERT INTO workspace_subscription_legacy_sources (
        workspace_subscription_id, company_id, retained_billing_owner
    ) VALUES (subscription_id, NEW.id, NEW.id = billing_owner_id)
    ON CONFLICT (workspace_subscription_id, company_id)
    DO UPDATE SET retained_billing_owner = EXCLUDED.retained_billing_owner;

    UPDATE workspace_subscription_legacy_sources
       SET retained_billing_owner = (company_id = billing_owner_id)
     WHERE workspace_subscription_id = subscription_id;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_attach_company_to_workspace_subscription ON company;
CREATE TRIGGER trg_attach_company_to_workspace_subscription
AFTER INSERT OR UPDATE OF workspace_id ON company
FOR EACH ROW EXECUTE FUNCTION calendra_attach_company_to_workspace_subscription();

CREATE OR REPLACE FUNCTION calendra_validate_workspace_subscription_payer()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payer_workspace BIGINT; owner_workspace BIGINT;
BEGIN
    IF NEW.legacy_primary_company_id IS NOT NULL THEN
        SELECT workspace_id INTO owner_workspace FROM company WHERE id = NEW.legacy_primary_company_id;
        IF owner_workspace IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Subscription billing-owner company does not exist';
        END IF;
        IF owner_workspace <> NEW.workspace_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Subscription billing owner must belong to the same workspace';
        END IF;
    END IF;

    IF NEW.payer_legal_entity_id IS NOT NULL THEN
        SELECT workspace_id INTO payer_workspace FROM legal_entities WHERE id = NEW.payer_legal_entity_id;
        IF payer_workspace IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Subscription payer legal entity does not exist';
        END IF;
        IF payer_workspace <> NEW.workspace_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Subscription payer must belong to the same workspace';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_workspace_subscription_payer ON workspace_subscriptions;
CREATE TRIGGER trg_validate_workspace_subscription_payer
BEFORE INSERT OR UPDATE OF workspace_id, legacy_primary_company_id, payer_legal_entity_id ON workspace_subscriptions
FOR EACH ROW EXECUTE FUNCTION calendra_validate_workspace_subscription_payer();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_unit_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed_units INTEGER; current_units INTEGER;
BEGIN
    SELECT max_operating_units INTO allowed_units FROM workspace_subscriptions WHERE workspace_id = NEW.workspace_id;
    IF allowed_units IS NULL OR allowed_units = 0 THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO current_units FROM company WHERE workspace_id = NEW.workspace_id AND (TG_OP = 'INSERT' OR id <> NEW.id);
    IF current_units + 1 > allowed_units THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace operating-unit limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_workspace_unit_limit ON company;
CREATE TRIGGER trg_enforce_workspace_unit_limit
BEFORE INSERT OR UPDATE OF workspace_id ON company
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_unit_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_location_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_locations INTEGER; current_locations INTEGER;
BEGIN
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_locations INTO allowed_locations FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_locations IS NULL OR allowed_locations = 0 THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO current_locations
      FROM locations l JOIN company c ON c.id = l.company_id
     WHERE c.workspace_id = target_workspace AND (TG_OP = 'INSERT' OR l.id <> NEW.id);
    IF current_locations + 1 > allowed_locations THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace location limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_workspace_location_limit ON locations;
CREATE TRIGGER trg_enforce_workspace_location_limit
BEFORE INSERT OR UPDATE OF company_id ON locations
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_location_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_user_limits()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; max_users INTEGER; max_consultants_limit INTEGER; current_users INTEGER; current_consultants INTEGER;
BEGIN
    IF NOT NEW.active THEN RETURN NEW; END IF;
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_active_users, max_consultants INTO max_users, max_consultants_limit
      FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF max_users IS NOT NULL AND max_users > 0 THEN
        SELECT COUNT(DISTINCT u.login_account_id) INTO current_users
          FROM users u JOIN company c ON c.id = u.company_id
         WHERE c.workspace_id = target_workspace AND u.active AND (TG_OP = 'INSERT' OR u.id <> NEW.id);
        IF NOT EXISTS (
            SELECT 1 FROM users u JOIN company c ON c.id = u.company_id
             WHERE c.workspace_id = target_workspace AND u.active AND u.login_account_id = NEW.login_account_id
               AND (TG_OP = 'INSERT' OR u.id <> NEW.id)
        ) AND current_users + 1 > max_users THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace active-user limit reached';
        END IF;
    END IF;
    IF NEW.consultant AND max_consultants_limit IS NOT NULL AND max_consultants_limit > 0 THEN
        SELECT COUNT(DISTINCT u.login_account_id) INTO current_consultants
          FROM users u JOIN company c ON c.id = u.company_id
         WHERE c.workspace_id = target_workspace AND u.active AND u.consultant AND (TG_OP = 'INSERT' OR u.id <> NEW.id);
        IF NOT EXISTS (
            SELECT 1 FROM users u JOIN company c ON c.id = u.company_id
             WHERE c.workspace_id = target_workspace AND u.active AND u.consultant AND u.login_account_id = NEW.login_account_id
               AND (TG_OP = 'INSERT' OR u.id <> NEW.id)
        ) AND current_consultants + 1 > max_consultants_limit THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace consultant limit reached';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_workspace_user_limits ON users;
CREATE TRIGGER trg_enforce_workspace_user_limits
BEFORE INSERT OR UPDATE OF company_id, login_account_id, active, consultant ON users
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_user_limits();


-- Optional hard limits. A zero limit means unlimited for backwards compatibility.
CREATE OR REPLACE FUNCTION calendra_enforce_workspace_client_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_clients INTEGER; current_clients BIGINT; identity_exists BOOLEAN;
BEGIN
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_clients INTO allowed_clients FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_clients IS NULL OR allowed_clients = 0 THEN RETURN NEW; END IF;

    SELECT COUNT(DISTINCT COALESCE(cl.workspace_client_id, cl.id))
      INTO current_clients
      FROM clients cl
      JOIN company c ON c.id = cl.company_id
     WHERE c.workspace_id = target_workspace
       AND (TG_OP = 'INSERT' OR cl.id <> NEW.id);

    SELECT EXISTS (
        SELECT 1
          FROM clients cl
          JOIN company c ON c.id = cl.company_id
         WHERE c.workspace_id = target_workspace
           AND COALESCE(cl.workspace_client_id, cl.id) = COALESCE(NEW.workspace_client_id, NEW.id)
           AND (TG_OP = 'INSERT' OR cl.id <> NEW.id)
    ) INTO identity_exists;

    IF NOT identity_exists AND current_clients + 1 > allowed_clients THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace client limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_clients_workspace_subscription_limit ON clients;
CREATE TRIGGER trg_clients_workspace_subscription_limit
BEFORE INSERT OR UPDATE OF company_id, workspace_client_id ON clients
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_client_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_booking_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_bookings INTEGER; overage_allowed BOOLEAN; current_bookings BIGINT;
BEGIN
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_monthly_bookings, allow_booking_overage
      INTO allowed_bookings, overage_allowed
      FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_bookings IS NULL OR allowed_bookings = 0 OR COALESCE(overage_allowed, TRUE) THEN RETURN NEW; END IF;

    SELECT COUNT(*) INTO current_bookings
      FROM session_booking sb
      JOIN company c ON c.id = sb.company_id
     WHERE c.workspace_id = target_workspace
       AND sb.start_time >= date_trunc('month', NEW.start_time)
       AND sb.start_time < date_trunc('month', NEW.start_time) + interval '1 month'
       AND (TG_OP = 'INSERT' OR sb.id <> NEW.id);
    IF current_bookings + 1 > allowed_bookings THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace monthly booking limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_session_booking_workspace_subscription_limit ON session_booking;
CREATE TRIGGER trg_session_booking_workspace_subscription_limit
BEFORE INSERT OR UPDATE OF company_id, start_time ON session_booking
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_booking_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_storage_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_bytes NUMERIC; current_bytes NUMERIC;
BEGIN
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.owner_company_id;
    SELECT storage_limit_mb::numeric * 1048576 INTO allowed_bytes
      FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_bytes IS NULL OR allowed_bytes = 0 THEN RETURN NEW; END IF;

    SELECT COALESCE((
        SELECT SUM(f.size_bytes) FROM client_files f JOIN company c ON c.id = f.owner_company_id
         WHERE c.workspace_id = target_workspace
           AND (TG_TABLE_NAME <> 'client_files' OR TG_OP = 'INSERT' OR f.id <> NEW.id)
    ), 0) + COALESCE((
        SELECT SUM(f.size_bytes) FROM company_files f JOIN company c ON c.id = f.owner_company_id
         WHERE c.workspace_id = target_workspace
           AND (TG_TABLE_NAME <> 'company_files' OR TG_OP = 'INSERT' OR f.id <> NEW.id)
    ), 0) INTO current_bytes;

    IF current_bytes + GREATEST(COALESCE(NEW.size_bytes, 0), 0) > allowed_bytes THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace storage limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_client_files_workspace_subscription_limit ON client_files;
CREATE TRIGGER trg_client_files_workspace_subscription_limit
BEFORE INSERT OR UPDATE OF owner_company_id, size_bytes ON client_files
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_storage_limit();
DROP TRIGGER IF EXISTS trg_company_files_workspace_subscription_limit ON company_files;
CREATE TRIGGER trg_company_files_workspace_subscription_limit
BEFORE INSERT OR UPDATE OF owner_company_id, size_bytes ON company_files
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_storage_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_public_page_limit_for_company()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed_pages INTEGER; current_pages BIGINT;
BEGIN
    IF NOT NEW.workspace_public_booking_enabled THEN RETURN NEW; END IF;
    SELECT max_public_booking_pages INTO allowed_pages FROM workspace_subscriptions WHERE workspace_id = NEW.workspace_id;
    IF allowed_pages IS NULL OR allowed_pages = 0 THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO current_pages
      FROM company c
     WHERE c.workspace_id = NEW.workspace_id
       AND c.workspace_public_booking_enabled
       AND (TG_OP = 'INSERT' OR c.id <> NEW.id);
    current_pages := current_pages + COALESCE((SELECT COUNT(*) FROM workspace_public_booking_settings s WHERE s.workspace_id = NEW.workspace_id AND s.enabled), 0);
    IF current_pages + 1 > allowed_pages THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace public-booking page limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_company_workspace_public_page_limit ON company;
CREATE TRIGGER trg_company_workspace_public_page_limit
BEFORE INSERT OR UPDATE OF workspace_id, workspace_public_booking_enabled ON company
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_public_page_limit_for_company();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_public_page_limit_for_workspace()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed_pages INTEGER; current_pages BIGINT;
BEGIN
    IF NOT NEW.enabled THEN RETURN NEW; END IF;
    SELECT max_public_booking_pages INTO allowed_pages FROM workspace_subscriptions WHERE workspace_id = NEW.workspace_id;
    IF allowed_pages IS NULL OR allowed_pages = 0 THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO current_pages FROM company c WHERE c.workspace_id = NEW.workspace_id AND c.workspace_public_booking_enabled;
    current_pages := current_pages + COALESCE((
        SELECT COUNT(*) FROM workspace_public_booking_settings s
         WHERE s.workspace_id = NEW.workspace_id AND s.enabled AND (TG_OP = 'INSERT' OR s.id <> NEW.id)
    ), 0);
    IF current_pages + 1 > allowed_pages THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace public-booking page limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_workspace_public_booking_subscription_limit ON workspace_public_booking_settings;
CREATE TRIGGER trg_workspace_public_booking_subscription_limit
BEFORE INSERT OR UPDATE OF workspace_id, enabled ON workspace_public_booking_settings
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_public_page_limit_for_workspace();

DROP FUNCTION IF EXISTS calendra_workspace_subscription_safe_date(TEXT);
DROP FUNCTION IF EXISTS calendra_workspace_subscription_safe_int(TEXT);
