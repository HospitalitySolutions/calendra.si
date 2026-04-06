package com.example.app.reminder;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.session.SessionBooking;
import com.example.app.user.User;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Service
public class ReminderService {
    private static final Logger log = LoggerFactory.getLogger(ReminderService.class);
    private static final DateTimeFormatter DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("EEEE, MMM d 'at' HH:mm");

    private final JavaMailSender mailSender;
    private final RestTemplate restTemplate = new RestTemplate();
    private final String mailFrom;
    private final String infobipBaseUrl;
    private final String infobipApiKey;
    private final String infobipSender;
    private final boolean mailConfigured;
    private final boolean smsConfigured;
    private final AppSettingRepository appSettings;
    private final CompanyRepository companies;

    public ReminderService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${app.infobip.base-url:https://api.infobip.com}") String infobipBaseUrl,
            @Value("${app.infobip.api-key:}") String infobipApiKey,
            @Value("${app.infobip.sender:}") String infobipSender,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            AppSettingRepository appSettings,
            CompanyRepository companies
    ) {
        this.mailSender = mailSender;
        this.mailFrom = mailFrom != null ? mailFrom : "";
        this.infobipBaseUrl = infobipBaseUrl != null ? infobipBaseUrl.strip().replaceAll("/$", "") : "";
        this.infobipApiKey = infobipApiKey != null ? infobipApiKey : "";
        this.infobipSender = infobipSender != null ? infobipSender : "";
        this.mailConfigured = mailSender != null
                && mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank();
        this.smsConfigured = !this.infobipBaseUrl.isBlank() && !this.infobipApiKey.isBlank() && !this.infobipSender.isBlank();
        this.appSettings = appSettings;
        this.companies = companies;
    }

    public void sendReminders(SessionBooking booking) {
        Client client = booking.getClient();
        if (client == null || client.isAnonymized()) {
            return;
        }
        User consultant = booking.getConsultant();
        String clientName = (client.getFirstName() + " " + client.getLastName()).trim();
        String consultantName = consultant == null
                ? "Unassigned"
                : (consultant.getFirstName() + " " + consultant.getLastName()).trim();
        String startFormatted = booking.getStartTime().format(DATE_TIME_FORMAT);
        String typeName = booking.getType() != null ? booking.getType().getName() : "Session";

        if (client.getEmail() != null && !client.getEmail().isBlank() && mailConfigured) {
            try {
                sendEmail(client.getEmail(), clientName, consultantName, startFormatted, typeName);
            } catch (Exception e) {
                log.warn("Failed to send reminder email to {}: {}", client.getEmail(), e.getMessage());
            }
        }

        if (client.getPhone() != null && !client.getPhone().isBlank() && smsConfigured) {
            try {
                Long companyId = booking.getCompany() != null ? booking.getCompany().getId() : null;
                sendSms(client.getPhone(), clientName, consultantName, startFormatted, typeName, companyId);
            } catch (Exception e) {
                log.warn("Failed to send reminder SMS to {}: {}", client.getPhone(), e.getMessage());
            }
        } else if (client.getPhone() != null && !client.getPhone().isBlank() && !smsConfigured) {
            log.warn("SMS reminder skipped: Infobip not configured (set INFOBIP_BASE_URL, INFOBIP_API_KEY, INFOBIP_SENDER)");
        }
    }

    /** Sends booking confirmation email to the client when a session is booked. */
    public void sendBookingConfirmation(SessionBooking booking) {
        Client client = booking.getClient();
        if (client == null || client.isAnonymized()) return;
        if (client.getEmail() == null || client.getEmail().isBlank() || !mailConfigured) return;

        User consultant = booking.getConsultant();
        String clientName = (client.getFirstName() + " " + client.getLastName()).trim();
        String consultantName = consultant == null
                ? "Unassigned"
                : (consultant.getFirstName() + " " + consultant.getLastName()).trim();
        String startFormatted = booking.getStartTime().format(DATE_TIME_FORMAT);
        String endFormatted = booking.getEndTime().format(DateTimeFormatter.ofPattern("HH:mm"));
        String typeName = booking.getType() != null ? booking.getType().getName() : "Session";
        String spaceName = booking.getSpace() != null ? booking.getSpace().getName() : null;

        try {
            sendBookingConfirmationEmail(client.getEmail(), clientName, consultantName, startFormatted, endFormatted, typeName, spaceName);
        } catch (Exception e) {
            log.warn("Failed to send booking confirmation email to {}: {}", client.getEmail(), e.getMessage());
        }
    }

