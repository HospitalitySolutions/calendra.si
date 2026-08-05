package com.example.app.workspacehardening;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Lightweight readiness guard for mandatory workspace ownership links.
 *
 * <p>Each query stops at the first violation. Detailed counts belong in the
 * offline {@code scripts/workspace-integrity-audit.sql}, not in a frequently
 * polled health endpoint.</p>
 */
@Component
public class WorkspaceIntegrityHealthIndicator implements HealthIndicator {
    private static final List<IntegrityCheck> CHECKS = List.of(
            new IntegrityCheck("companiesWithoutWorkspace", """
                    select exists(select 1 from company where workspace_id is null limit 1)
                    """),
            new IntegrityCheck("membershipsWithoutLoginAccount", """
                    select exists(select 1 from users where login_account_id is null limit 1)
                    """),
            new IntegrityCheck("clientsWithoutWorkspaceIdentity", """
                    select exists(select 1 from clients where workspace_client_id is null limit 1)
                    """),
            new IntegrityCheck("spacesWithInvalidLocation", """
                    select exists(
                        select 1 from space s
                        left join locations l on l.id=s.location_id
                        where s.location_id is null or l.id is null or l.company_id<>s.company_id
                        limit 1
                    )
                    """),
            new IntegrityCheck("bookingsWithInvalidLocation", """
                    select exists(
                        select 1 from session_booking b
                        left join locations l on l.id=b.location_id
                        where b.location_id is null or l.id is null or l.company_id<>b.company_id
                        limit 1
                    )
                    """),
            new IntegrityCheck("billsWithoutIssuerFoundation", """
                    select exists(
                        select 1 from bills
                        where legal_entity_id is null or invoice_series_id is null or location_id is null
                        limit 1
                    )
                    """),
            new IntegrityCheck("servicesWithoutWorkspaceTemplate", """
                    select exists(select 1 from session_type where workspace_service_template_id is null limit 1)
                    """),
            new IntegrityCheck("workspacesWithoutSubscription", """
                    select exists(
                        select 1 from workspaces w
                        left join workspace_subscriptions s on s.workspace_id=w.id
                        where w.active=true and s.id is null
                        limit 1
                    )
                    """)
    );

    private final JdbcTemplate jdbc;
    private final WorkspaceRolloutProperties properties;

    public WorkspaceIntegrityHealthIndicator(JdbcTemplate jdbc, WorkspaceRolloutProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    @Override
    public Health health() {
        if (!properties.isIntegrityHealthEnabled()) {
            return Health.up().withDetail("enabled", false).build();
        }
        List<String> violations = new ArrayList<>();
        try {
            for (IntegrityCheck check : CHECKS) {
                if (Boolean.TRUE.equals(jdbc.queryForObject(check.sql(), Boolean.class))) {
                    violations.add(check.name());
                }
            }
        } catch (Exception ex) {
            return Health.down(ex).withDetail("enabled", true).build();
        }
        if (!violations.isEmpty()) {
            return Health.down()
                    .withDetail("enabled", true)
                    .withDetail("violations", violations)
                    .build();
        }
        return Health.up()
                .withDetail("enabled", true)
                .withDetail("checks", CHECKS.size())
                .build();
    }

    private record IntegrityCheck(String name, String sql) {}
}
