package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class FlywayBaselineLayoutTest {

    @Test
    void repositoryShipsOnlyCanonicalProductionV1() throws IOException {
        Path migrations = Path.of("src/main/resources/db/migration");
        try (var files = Files.list(migrations)) {
            List<String> sqlFiles = files
                    .filter(path -> path.getFileName().toString().matches("V\\d+__.*\\.sql"))
                    .map(path -> path.getFileName().toString())
                    .sorted()
                    .toList();
            assertThat(sqlFiles).containsExactly("V1__baseline_schema.sql");
        }
    }

    @Test
    void canonicalV1DoesNotReintroduceRetiredUpgradeObjects() throws IOException {
        String sql = Files.readString(Path.of("src/main/resources/db/migration/V1__baseline_schema.sql"));

        assertThat(sql).contains("billing_owner_company_id");
        assertThat(sql).contains("uq_clients_company_normalized_email");
        assertThat(sql).doesNotContain("workspace_subscription_legacy_sources");
        assertThat(sql).doesNotContain("legacy_primary_company_id");
        assertThat(sql).doesNotContain("CREATE TABLE waitlist_request (");
        assertThat(sql).doesNotContain("fill_session_consumable_billing_snapshots");
        assertThat(sql).doesNotContain("enforce_client_email_unique_per_tenant");
        assertThat(sql).doesNotContain("ALTER TABLE consumable DROP COLUMN");
        assertThat(sql).doesNotContain("NOT VALID");
    }
}
