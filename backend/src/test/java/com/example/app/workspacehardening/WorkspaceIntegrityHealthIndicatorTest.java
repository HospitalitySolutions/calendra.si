package com.example.app.workspacehardening;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Status;
import org.springframework.jdbc.core.JdbcTemplate;

class WorkspaceIntegrityHealthIndicatorTest {
    @Test
    void reportsUpWithoutQueryingWhenDisabled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        WorkspaceRolloutProperties properties = new WorkspaceRolloutProperties();
        properties.setIntegrityHealthEnabled(false);

        var health = new WorkspaceIntegrityHealthIndicator(jdbc, properties).health();

        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("enabled", false);
    }

    @Test
    void reportsUpWhenAllIntegrityChecksAreClean() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class))).thenReturn(false);
        WorkspaceRolloutProperties properties = enabledProperties();

        var health = new WorkspaceIntegrityHealthIndicator(jdbc, properties).health();

        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("enabled", true);
    }

    @Test
    void reportsDownWhenAnyIntegrityViolationExists() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class))).thenReturn(true, false, false, false, false, false, false, false);
        WorkspaceRolloutProperties properties = enabledProperties();

        var health = new WorkspaceIntegrityHealthIndicator(jdbc, properties).health();

        assertThat(health.getStatus()).isEqualTo(Status.DOWN);
        assertThat(health.getDetails()).containsKey("violations");
    }

    private WorkspaceRolloutProperties enabledProperties() {
        WorkspaceRolloutProperties properties = new WorkspaceRolloutProperties();
        properties.setIntegrityHealthEnabled(true);
        return properties;
    }
}
