package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class WorkspaceSubscriptionMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_workspace_subscription")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void migratesOneSubscriptionPerWorkspacePreservesLegacySourcesAndEnforcesWorkspaceLimits() {
        flyway("31").migrate();
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = insertWorkspace(jdbc, "Subscription workspace");
        Long firstCompanyId = insertCompany(jdbc, workspaceId, "Maribor", "subscription-maribor");
        Long secondCompanyId = insertCompany(jdbc, workspaceId, "Ljubljana", "subscription-ljubljana");
        insertSetting(jdbc, firstCompanyId, "SIGNUP_PACKAGE_NAME", "BASIC");
        insertSetting(jdbc, firstCompanyId, "BILLING_SUBSCRIPTION_INTERVAL", "YEARLY");
        insertSetting(jdbc, firstCompanyId, "BILLING_SUBSCRIPTION_STATUS", "PAID");
        insertSetting(jdbc, firstCompanyId, "BILLING_SUBSCRIPTION_START", "not-a-date");
        insertSetting(jdbc, firstCompanyId, "SIGNUP_USER_COUNT", "not-an-integer");
        insertSetting(jdbc, firstCompanyId, "BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT", "3");
        insertSetting(jdbc, firstCompanyId, "SIGNUP_SMS_COUNT", "100");
        insertSetting(jdbc, firstCompanyId, "TENANCY_SMS_SENT_COUNT", "12");
        insertSetting(jdbc, secondCompanyId, "SIGNUP_SMS_COUNT", "50");
        insertSetting(jdbc, secondCompanyId, "TENANCY_SMS_SENT_COUNT", "8");

        Long loginId = insertLoginAccount(jdbc, firstCompanyId, "owner@workspace.test");
        insertMembership(jdbc, firstCompanyId, loginId, "owner@workspace.test", false);
        insertMembership(jdbc, secondCompanyId, loginId, "owner@workspace.test", false);

        flyway(null).migrate();

        Long subscriptionId = jdbc.queryForObject(
                "select id from workspace_subscriptions where workspace_id=?", Long.class, workspaceId);
        assertThat(subscriptionId).isNotNull();
        assertThat(jdbc.queryForObject(
                "select count(*) from workspace_subscriptions where workspace_id=?", Integer.class, workspaceId)).isOne();
        assertThat(jdbc.queryForObject(
                "select legacy_primary_company_id from workspace_subscriptions where id=?", Long.class, subscriptionId))
                .isEqualTo(firstCompanyId);
        assertThat(jdbc.queryForObject(
                "select count(*) from workspace_subscription_legacy_sources where workspace_subscription_id=?", Integer.class, subscriptionId))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "select count(*) from workspace_subscription_legacy_sources where workspace_subscription_id=? and retained_billing_owner", Integer.class, subscriptionId))
                .isOne();
        assertThat(jdbc.queryForObject(
                "select current_period_start from workspace_subscriptions where id=?", java.sql.Date.class, subscriptionId))
                .isNull();
        assertThat(jdbc.queryForObject(
                "select features_json from workspace_subscriptions where id=?", String.class, subscriptionId))
                .contains("MULTI_UNIT", "WORKSPACE_ANALYTICS", "WORKSPACE_PUBLIC_BOOKING", "CONFIGURATION_COPY");
        assertThat(jdbc.queryForObject(
                "select coalesce(sum(quantity),0) from workspace_usage_monthly where workspace_id=? and metric='SMS_PARTS'", Long.class, workspaceId))
                .isEqualTo(20L);

        // The migrated limits never undercut current workspace usage.
        assertThat(jdbc.queryForObject(
                "select max_operating_units from workspace_subscriptions where id=?", Integer.class, subscriptionId)).isGreaterThanOrEqualTo(2);
        assertThat(jdbc.queryForObject(
                "select max_locations from workspace_subscriptions where id=?", Integer.class, subscriptionId)).isGreaterThanOrEqualTo(2);
        assertThat(jdbc.queryForObject(
                "select max_active_users from workspace_subscriptions where id=?", Integer.class, subscriptionId)).isEqualTo(4);
        assertThat(jdbc.queryForObject(
                "select max_consultants from workspace_subscriptions where id=?", Integer.class, subscriptionId)).isEqualTo(4);

        // Unit, location and distinct-login limits are enforced even for raw SQL writers.
        jdbc.update("update workspace_subscriptions set max_operating_units=2, max_locations=2, max_active_users=1 where id=?", subscriptionId);
        assertThatThrownBy(() -> insertCompany(jdbc, workspaceId, "Koper", "subscription-koper"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into locations(created_at, updated_at, company_id, name, timezone, public_booking_enabled, default_location, active)
                values (current_timestamp, current_timestamp, ?, 'Extra', 'Europe/Ljubljana', true, false, true)
                """, firstCompanyId)).isInstanceOf(DataIntegrityViolationException.class);

        Long secondLoginId = insertLoginAccount(jdbc, firstCompanyId, "second@workspace.test");
        assertThatThrownBy(() -> insertMembership(jdbc, firstCompanyId, secondLoginId, "second@workspace.test", false))
                .isInstanceOf(DataIntegrityViolationException.class);

        // A payer can only be selected from the same workspace.
        Long otherWorkspaceId = insertWorkspace(jdbc, "Other workspace");
        Long otherCompanyId = insertCompany(jdbc, otherWorkspaceId, "Other unit", "subscription-other");
        Long foreignLegalEntityId = jdbc.queryForObject(
                "select legal_entity_id from company_legal_entities where company_id=? and default_issuer=true", Long.class, otherCompanyId);
        assertThatThrownBy(() -> jdbc.update(
                "update workspace_subscriptions set payer_legal_entity_id=? where id=?", foreignLegalEntityId, subscriptionId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "update workspace_subscriptions set legacy_primary_company_id=? where id=?", otherCompanyId, subscriptionId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "update workspace_subscription_legacy_sources set retained_billing_owner=true where workspace_subscription_id=? and company_id=?",
                subscriptionId, secondCompanyId))
                .isInstanceOf(DataIntegrityViolationException.class);

        jdbc.update("""
                insert into workspace_usage_events(workspace_id, company_id, usage_month, metric, source_type, source_id, quantity)
                values (?, ?, date_trunc('month', current_date)::date, 'PAYMENT_TRANSACTIONS', 'BILL', '42', 1)
                """, workspaceId, firstCompanyId);
        assertThatThrownBy(() -> jdbc.update("""
                insert into workspace_usage_events(workspace_id, company_id, usage_month, metric, source_type, source_id, quantity)
                values (?, ?, date_trunc('month', current_date)::date, 'PAYMENT_TRANSACTIONS', 'BILL', '42', 1)
                """, workspaceId, firstCompanyId)).isInstanceOf(DataIntegrityViolationException.class);

        // Workspaces created after V32 receive a subscription automatically.
        assertThat(jdbc.queryForObject(
                "select count(*) from workspace_subscriptions where workspace_id=?", Integer.class, otherWorkspaceId)).isOne();
        assertThat(jdbc.queryForObject(
                "select legacy_primary_company_id from workspace_subscriptions where workspace_id=?", Long.class, otherWorkspaceId))
                .isEqualTo(otherCompanyId);
        assertThat(jdbc.queryForObject("""
                select count(*) from workspace_subscription_legacy_sources ls
                join workspace_subscriptions ws on ws.id=ls.workspace_subscription_id
                where ws.workspace_id=? and ls.company_id=? and ls.retained_billing_owner
                """, Integer.class, otherWorkspaceId, otherCompanyId)).isOne();
    }

    private Long insertWorkspace(JdbcTemplate jdbc, String name) {
        return jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, ?, true)
                returning id
                """, Long.class, name);
    }

    private Long insertCompany(JdbcTemplate jdbc, Long workspaceId, String name, String tenantCode) {
        return jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, ?, ?)
                returning id
                """, Long.class, workspaceId, name, tenantCode);
    }

    private void insertSetting(JdbcTemplate jdbc, Long companyId, String key, String value) {
        jdbc.update("""
                insert into app_settings(created_at, updated_at, company_id, key, value)
                values (current_timestamp, current_timestamp, ?, ?, ?)
                """, companyId, key, value);
    }

    private Long insertLoginAccount(JdbcTemplate jdbc, Long selectedCompanyId, String email) {
        return jdbc.queryForObject("""
                insert into login_accounts(
                    created_at, updated_at, first_name, last_name, email, password_hash, active, last_selected_company_id
                ) values (
                    current_timestamp, current_timestamp, 'Workspace', 'Owner', ?, '$2a$10$testHash', true, ?
                ) returning id
                """, Long.class, email, selectedCompanyId);
    }

    private Long insertMembership(JdbcTemplate jdbc, Long companyId, Long loginAccountId, String email, boolean consultant) {
        return jdbc.queryForObject("""
                insert into users(
                    created_at, updated_at, company_id, login_account_id, first_name, last_name,
                    email, password_hash, role, active, consultant
                ) values (
                    current_timestamp, current_timestamp, ?, ?, 'Workspace', 'Owner', ?,
                    '$2a$10$testHash', 'ADMIN', true, ?
                ) returning id
                """, Long.class, companyId, loginAccountId, email, consultant);
    }

    private Flyway flyway(String target) {
        var configuration = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0");
        if (target != null) configuration.target(target);
        return configuration.load();
    }

    private JdbcTemplate jdbc() {
        return new JdbcTemplate(new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
    }
}
