package com.example.app.monitoring;

import java.time.Duration;

public record ScheduledJobAlertDefinition(
        String jobName,
        String label,
        Duration expectedSuccessWithin,
        Duration stuckAfter,
        ScheduledJobAlertSeverity severity,
        String description
) {}
