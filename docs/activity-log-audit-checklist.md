# Activity log implementation checklist

Calendra's central `ActivityLog` is intended to describe meaningful business mutations in a human-readable way. Phase 4 adds CI guards so future mutation work cannot quietly change the app's mutation surface without an audit review.

## When adding or changing a mutating endpoint

1. Decide whether the operation is a meaningful business activity or only a technical/preview operation.
2. For meaningful activity, emit the event on the backend after the operation succeeds. Prefer the same transaction for database-only mutations.
3. Use the semantic `ActivityAction` rather than HTTP wording. Example: `SESSION_PARTICIPANT_ADDED`, not `POST_CALLED`.
4. Record the workspace/company automatically through `ActivityLogService`; include location/space when the affected object has them.
5. Include stable entity IDs and short labels so deleted objects still leave an understandable audit trail.
6. Put only compact metadata in `details_json`. Never duplicate passwords, API/OAuth tokens, private keys, fiscal certificate contents/passwords, or full message bodies.
7. Add/extend a behavioral test for the business flow when practical.
8. Run the tests. A mutation-snapshot failure is expected when the HTTP mutation surface changed.
9. After reviewing audit coverage, regenerate the snapshot from the repository root:

   `python scripts/generate-activity-audit-endpoints.py`

10. Commit the code, tests, and regenerated `backend/src/test/resources/activity-audit/mutation-endpoints.txt` together.

## What the Phase 4 guards cover

- `ActivityLogServiceTest`: actor/company/workspace attribution, external actors, detail serialization, field limits, invalid tenant context.
- `ActivityLogControllerTest`: admin-only read access, page-size safety, read-only HTTP boundary, response detail parsing.
- `ActivityActionUsageTest`: active action codes cannot lose every production emission hook unnoticed.
- `ActivityMutationEndpointSnapshotTest`: any POST/PUT/PATCH/DELETE controller surface change requires an explicit audit review.
- `FlywayBaselineMigrationTest`: canonical PostgreSQL V1/table/index/schema-contract behavior.

The mutation snapshot is a review gate, not proof that every technical POST must create a business log entry. Preview, validation, OAuth callback, webhook and similar endpoints may legitimately remain non-audited, but changes to them still receive an explicit review.
