ALTER TABLE calendar_todos
    ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'SELECTED';

CREATE TABLE IF NOT EXISTS calendar_todo_visible_users (
    todo_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    PRIMARY KEY (todo_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_todo_visible_users_user ON calendar_todo_visible_users(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_todo_visible_users_todo ON calendar_todo_visible_users(todo_id);

INSERT INTO calendar_todo_visible_users (todo_id, user_id)
SELECT id, owner_id
FROM calendar_todos
WHERE owner_id IS NOT NULL
ON CONFLICT DO NOTHING;
