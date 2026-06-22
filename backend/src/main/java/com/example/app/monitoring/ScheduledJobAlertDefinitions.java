package com.example.app.monitoring;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

public final class ScheduledJobAlertDefinitions {
    private static final List<ScheduledJobAlertDefinition> DEFINITIONS = List.of(
            def("reminder-scheduled-template-notifications", "Booking reminders", Duration.ofMinutes(15), Duration.ofMinutes(10), ScheduledJobAlertSeverity.CRITICAL, "Tenant-configured before/after session email/SMS reminders."),
            def("guest-booking-push-reminders", "Guest push reminders", Duration.ofMinutes(15), Duration.ofMinutes(10), ScheduledJobAlertSeverity.CRITICAL, "Guest-app push reminders before bookings."),
            def("scheduled-messages-dispatch", "Scheduled messages", Duration.ofMinutes(15), Duration.ofMinutes(10), ScheduledJobAlertSeverity.CRITICAL, "Scheduled inbox/client messages dispatch."),
            def("open-bill-sync-queue", "Open bill sync", Duration.ofMinutes(10), Duration.ofMinutes(5), ScheduledJobAlertSeverity.CRITICAL, "Dirty-queue sync for open bills."),
            def("google-calendar-sync-jobs", "Google Calendar sync", Duration.ofHours(2), Duration.ofMinutes(10), ScheduledJobAlertSeverity.WARNING, "Queued Google Calendar push/pull/full-sync jobs."),
            def("google-calendar-watch-renewal", "Google Calendar watch renewal", Duration.ofHours(2), Duration.ofMinutes(20), ScheduledJobAlertSeverity.WARNING, "Renewal of expiring Google Calendar webhook channels."),
            def("platform-subscription-renewals", "Subscription billing", Duration.ofHours(26), Duration.ofHours(1), ScheduledJobAlertSeverity.CRITICAL, "Daily tenant subscription renewal billing."),
            def("platform-subscription-open-bill-refresh", "Subscription open-bill refresh", Duration.ofHours(26), Duration.ofHours(1), ScheduledJobAlertSeverity.CRITICAL, "Refresh open platform subscription bills."),
            def("delivery-log-cleanup", "Delivery log cleanup", Duration.ofHours(30), Duration.ofHours(1), ScheduledJobAlertSeverity.WARNING, "Retention cleanup for message delivery logs."),
            def("inbox-message-cleanup", "Inbox cleanup", Duration.ofHours(30), Duration.ofHours(1), ScheduledJobAlertSeverity.WARNING, "Retention cleanup for inbox messages."),
            def("inbox-attachment-cleanup", "Inbox attachment cleanup", Duration.ofHours(2), Duration.ofMinutes(30), ScheduledJobAlertSeverity.WARNING, "Cleanup of expired pending inbox attachments."),
            def("guest-entitlement-expiry", "Guest entitlement expiry", Duration.ofMinutes(15), Duration.ofMinutes(10), ScheduledJobAlertSeverity.WARNING, "Marks expired wallet entitlements."),
            def("analytics-report-scheduler", "Analytics reports", Duration.ofHours(2), Duration.ofHours(1), ScheduledJobAlertSeverity.WARNING, "Scheduled owner analytics reports."),
            def("scheduled-job-run-cleanup", "Scheduled job run cleanup", Duration.ofHours(30), Duration.ofHours(1), ScheduledJobAlertSeverity.WARNING, "Retention cleanup for scheduled job run history.")
    );

    private ScheduledJobAlertDefinitions() {}

    public static List<ScheduledJobAlertDefinition> all() {
        return DEFINITIONS;
    }

    public static Optional<ScheduledJobAlertDefinition> find(String jobName) {
        if (jobName == null || jobName.isBlank()) return Optional.empty();
        return DEFINITIONS.stream().filter(def -> def.jobName().equals(jobName)).findFirst();
    }

    private static ScheduledJobAlertDefinition def(
            String jobName,
            String label,
            Duration expectedSuccessWithin,
            Duration stuckAfter,
            ScheduledJobAlertSeverity severity,
            String description
    ) {
        return new ScheduledJobAlertDefinition(jobName, label, expectedSuccessWithin, stuckAfter, severity, description);
    }
}
