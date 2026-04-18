# Inbox PostgreSQL fix

This update fixes the backend error:

`Large Objects may not be used in auto-commit mode`

Cause:
- `ClientMessage.body` is stored as a PostgreSQL LOB-backed field.
- Inbox listing code was reading message bodies after the repository transaction had ended.
- PostgreSQL then refused to open the large object stream in auto-commit mode.

Fix applied:
- Added `@Transactional(readOnly = true)` to inbox read methods in `ClientMessageService`.
- Added `@Transactional` to send flow for consistency.

Files changed:
- `backend/src/main/java/com/example/app/inbox/ClientMessageService.java`

