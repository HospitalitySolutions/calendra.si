package com.example.app.client;

/**
 * Visibility for client-adjacent sensitive data. Phase 2 intentionally supports only UNIT_ONLY;
 * additional scopes require an explicit later privacy design and migration.
 */
public enum ClientDataVisibilityScope {
    UNIT_ONLY
}