    private void sendBookingConfirmationEmail(String to, String clientName, String consultantName,
            String startFormatted, String endFormatted, String typeName, String spaceName) throws MessagingException {
        if (mailSender == null) return;
        String subject = "Session booked";
        StringBuilder body = new StringBuilder();
        body.append(String.format("Hello %s,\n\n", clientName));
        body.append("Your session has been booked with the following details:\n\n");
        body.append(String.format("Date & time: %s – %s\n", startFormatted, endFormatted));
        body.append(String.format("Consultant: %s\n", consultantName));
        body.append(String.format("Type: %s\n", typeName));
        if (spaceName != null) {
            body.append(String.format("Location: %s\n", spaceName));
        }
        body.append("\nSee you then!");

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
        helper.setFrom(mailFrom);
        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(body.toString(), false);
        mailSender.send(message);
        log.info("Sent booking confirmation email to {}", to);
    }

    private void sendEmail(String to, String clientName, String consultantName, String startFormatted, String typeName) throws MessagingException {
        if (mailSender == null) return;
        String subject = "Reminder: Your session is in 1 hour";
        String body = String.format("""
            Hello %s,

            This is a reminder that your %s session with %s is scheduled for %s.

            See you soon!
            """, clientName, typeName, consultantName, startFormatted);

        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, StandardCharsets.UTF_8.name());
        helper.setFrom(mailFrom);
        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(body, false);
        mailSender.send(message);
        log.info("Sent reminder email to {}", to);
    }

    private void sendSms(String to, String clientName, String consultantName, String startFormatted, String typeName, Long companyId) {
        String body = String.format("Reminder: Your %s session with %s is at %s. See you soon!", typeName, consultantName, startFormatted);
        if (body.length() > 160) {
            body = String.format("Reminder: Your session with %s is at %s.", consultantName, startFormatted);
        }

        String toNormalized = to != null ? to.replaceAll("\\s+", "").replaceAll("^\\+", "") : "";
        if (toNormalized.isBlank()) return;

        String url = infobipBaseUrl + "/sms/3/messages";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "App " + infobipApiKey);
        headers.set("Accept", "application/json");

        Map<String, Object> message = Map.of(
                "destinations", List.of(Map.of("to", toNormalized)),
                "sender", infobipSender,
                "content", Map.of("text", body)
        );
        Map<String, Object> payload = Map.of("messages", List.of(message));

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
        ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
        if (response.getStatusCode().is2xxSuccessful()) {
            log.info("Sent reminder SMS to {}", toNormalized);
            if (companyId != null) {
                incrementTenantSmsSentCount(companyId);
            }
        } else {
            throw new RuntimeException("Infobip API returned " + response.getStatusCode());
        }
    }

    private void incrementTenantSmsSentCount(Long companyId) {
        try {
            Company company = companies.findById(companyId).orElse(null);
            if (company == null) {
                return;
            }
            AppSetting s = appSettings.findByCompanyIdAndKey(companyId, SettingKey.TENANCY_SMS_SENT_COUNT).orElseGet(() -> {
                AppSetting ns = new AppSetting();
                ns.setCompany(company);
                ns.setKey(SettingKey.TENANCY_SMS_SENT_COUNT.name());
                ns.setValue("0");
                return appSettings.save(ns);
            });
            String raw = s.getValue() == null ? "0" : s.getValue().trim();
            int n = Integer.parseInt(raw.isEmpty() ? "0" : raw);
            s.setValue(String.valueOf(n + 1));
            appSettings.save(s);
        } catch (Exception e) {
            log.warn("Failed to increment SMS sent count for company {}: {}", companyId, e.getMessage());
        }
    }

    public boolean isMailConfigured() {
        return mailConfigured;
    }

    public boolean isSmsConfigured() {
        return smsConfigured;
    }
}
