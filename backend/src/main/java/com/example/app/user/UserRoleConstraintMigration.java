package com.example.app.user;

import java.util.Arrays;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * PostgreSQL may have a legacy {@code users_role_check} (or similar) that only lists
 * {@code ADMIN} and {@code CONSULTANT}. Hibernate {@code ddl-auto: update} does not widen
 * check constraints, so new {@link Role} enum values must be applied here.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class UserRoleConstraintMigration implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(UserRoleConstraintMigration.class);

    private final JdbcTemplate jdbc;

    public UserRoleConstraintMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        String roles = Arrays.stream(Role.values())
                .map(Role::name)
                .map(v -> "'" + v.replace("'", "''") + "'")
                .collect(Collectors.joining(", "));
        try {
            jdbc.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
            jdbc.execute("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (" + roles + "))");
        } catch (Exception ex) {
            log.warn("User role check constraint migration skipped: {}", ex.getMessage());
        }
    }
}
