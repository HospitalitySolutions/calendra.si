package com.example.app.monitoring;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class ScheduledJobAlertEmailService {
    private static final Logger log = LoggerFactory.getLogger(ScheduledJobAlertEmailService.class);

    private final JavaMailSender mailSender;
    private final String configuredRecipients;
    private final String mailFrom;
    private final String fallbackFrom;
    private final boolean mailConfigured;
    private final String environment;

    public ScheduledJobAlertEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.platform-alert-emails:}") String configuredRecipients,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${spring.profiles.active:default}") String environment
    ) {
        this.mailSender = mailSender;
        this.configuredRecipients = configuredRecipients == null ? "" : configuredRecipients.trim();
        this.mailFrom = mailFrom == null ? "" : mailFrom.trim();
        this.fallbackFrom = mailUsername == null ? "" : mailUsername.trim();
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.environment = environment == null || environment.isBlank() ? "default" : environment.trim();
    }

    public boolean sendOpened(ScheduledJobAlertState alert, ScheduledJobAlertDefinition definition) {
        String subject = "[Calendra " + environmentLabel() + " Alert] Scheduled job " + humanType(alert.getAlertType()) + ": " + label(alert, definition);
        String body = "Scheduled job alert opened\n\n"
                + "Job: " + label(alert, definition) + " (" + alert.getJobName() + ")\n"
                + "Alert: " + alert.getAlertType() + "\n"
                + "Severity: " + alert.getSeverity() + "\n"
                + "Detected at: " + safeInstant(alert.getLastDetectedAt()) + "\n"
                + "Last run id: " + nullDash(alert.getLastRunId()) + "\n"
                + "Environment: " + environment + "\n\n"
                + nullDash(alert.getMessage()) + "\n";
        return send(subject, body);
    }

    public boolean sendRecovered(ScheduledJobAlertState alert, ScheduledJobAlertDefinition definition) {
        String subject = "[Calendra " + environmentLabel() + " Recovery] Scheduled job recovered: " + label(alert, definition);
        String body = "Scheduled job alert recovered\n\n"
                + "Job: " + label(alert, definition) + " (" + alert.getJobName() + ")\n"
                + "Alert: " + alert.getAlertType() + "\n"
                + "Severity: " + alert.getSeverity() + "\n"
                + "First detected at: " + safeInstant(alert.getFirstDetectedAt()) + "\n"
                + "Resolved at: " + safeInstant(alert.getResolvedAt()) + "\n"
                + "Environment: " + environment + "\n\n"
                + nullDash(alert.getMessage()) + "\n";
        return send(subject, body);
    }

    private boolean send(String subject, String body) {
        List<String> recipients = recipients();
        if (recipients.isEmpty()) {
            log.warn("Scheduled job alert email skipped: APP_PLATFORM_ALERT_EMAILS / app.platform-alert-emails is not configured.");
            return false;
        }
        if (!mailConfigured) {
            log.warn("Scheduled job alert email skipped: mail sender is not configured.");
            return false;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            String from = resolveFromAddress();
            if (!from.isBlank()) message.setFrom(from);
            message.setTo(recipients.toArray(String[]::new));
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            return true;
        } catch (Exception ex) {
            log.warn("Failed to send scheduled job alert email: {}", safeMessage(ex));
            return false;
        }
    }

    private List<String> recipients() {
        if (configuredRecipients.isBlank()) return List.of();
        return Arrays.stream(configuredRecipients.split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
    }

    private String resolveFromAddress() {
        if (!mailFrom.isBlank()) return mailFrom;
        return fallbackFrom;
    }

    private static String label(ScheduledJobAlertState alert, ScheduledJobAlertDefinition definition) {
        if (definition != null && definition.label() != null && !definition.label().isBlank()) return definition.label();
        return alert == null ? "unknown" : alert.getJobName();
    }

    private static String humanType(ScheduledJobAlertType type) {
        if (type == null) return "alert";
        return switch (type) {
            case FAILED -> "failed";
            case MISSING_SUCCESS -> "missing success";
            case STUCK_RUNNING -> "stuck";
        };
    }

    private String environmentLabel() {
        String env = environment == null ? "Production" : environment.trim();
        if (env.isBlank()) return "Production";
        return env.substring(0, 1).toUpperCase() + env.substring(1);
    }

    private static String safeInstant(Instant instant) {
        return instant == null ? "—" : instant.toString();
    }

    private static String nullDash(Object value) {
        return value == null ? "—" : String.valueOf(value);
    }

    private static String safeMessage(Exception ex) {
        if (ex == null) return "Unknown error";
        String message = ex.getMessage();
        if (message == null || message.isBlank()) message = ex.getClass().getSimpleName();
        return message.replaceAll("[\\r\\n\\t]+", " ");
    }
}
