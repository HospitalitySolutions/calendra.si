package com.example.app.securitycenter;

import com.example.app.user.User;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class SecurityNotificationService {
    private static final Logger log = LoggerFactory.getLogger(SecurityNotificationService.class);

    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final boolean mailConfigured;

    public SecurityNotificationService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername
    ) {
        this.mailSender = mailSender;
        this.mailFrom = mailFrom == null ? "" : mailFrom.trim();
        this.mailConfigured = mailSender != null
                && mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank();
    }

    public void sendFactorChangeNotice(User user, String action, String detail) {
        send(user, "Security update on your account", """
                Hello %s,

                A security setting was changed on your account.

                Action: %s
                Details: %s

                If this wasn't you, review your security settings immediately.
                """.formatted(displayName(user), action, detail == null || detail.isBlank() ? "—" : detail));
    }

    public void sendSuspiciousSignInNotice(User user, String detail) {
        send(user, "Suspicious sign-in detected", """
                Hello %s,

                We noticed a sign-in that looks unusual for your account.

                Details: %s

                If this wasn't you, revoke active sessions and update your security settings.
                """.formatted(displayName(user), detail == null || detail.isBlank() ? "New sign-in" : detail));
    }

    private void send(User user, String subject, String body) {
        if (user == null || user.getEmail() == null || user.getEmail().isBlank()) {
            return;
        }
        if (!mailConfigured) {
            log.info("Security notification not sent to {} because mail is not configured. subject={}", user.getEmail(), subject);
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
            helper.setFrom(mailFrom);
            helper.setTo(user.getEmail());
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
        } catch (Exception e) {
            log.warn("Failed sending security notification to {}: {}", user.getEmail(), e.getMessage());
        }
    }

    private String displayName(User user) {
        String value = ((user.getFirstName() == null ? "" : user.getFirstName()) + " " + (user.getLastName() == null ? "" : user.getLastName())).trim();
        return value.isBlank() ? user.getEmail() : value;
    }
}
