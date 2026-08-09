package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class LegacyPublicIdentityCleanupMigrationTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_public_identity_cleanup")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void legacyCompanyPublicIdentityIsRemovedWithoutTouchingLocationPresentation() throws Exception {
        migrate("54");
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Phase 7 cleanup', true)
                returning id
                """, Long.class);
        Long companyId = jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, 'Cleanup Company', 'cleanup-company')
                returning id
                """, Long.class, workspaceId);
        Long locationId = jdbc.queryForObject(
                "select id from locations where company_id=? and default_location=true",
                Long.class,
                companyId
        );

        jdbc.update("""
                update locations
                   set public_name='Canonical Branch', public_address='Branch Street 1',
                       public_description='Canonical description', phone='+38640111222',
                       public_directory_enabled=true, guest_app_discoverable=true,
                       google_place_id='branch-place-id'
                 where id=?
                """, locationId);

        upsert(jdbc, companyId, "PUBLIC_DIRECTORY_ENABLED", "false");
        upsert(jdbc, companyId, "GOOGLE_PLACE_ID", "legacy-company-place-id");
        upsert(jdbc, companyId, "GUEST_APP_SETTINGS_JSON", """
                {"guestAppEnabled":true,"tenantType":"salon","multipleServicesEnabled":true,
                 "publicDiscoverable":false,"publicName":"Legacy Company Name",
                 "publicAddress":"Legacy Address","publicDescription":"Legacy Description",
                 "publicPhone":"+38649999999","logoImageUrl":"https://legacy/logo.png"}
                """);

        migrate(null);

        assertThat(jdbc.queryForObject(
                "select count(*) from app_settings where company_id=? and key in ('PUBLIC_DIRECTORY_ENABLED','GOOGLE_PLACE_ID')",
                Integer.class,
                companyId
        )).isZero();

        String guestJson = jdbc.queryForObject(
                "select value from app_settings where company_id=? and key='GUEST_APP_SETTINGS_JSON'",
                String.class,
                companyId
        );
        JsonNode guest = JSON.readTree(guestJson);
        assertThat(guest.path("guestAppEnabled").asBoolean()).isTrue();
        assertThat(guest.path("tenantType").asText()).isEqualTo("salon");
        assertThat(guest.path("multipleServicesEnabled").asBoolean()).isTrue();
        assertThat(guest.has("publicDiscoverable")).isFalse();
        assertThat(guest.has("publicName")).isFalse();
        assertThat(guest.has("publicAddress")).isFalse();
        assertThat(guest.has("publicDescription")).isFalse();
        assertThat(guest.has("publicPhone")).isFalse();
        assertThat(guest.has("logoImageUrl")).isFalse();
        assertThat(jdbc.queryForObject(
                "select value from app_settings where company_id=? and key='COMPANY_LOGO_URL'",
                String.class,
                companyId
        )).isEqualTo("https://legacy/logo.png");

        assertThat(jdbc.queryForObject("select public_name from locations where id=?", String.class, locationId))
                .isEqualTo("Canonical Branch");
        assertThat(jdbc.queryForObject("select public_address from locations where id=?", String.class, locationId))
                .isEqualTo("Branch Street 1");
        assertThat(jdbc.queryForObject("select google_place_id from locations where id=?", String.class, locationId))
                .isEqualTo("branch-place-id");
    }

    private void upsert(JdbcTemplate jdbc, Long companyId, String key, String value) {
        jdbc.update("""
                insert into app_settings(created_at, updated_at, company_id, key, value)
                values (current_timestamp, current_timestamp, ?, ?, ?)
                on conflict (company_id, key) do update set value=excluded.value, updated_at=current_timestamp
                """, companyId, key, value);
    }

    private void migrate(String target) {
        FluentConfiguration configuration = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0");
        if (target != null) configuration.target(target);
        configuration.load().migrate();
    }

    private JdbcTemplate jdbc() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.postgresql.Driver");
        ds.setUrl(POSTGRES.getJdbcUrl());
        ds.setUsername(POSTGRES.getUsername());
        ds.setPassword(POSTGRES.getPassword());
        return new JdbcTemplate(ds);
    }
}
