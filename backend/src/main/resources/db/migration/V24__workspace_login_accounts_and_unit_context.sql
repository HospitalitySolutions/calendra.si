-- Phase 1 multi-unit authentication foundation.
-- Existing Company rows remain the isolated operating units. Existing User rows become unit memberships.

CREATE TABLE IF NOT EXISTS workspaces (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    name VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE company ADD COLUMN IF NOT EXISTS workspace_id BIGINT;

-- Preserve identifiers for the initial one-company-per-workspace migration. This also makes rollback/auditing simpler.
INSERT INTO workspaces (id, created_at, updated_at, name, active)
SELECT c.id, c.created_at, c.updated_at, c.name, TRUE
FROM company c
WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = c.id);

UPDATE company SET workspace_id = id WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_company_workspace') THEN
        ALTER TABLE company
            ADD CONSTRAINT fk_company_workspace
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
    END IF;
END $$;

ALTER TABLE company ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_workspace_id ON company(workspace_id, id);

SELECT setval(
    pg_get_serial_sequence('workspaces', 'id'),
    COALESCE((SELECT MAX(id) FROM workspaces), 1),
    EXISTS (SELECT 1 FROM workspaces)
);

CREATE TABLE IF NOT EXISTS login_accounts (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_selected_company_id BIGINT
);

-- One login account per existing user preserves every existing credential. Later, multiple memberships may point
-- to the same login account without moving tenant-owned data.
INSERT INTO login_accounts (
    id, created_at, updated_at, first_name, last_name, email, password_hash, active, last_selected_company_id
)
SELECT u.id, u.created_at, u.updated_at, u.first_name, u.last_name, lower(trim(u.email)), u.password_hash, TRUE, u.company_id
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM login_accounts la WHERE la.id = u.id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS login_account_id BIGINT;
UPDATE users SET login_account_id = id WHERE login_account_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_login_account') THEN
        ALTER TABLE users
            ADD CONSTRAINT fk_users_login_account
            FOREIGN KEY (login_account_id) REFERENCES login_accounts(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_login_accounts_last_selected_company') THEN
        ALTER TABLE login_accounts
            ADD CONSTRAINT fk_login_accounts_last_selected_company
            FOREIGN KEY (last_selected_company_id) REFERENCES company(id) ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN login_account_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_login_account ON users(login_account_id, active, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_login_account_company
    ON users(login_account_id, company_id);
CREATE INDEX IF NOT EXISTS idx_login_accounts_email_lower ON login_accounts(lower(email));

SELECT setval(
    pg_get_serial_sequence('login_accounts', 'id'),
    COALESCE((SELECT MAX(id) FROM login_accounts), 1),
    EXISTS (SELECT 1 FROM login_accounts)
);

ALTER TABLE user_security_sessions ADD COLUMN IF NOT EXISTS login_account_id BIGINT;
UPDATE user_security_sessions s
SET login_account_id = u.login_account_id
FROM users u
WHERE s.user_id = u.id AND s.login_account_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_security_sessions_login_account') THEN
        ALTER TABLE user_security_sessions
            ADD CONSTRAINT fk_user_security_sessions_login_account
            FOREIGN KEY (login_account_id) REFERENCES login_accounts(id) ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE user_security_sessions ALTER COLUMN login_account_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_security_sessions_login_account_last_seen
    ON user_security_sessions(login_account_id, last_seen_at DESC);
