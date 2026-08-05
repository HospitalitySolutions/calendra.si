package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.app.billing.Bill;
import com.example.app.billingissuer.InvoiceIssuanceService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
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
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
                "spring.flyway.enabled=true",
                "spring.jpa.hibernate.ddl-auto=validate",
                "spring.task.scheduling.enabled=false",
                "spring.cloud.aws.s3.enabled=false",
                "app.rate-limit.enabled=false",
                "app.realtime.redis.enabled=false",
                "app.widget.turnstile.required-for-public-actions=false",
                "app.workspace-rollout.integrity-health-enabled=false",
                "app.settings.encryption-key=integration-test-encryption-key-32-bytes-minimum",
                "app.jwt.secret=integration-test-jwt-secret-at-least-32-characters"
        }
)
class InvoiceSeriesConcurrencyIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_invoice_concurrency")
            .withUsername("calendra")
            .withPassword("calendra");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    InvoiceIssuanceService issuance;

    @Autowired
    DataSource dataSource;

    @Test
    void allocatesUniqueNumbersWhenSeveralRequestsUseTheSameSeriesConcurrently() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Concurrency workspace', true)
                returning id
                """, Long.class);
        Long companyId = jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, 'Concurrency unit', 'concurrency-unit')
                returning id
                """, Long.class, workspaceId);
        Long seriesId = jdbc.queryForObject("""
                select default_invoice_series_id
                from company_legal_entities
                where company_id=? and default_issuer=true
                """, Long.class, companyId);
        jdbc.update("update invoice_series set next_number='1', initial_number='1', reset_policy='NONE' where id=?", seriesId);

        int attempts = 12;
        CountDownLatch ready = new CountDownLatch(attempts);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(attempts);
        List<Future<String>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < attempts; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    start.await();
                    Bill bill = new Bill();
                    issuance.assign(bill, companyId, null, seriesId, null, LocalDate.of(2026, 8, 5));
                    return bill.getBillNumber();
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            List<String> numbers = new ArrayList<>();
            for (Future<String> future : futures) numbers.add(future.get(20, TimeUnit.SECONDS));

            assertThat(numbers).hasSize(attempts).doesNotHaveDuplicates();
            assertThat(numbers.stream().map(Integer::parseInt).sorted().toList())
                    .containsExactlyElementsOf(java.util.stream.IntStream.rangeClosed(1, attempts).boxed().toList());
            assertThat(jdbc.queryForObject("select next_number from invoice_series where id=?", String.class, seriesId))
                    .isEqualTo(String.valueOf(attempts + 1));
        } finally {
            start.countDown();
            pool.shutdownNow();
        }
    }
}
