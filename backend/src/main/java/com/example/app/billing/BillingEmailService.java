package com.example.app.billing;

import com.example.app.client.Client;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.delivery.MessageDeliveryChannel;
import com.example.app.delivery.MessageDeliveryLogService;
import com.example.app.email.TenantEmailSenderResolver;
import com.example.app.logging.LogSanitizer;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class BillingEmailService {
    private static final Logger log = LoggerFactory.getLogger(BillingEmailService.class);
    private static final String PLATFORM_SUBSCRIPTION_REFERENCE_PREFIX = "CALENDRA-SUBSCRIPTION:";
    private static final String CALENDRA_TEAM_SENDER_NAME = "Calendra ekipa";
    private static final String DEFAULT_INVOICE_SUBJECT = "Invoice {{invoiceNumber}} from {{companyName}}";
    private static final String DEFAULT_INVOICE_BODY = """
            Hello {{guestName}},

            your invoice {{invoiceNumber}} dated {{invoiceDate}} is attached.
            Amount due: {{amount}}
            Due date: {{dueDate}}

            Thank you,
            {{companyName}}
            """;
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    private final JavaMailSender mailSender;
    private final AppSettingRepository appSettingRepository;
    private final ClientCompanyRepository clientCompanyRepository;
    private final String mailFrom;
    private final String fallbackFrom;
    private final boolean mailConfigured;
    private final TenantEmailSenderResolver emailSenderResolver;

    @Autowired(required = false)
    private MessageDeliveryLogService deliveryLogs;

    public BillingEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            AppSettingRepository appSettingRepository,
            ClientCompanyRepository clientCompanyRepository,
            @Autowired(required = false) TenantEmailSenderResolver emailSenderResolver,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername
    ) {
        this.mailSender = mailSender;
        this.appSettingRepository = appSettingRepository;
        this.clientCompanyRepository = clientCompanyRepository;
        this.mailFrom = mailFrom == null ? "" : mailFrom.trim();
        this.fallbackFrom = mailUsername == null ? "" : mailUsername.trim();
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.emailSenderResolver = emailSenderResolver;
    }

    public void sendCheckoutLink(Bill bill, String checkoutUrl) {
        sendPaymentLink(
                bill,
                checkoutUrl,
                "Payment link for bill " + bill.getBillNumber(),
                """
                        Hello,

                        your therapy bill %s is ready for card payment.

                        Please complete payment here:
                        %s

                        Thank you.
                        """.formatted(bill.getBillNumber(), checkoutUrl),
                "Stripe checkout"
        );
    }

    public void sendBankTransferInvoiceLink(Bill bill, String hostedInvoiceUrl) {
        if (!isInvoiceDeliveryEnabled(bill)) {
            log.info("Bank transfer invoice link not emailed for bill {}: invoice delivery is disabled", bill.getId());
            return;
        }
        sendPaymentLink(
                bill,
                hostedInvoiceUrl,
                "Bank transfer instructions for bill " + bill.getBillNumber(),
                """
                        Hello,

                        your therapy bill %s is ready for payment by bank transfer.

                        Open the hosted invoice here:
                        %s

                        The invoice page contains the Stripe bank transfer instructions.

                        Thank you.
                        """.formatted(bill.getBillNumber(), hostedInvoiceUrl),
                "Stripe bank transfer invoice"
        );
    }

    public void sendBankTransferFolio(Bill bill, byte[] pdfBytes) {
        if (!isInvoiceDeliveryEnabled(bill)) {
            log.info("Bank transfer folio not emailed for bill {}: invoice delivery is disabled", bill.getId());
            logBillEmailSkipped(bill, "BANK_TRANSFER_FOLIO", null, "Bank transfer folio", "Invoice delivery is disabled");
            return;
        }
        String recipient = resolveRecipientEmail(bill);
        if (recipient == null || recipient.isBlank()) {
            log.warn("Bank transfer folio not emailed for bill {}: missing recipient email", bill.getId());
            logBillEmailSkipped(bill, "BANK_TRANSFER_FOLIO", null, "Bank transfer folio", "Missing recipient email");
            return;
        }
        if (!mailConfigured) {
            log.warn("Bank transfer folio not emailed for bill {}: mail is not configured", bill.getId());
            logBillEmailSkipped(bill, "BANK_TRANSFER_FOLIO", recipient, "Bank transfer folio", "Mail is not configured");
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            applyClientSender(helper, bill);
            helper.setTo(recipient);
            String subject = resolveInvoiceDeliverySubject(bill);
            String body = resolveInvoiceDeliveryBody(bill);
            helper.setSubject(subject);
            helper.setText(body, looksLikeHtml(body));
            helper.addAttachment("folio-" + bill.getBillNumber() + ".pdf", new ByteArrayResource(pdfBytes), "application/pdf");
            mailSender.send(message);
            logBillEmailSent(bill, "BANK_TRANSFER_FOLIO", recipient, subject, body);
            log.info("Bank transfer folio emailed billId={} companyId={} clientId={} recipient={}", bill.getId(), billCompanyId(bill), billClientId(bill), LogSanitizer.emailHash(recipient));
        } catch (Exception ex) {
            logBillEmailFailed(bill, "BANK_TRANSFER_FOLIO", recipient, "Bank transfer folio", ex.getMessage());
            log.warn("Failed to send bank transfer folio for bill {}: {}", bill.getId(), ex.getMessage());
        }
    }


    public void sendInvoiceFolio(Bill bill, byte[] pdfBytes) {
        if (!isInvoiceDeliveryEnabled(bill)) {
            log.info("Invoice folio not emailed for bill {}: invoice delivery is disabled", bill.getId());
            logBillEmailSkipped(bill, "INVOICE_FOLIO", null, "Invoice folio", "Invoice delivery is disabled");
            return;
        }
        String recipient = resolveRecipientEmail(bill);
        if (recipient == null || recipient.isBlank()) {
            log.warn("Invoice folio not emailed for bill {}: missing recipient email", bill.getId());
            logBillEmailSkipped(bill, "INVOICE_FOLIO", null, "Invoice folio", "Missing recipient email");
            return;
        }
        if (!mailConfigured) {
            log.warn("Invoice folio not emailed for bill {}: mail is not configured", bill.getId());
            logBillEmailSkipped(bill, "INVOICE_FOLIO", recipient, "Invoice folio", "Mail is not configured");
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            applyClientSender(helper, bill);
            helper.setTo(recipient);
            String subject = resolveInvoiceDeliverySubject(bill);
            String body = resolveInvoiceDeliveryBody(bill);
            helper.setSubject(subject);
            helper.setText(body, looksLikeHtml(body));
            helper.addAttachment("folio-" + bill.getBillNumber() + ".pdf", new ByteArrayResource(pdfBytes), "application/pdf");
            mailSender.send(message);
            logBillEmailSent(bill, "INVOICE_FOLIO", recipient, subject, body);
            log.info("Invoice folio emailed billId={} companyId={} clientId={} recipient={}", bill.getId(), billCompanyId(bill), billClientId(bill), LogSanitizer.emailHash(recipient));
        } catch (Exception ex) {
            logBillEmailFailed(bill, "INVOICE_FOLIO", recipient, "Invoice folio", ex.getMessage());
            log.warn("Failed to send invoice folio for bill {}: {}", bill.getId(), ex.getMessage());
        }
    }

    public String sendOpenBillPreviewFolio(Bill bill, byte[] pdfBytes, String locale) {
        if (!isInvoiceDeliveryEnabled(bill)) {
            throw new IllegalStateException("Invoice email delivery is disabled.");
        }
        String recipient = resolveRecipientEmail(bill);
        if (recipient == null || recipient.isBlank()) {
            return null;
        }
        if (!mailConfigured) {
            throw new IllegalStateException("Mail is not configured.");
        }
        boolean slovenian = locale != null && locale.toLowerCase(Locale.ROOT).startsWith("sl");
        String docLabel = slovenian ? "Predračun" : "Proforma invoice";
        String companyName = resolveCompanyName(bill);
        String subject = docLabel + " " + safeBillNumber(bill) + " - " + companyName;
        String guestName = resolveGuestName(bill);
        String body = slovenian
                ? "Pozdravljeni" + (guestName.isBlank() ? "" : " " + guestName) + ",\n\n" +
                  "v priponki vam pošiljamo predračun " + safeBillNumber(bill) + ".\n" +
                  "Znesek za plačilo: " + fmtAmount(bill.getTotalGross()) + "\n\n" +
                  "Lep pozdrav,\n" + companyName
                : "Hello" + (guestName.isBlank() ? "" : " " + guestName) + ",\n\n" +
                  "your proforma invoice " + safeBillNumber(bill) + " is attached.\n" +
                  "Amount due: " + fmtAmount(bill.getTotalGross()) + "\n\n" +
                  "Thank you,\n" + companyName;
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            applyClientSender(helper, bill);
            helper.setTo(recipient);
            helper.setSubject(subject);
            helper.setText(body, false);
            String filenamePrefix = slovenian ? "predracun-" : "proforma-";
            helper.addAttachment(filenamePrefix + safeBillNumber(bill) + ".pdf", new ByteArrayResource(pdfBytes), "application/pdf");
            mailSender.send(message);
            logBillEmailSent(bill, "OPEN_BILL_PREVIEW_FOLIO", recipient, subject, body);
            log.info("Open-bill preview folio emailed billId={} companyId={} clientId={} recipient={}", bill.getId(), billCompanyId(bill), billClientId(bill), LogSanitizer.emailHash(recipient));
            return recipient;
        } catch (Exception ex) {
            logBillEmailFailed(bill, "OPEN_BILL_PREVIEW_FOLIO", recipient, subject, ex.getMessage());
            log.warn("Failed to send open-bill preview folio for bill {}: {}", bill.getId(), ex.getMessage());
            throw new IllegalStateException("Failed to send preview email.", ex);
        }
    }


    private void sendPaymentLink(Bill bill, String url, String subject, String body, String logLabel) {
        String recipient = resolveRecipientEmail(bill);
        if (recipient == null || recipient.isBlank()) {
            log.warn("{} URL not emailed for bill {}: missing recipient email", logLabel, bill.getId());
            logBillEmailSkipped(bill, normalizeMessageType(logLabel), null, subject, "Missing recipient email");
            return;
        }
        if (!mailConfigured) {
            log.warn("{} URL not emailed for bill {}: mail is not configured", logLabel, bill.getId());
            logBillEmailSkipped(bill, normalizeMessageType(logLabel), recipient, subject, "Mail is not configured");
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            applyClientSender(helper, bill);
            helper.setTo(recipient);
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
            logBillEmailSent(bill, normalizeMessageType(logLabel), recipient, subject, body);
            log.info("{} emailed billId={} companyId={} clientId={} recipient={}", logLabel, bill.getId(), billCompanyId(bill), billClientId(bill), LogSanitizer.emailHash(recipient));
        } catch (Exception ex) {
            logBillEmailFailed(bill, normalizeMessageType(logLabel), recipient, subject, ex.getMessage());
            log.warn("Failed to send {} email for bill {}: {}", logLabel, bill.getId(), ex.getMessage());
        }
    }

    public void sendPaidBillReceipt(Bill bill, byte[] pdfBytes) {
        if (!isInvoiceDeliveryEnabled(bill)) {
            log.info("Paid bill receipt not emailed for bill {}: invoice delivery is disabled", bill.getId());
            logBillEmailSkipped(bill, "PAID_BILL_RECEIPT", null, "Paid bill receipt", "Invoice delivery is disabled");
            return;
        }
        String recipient = resolveRecipientEmail(bill);
        if (recipient == null || recipient.isBlank()) {
            log.warn("Paid bill receipt not emailed for bill {}: missing recipient email", bill.getId());
            logBillEmailSkipped(bill, "PAID_BILL_RECEIPT", null, "Paid bill receipt", "Missing recipient email");
            return;
        }
        if (!mailConfigured) {
            log.warn("Paid bill receipt not emailed for bill {}: mail is not configured", bill.getId());
            logBillEmailSkipped(bill, "PAID_BILL_RECEIPT", recipient, "Paid bill receipt", "Mail is not configured");
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            applyClientSender(helper, bill);
            helper.setTo(recipient);
            String subject = resolveInvoiceDeliverySubject(bill);
            String body = resolveInvoiceDeliveryBody(bill);
            helper.setSubject(subject);
            helper.setText(body, looksLikeHtml(body));
            helper.addAttachment(bill.getBillNumber() + ".pdf", new ByteArrayResource(pdfBytes), "application/pdf");
            mailSender.send(message);
            logBillEmailSent(bill, "PAID_BILL_RECEIPT", recipient, subject, body);
            log.info("Paid bill receipt emailed billId={} companyId={} clientId={} recipient={}", bill.getId(), billCompanyId(bill), billClientId(bill), LogSanitizer.emailHash(recipient));
        } catch (Exception ex) {
            logBillEmailFailed(bill, "PAID_BILL_RECEIPT", recipient, "Paid bill receipt", ex.getMessage());
            log.warn("Failed to send paid bill receipt for bill {}: {}", bill.getId(), ex.getMessage());
        }
    }



    private Long billCompanyId(Bill bill) {
        return bill == null || bill.getCompany() == null ? null : bill.getCompany().getId();
    }

    private Long billClientId(Bill bill) {
        return bill == null || bill.getClient() == null ? null : bill.getClient().getId();
    }

    private void logBillEmailSent(Bill bill, String messageType, String recipient, String subject, String preview) {
        if (deliveryLogs == null || bill == null) return;
        deliveryLogs.sent(
                bill.getCompany(),
                bill.getClient(),
                null,
                MessageDeliveryChannel.EMAIL,
                messageType,
                recipient,
                subject,
                preview,
                "bill",
                bill.getId()
        );
    }

    private void logBillEmailFailed(Bill bill, String messageType, String recipient, String subject, String reason) {
        if (deliveryLogs == null || bill == null) return;
        deliveryLogs.failed(
                bill.getCompany(),
                bill.getClient(),
                null,
                MessageDeliveryChannel.EMAIL,
                messageType,
                recipient,
                subject,
                null,
                "bill",
                bill.getId(),
                reason
        );
    }

    private void logBillEmailSkipped(Bill bill, String messageType, String recipient, String subject, String reason) {
        if (deliveryLogs == null || bill == null) return;
        deliveryLogs.skipped(
                bill.getCompany(),
                bill.getClient(),
                null,
                MessageDeliveryChannel.EMAIL,
                messageType,
                recipient,
                subject,
                null,
                "bill",
                bill.getId(),
                reason
        );
    }

    private static String normalizeMessageType(String label) {
        if (label == null || label.isBlank()) return "BILLING_EMAIL";
        return label.trim().toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z0-9]+", "_").replaceAll("^_+|_+$", "");
    }

    private String resolveCompanyName(Bill bill) {
        Long companyId = bill != null && bill.getCompany() != null ? bill.getCompany().getId() : null;
        String configured = settingValue(companyId, SettingKey.COMPANY_NAME);
        if (configured != null && !configured.isBlank()) return configured.trim();
        return bill != null && bill.getCompany() != null && bill.getCompany().getName() != null
                ? bill.getCompany().getName()
                : "Calendra";
    }

    private String resolveGuestName(Bill bill) {
        if (bill == null) return "";
        String first = bill.getClientFirstNameSnapshot() == null ? "" : bill.getClientFirstNameSnapshot().trim();
        String last = bill.getClientLastNameSnapshot() == null ? "" : bill.getClientLastNameSnapshot().trim();
        String name = (first + " " + last).trim();
        if (!name.isBlank()) return name;
        if (bill.getRecipientCompanyNameSnapshot() != null) return bill.getRecipientCompanyNameSnapshot().trim();
        return "";
    }

    private String safeBillNumber(Bill bill) {
        if (bill == null || bill.getBillNumber() == null || bill.getBillNumber().isBlank()) return "PREVIEW";
        return bill.getBillNumber().trim();
    }

    private String fmtAmount(java.math.BigDecimal amount) {
        java.math.BigDecimal normalized = amount == null ? java.math.BigDecimal.ZERO : amount.setScale(2, java.math.RoundingMode.HALF_UP);
        return normalized.toPlainString() + " EUR";
    }

    private boolean isInvoiceDeliveryEnabled(Bill bill) {
        if (!isGlobalInvoiceDeliveryEnabled(bill)) {
            return false;
        }
        return !isRecipientInvoiceEmailSuppressed(bill);
    }

    private boolean isGlobalInvoiceDeliveryEnabled(Bill bill) {
        Long companyId = bill.getCompany() != null ? bill.getCompany().getId() : null;
        String raw = settingValue(companyId, SettingKey.INVOICE_DELIVERY_EMAIL_ENABLED);
        if (raw == null || raw.isBlank()) return true;
        String normalized = raw.trim().toLowerCase(java.util.Locale.ROOT);
        return !("false".equals(normalized) || "0".equals(normalized) || "off".equals(normalized) || "no".equals(normalized));
    }

    /**
     * Per-recipient override: a client or client company can opt out of invoice emails entirely,
     * suppressing delivery even when the tenant-wide setting is enabled. Read from live entities
     * (not bill snapshots) so toggling the flag also affects resends.
     */
    private boolean isRecipientInvoiceEmailSuppressed(Bill bill) {
        Client client = bill.getClient();
        if (client != null && client.isSuppressInvoiceEmails()) {
            return true;
        }
        Long ownerCompanyId = bill.getCompany() != null ? bill.getCompany().getId() : null;
        Long recipientCompanyId = bill.getRecipientCompanyIdSnapshot();
        if (recipientCompanyId != null && ownerCompanyId != null) {
            ClientCompany company = clientCompanyRepository
                    .findByIdAndOwnerCompanyId(recipientCompanyId, ownerCompanyId)
                    .orElse(null);
            if (company != null && company.isSuppressInvoiceEmails()) {
                return true;
            }
        } else if (client != null && client.getBillingCompany() != null
                && client.getBillingCompany().isSuppressInvoiceEmails()) {
            return true;
        }
        return false;
    }

    private String resolveRecipientEmail(Bill bill) {
        if (bill.getRecipientPersonEmailSnapshot() != null && !bill.getRecipientPersonEmailSnapshot().isBlank()) {
            return bill.getRecipientPersonEmailSnapshot().trim();
        }
        Client client = bill.getClient();
        if (client != null && client.getEmail() != null && !client.getEmail().isBlank()) {
            return client.getEmail().trim();
        }
        if (bill.getRecipientCompanyEmailSnapshot() != null && !bill.getRecipientCompanyEmailSnapshot().isBlank()) {
            return bill.getRecipientCompanyEmailSnapshot().trim();
        }
        return null;
    }

    private void applyClientSender(MimeMessageHelper helper, Bill bill) throws Exception {
        if (isPlatformSubscriptionBill(bill)) {
            InternetAddress configuredFrom = new InternetAddress(resolveFromAddress());
            helper.setFrom(configuredFrom.getAddress(), CALENDRA_TEAM_SENDER_NAME);
            if (emailSenderResolver != null) {
                emailSenderResolver.applyReplyTo(
                        helper,
                        bill.getCompany(),
                        TenantEmailSenderResolver.EmailPurpose.CLIENT_NOTIFICATION
                );
            }
            return;
        }
        if (emailSenderResolver != null) {
            emailSenderResolver.applyFrom(helper, bill == null ? null : bill.getCompany(), TenantEmailSenderResolver.EmailPurpose.CLIENT_NOTIFICATION);
            emailSenderResolver.applyReplyTo(helper, bill == null ? null : bill.getCompany(), TenantEmailSenderResolver.EmailPurpose.CLIENT_NOTIFICATION);
            return;
        }
        helper.setFrom(resolveFromAddress());
    }

    private boolean isPlatformSubscriptionBill(Bill bill) {
        if (bill == null) return false;
        String reference = bill.getBankTransferReference();
        return reference != null
                && reference.trim().startsWith(PLATFORM_SUBSCRIPTION_REFERENCE_PREFIX);
    }

    private String resolveFromAddress() {
        if (!mailFrom.isBlank()) return mailFrom;
        if (!fallbackFrom.isBlank()) return fallbackFrom;
        return "noreply@localhost";
    }

    private String resolveInvoiceDeliverySubject(Bill bill) {
        Long companyId = bill.getCompany() != null ? bill.getCompany().getId() : null;
        String template = settingValue(companyId, SettingKey.INVOICE_DELIVERY_EMAIL_SUBJECT);
        if (template == null || template.isBlank()) {
            template = DEFAULT_INVOICE_SUBJECT;
        }
        return applyInvoiceTokens(template, bill);
    }

    private String resolveInvoiceDeliveryBody(Bill bill) {
        Long companyId = bill.getCompany() != null ? bill.getCompany().getId() : null;
        String template = settingValue(companyId, SettingKey.INVOICE_DELIVERY_EMAIL_BODY);
        if (template == null || template.isBlank()) {
            template = DEFAULT_INVOICE_BODY;
        }
        return applyInvoiceTokens(template, bill);
    }

    private String applyInvoiceTokens(String template, Bill bill) {
        String text = template == null ? "" : template;
        String guestName = ((bill.getClientFirstNameSnapshot() == null ? "" : bill.getClientFirstNameSnapshot()) + " "
                + (bill.getClientLastNameSnapshot() == null ? "" : bill.getClientLastNameSnapshot())).trim();
        if (guestName.isBlank()) {
            guestName = "Guest";
        }
        String companyName = bill.getCompany() != null && bill.getCompany().getName() != null
                ? bill.getCompany().getName().trim()
                : "";
        if (companyName.isBlank()) {
            companyName = "Company";
        }
        LocalDate issueDate = bill.getIssueDate();
        String invoiceDate = issueDate == null ? "" : issueDate.format(DATE_FORMAT);
        LocalDate dueDate = issueDate == null ? null : issueDate.plusDays(resolvePaymentDeadlineDays(bill));
        String dueDateLabel = dueDate == null ? "" : dueDate.format(DATE_FORMAT);
        String amount = bill.getTotalGross() == null ? "EUR 0.00" : "EUR " + bill.getTotalGross().setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
        Long companyId = bill.getCompany() != null ? bill.getCompany().getId() : null;
        PhysicalAddress physicalAddress = resolvePhysicalAddress(companyId);

        Map<String, String> tokens = new LinkedHashMap<>();
        tokens.put("{{guestName}}", guestName);
        tokens.put("{{invoiceNumber}}", bill.getBillNumber() == null ? "" : bill.getBillNumber());
        tokens.put("{{invoiceDate}}", invoiceDate);
        tokens.put("{{dueDate}}", dueDateLabel);
        tokens.put("{{amount}}", amount);
        tokens.put("{{companyName}}", companyName);
        tokens.put("{{companyEmail}}", defaultString(settingValue(companyId, SettingKey.COMPANY_EMAIL)));
        tokens.put("{{companyPhone}}", defaultString(settingValue(companyId, SettingKey.COMPANY_TELEPHONE)));
        tokens.put("{{physicalAddress}}", physicalAddress.address());
        tokens.put("{{physicalPostalCode}}", physicalAddress.postalCode());
        tokens.put("{{physicalCity}}", physicalAddress.city());
        tokens.put("{{physicalCountry}}", physicalAddress.country());
        tokens.put("{{physicalFullAddress}}", physicalAddress.fullAddress());
        tokens.put("{{companyPhysicalAddress}}", physicalAddress.fullAddress());

        for (Map.Entry<String, String> entry : tokens.entrySet()) {
            text = text.replace(entry.getKey(), entry.getValue() == null ? "" : entry.getValue());
        }
        return text;
    }

    private String settingValue(Long companyId, SettingKey key) {
        if (companyId == null) return null;
        return appSettingRepository.findByCompanyIdAndKey(companyId, key)
                .map(setting -> setting.getValue() == null ? null : setting.getValue().trim())
                .orElse(null);
    }

    private PhysicalAddress resolvePhysicalAddress(Long companyId) {
        if (companyId == null) {
            return new PhysicalAddress("", "", "", "");
        }
        boolean sameAsCompany = "true".equalsIgnoreCase(defaultString(settingValue(companyId, SettingKey.COMPANY_PHYSICAL_ADDRESS_SAME_AS_COMPANY)));
        String address = sameAsCompany
                ? settingValue(companyId, SettingKey.COMPANY_ADDRESS)
                : firstNonBlank(settingValue(companyId, SettingKey.COMPANY_PHYSICAL_ADDRESS), settingValue(companyId, SettingKey.COMPANY_ADDRESS));
        String postalCode = sameAsCompany
                ? settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE)
                : firstNonBlank(settingValue(companyId, SettingKey.COMPANY_PHYSICAL_POSTAL_CODE), settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE));
        String city = sameAsCompany
                ? settingValue(companyId, SettingKey.COMPANY_CITY)
                : firstNonBlank(settingValue(companyId, SettingKey.COMPANY_PHYSICAL_CITY), settingValue(companyId, SettingKey.COMPANY_CITY));
        String country = settingValue(companyId, SettingKey.COMPANY_PHYSICAL_COUNTRY);
        return new PhysicalAddress(defaultString(address), defaultString(postalCode), defaultString(city), defaultString(country));
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String defaultString(String value) {
        return value == null ? "" : value.trim();
    }

    private record PhysicalAddress(String address, String postalCode, String city, String country) {
        String fullAddress() {
            StringBuilder sb = new StringBuilder();
            if (address != null && !address.isBlank()) {
                sb.append(address.trim());
            }
            if ((postalCode != null && !postalCode.isBlank()) || (city != null && !city.isBlank())) {
                if (sb.length() > 0) sb.append(", ");
                if (postalCode != null && !postalCode.isBlank()) sb.append(postalCode.trim());
                if ((postalCode != null && !postalCode.isBlank()) && (city != null && !city.isBlank())) sb.append(" ");
                if (city != null && !city.isBlank()) sb.append(city.trim());
            }
            if (country != null && !country.isBlank()) {
                if (sb.length() > 0) sb.append(", ");
                sb.append(country.trim());
            }
            return sb.toString();
        }
    }

    private int resolvePaymentDeadlineDays(Bill bill) {
        Long companyId = bill.getCompany() != null ? bill.getCompany().getId() : null;
        String raw = settingValue(companyId, SettingKey.PAYMENT_DEADLINE_DAYS);
        try {
            int parsed = Integer.parseInt(raw == null || raw.isBlank() ? "15" : raw);
            return Math.max(parsed, 0);
        } catch (Exception ignored) {
            return 15;
        }
    }

    private boolean looksLikeHtml(String value) {
        if (value == null || value.isBlank()) return false;
        return value.contains("<") && value.contains(">");
    }
}
