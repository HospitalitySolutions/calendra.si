package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
@ActiveProfiles("test")
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {
                "spring.flyway.enabled=true",
                "spring.jpa.hibernate.ddl-auto=validate",
                "spring.task.scheduling.enabled=false",
                "spring.cloud.aws.s3.enabled=false",
                "app.rate-limit.enabled=false",
                "app.realtime.redis.enabled=false",
                "app.widget.turnstile.required-for-public-actions=false",
                "app.settings.encryption-key=integration-test-encryption-key-32-bytes-minimum",
                "app.jwt.secret=integration-test-jwt-secret-at-least-32-characters"
        }
)
class PostgresApplicationContextTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_context")
            .withUsername("calendra")
            .withPassword("calendra");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    DataSource dataSource;

    @Test
    void applicationStartsAgainstFullyMigratedPostgresSchema() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where success", Long.class))
                .isGreaterThanOrEqualTo(9L);
        assertThat(jdbc.queryForObject("select to_regclass('public.waitlist_requests') is not null", Boolean.class))
                .isTrue();
        assertThat(jdbc.queryForObject("select to_regclass('public.waitlist_request') is null", Boolean.class))
                .isTrue();
    }
}
