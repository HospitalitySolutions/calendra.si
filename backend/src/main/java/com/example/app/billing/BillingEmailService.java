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
import jakarta.mail.MessagingException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.math.BigDecimal;
import java.math.RoundingMode;
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
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class BillingEmailService {
    private static final Logger log = LoggerFactory.getLogger(BillingEmailService.class);
    private static final String PLATFORM_SUBSCRIPTION_REFERENCE_PREFIX = "CALENDRA-SUBSCRIPTION:";
    private static final String CALENDRA_TEAM_SENDER_NAME = "Calendra ekipa";
    private static final String CALENDRA_LOGO_CID = "calendraLogo";
    private static final String CALENDRA_LOGO_CLASSPATH = "static/widget/calendra-transparent-logo.png";
    private static final String PLATFORM_ICON_CLASSPATH = "static/email/platform-invoice-icons/";
    private static final String PLATFORM_RECEIPT_ICON_CID = "platformInvoiceReceiptIcon";
    private static final String PLATFORM_DOCUMENT_ICON_CID = "platformInvoiceDocumentIcon";
    private static final String PLATFORM_BUILDING_ICON_CID = "platformInvoiceBuildingIcon";
    private static final String PLATFORM_PACKAGE_ICON_CID = "platformInvoicePackageIcon";
    private static final String PLATFORM_PERIOD_ICON_CID = "platformInvoicePeriodIcon";
    private static final String PLATFORM_DATE_ICON_CID = "platformInvoiceDateIcon";
    private static final String PLATFORM_CLOCK_ICON_CID = "platformInvoiceClockIcon";
    private static final String PLATFORM_WALLET_ICON_CID = "platformInvoiceWalletIcon";
    private static final String PLATFORM_BANK_ICON_CID = "platformInvoiceBankIcon";
    private static final String PLATFORM_DOWNLOAD_ICON_CID = "platformInvoiceDownloadIcon";
    private static final String PLATFORM_FOLDER_ICON_CID = "platformInvoiceFolderIcon";
    private static final String PLATFORM_PAPERCLIP_ICON_CID = "platformInvoicePaperclipIcon";
    private static final String PLATFORM_INFO_ICON_CID = "platformInvoiceInfoIcon";
    private static final String PLATFORM_INVOICE_SUBJECT = "Račun %s za naročnino Calendra";
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
    private final String frontendBaseUrl;

    @Autowired(required = false)
    private MessageDeliveryLogService deliveryLogs;

    public BillingEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            AppSettingRepository appSettingRepository,
            ClientCompanyRepository clientCompanyRepository,
            @Autowired(required = false) TenantEmailSenderResolver emailSenderResolver,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername,
            @Value("${app.auth.frontend-url:${app.public-base-url:https://app.calendra.si}}") String frontendBaseUrl
    ) {
        this.mailSender = mailSender;
        this.appSettingRepository = appSettingRepository;
        this.clientCompanyRepository = clientCompanyRepository;
        this.mailFrom = mailFrom == null ? "" : mailFrom.trim();
        this.fallbackFrom = mailUsername == null ? "" : mailUsername.trim();
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
        this.emailSenderResolver = emailSenderResolver;
        this.frontendBaseUrl = normalizeBaseUrl(frontendBaseUrl);
    }

    public void sendCheckoutLink(Bill bill, String checkoutUrl) {
        if (isPlatformSubscriptionBill(bill)) {
            sendPlatformSubscriptionEmail(
                    bill,
                    null,
                    checkoutUrl,
                    "Plačaj račun",
                    "PLATFORM_SUBSCRIPTION_PAYMENT_LINK",
                    false
            );
            return;
        }
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
        if (isPlatformSubscriptionBill(bill)) {
            sendPlatformSubscriptionEmail(
                    bill,
                    null,
                    hostedInvoiceUrl,
                    "Odpri navodila za plačilo",
                    "PLATFORM_SUBSCRIPTION_BANK_TRANSFER_LINK",
                    false
            );
            return;
        }
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
        if (isPlatformSubscriptionBill(bill)) {
            sendPlatformSubscriptionEmail(
                    bill,
                    pdfBytes,
                    platformInvoicePdfUrl(bill),
                    "Prenesi račun (PDF)",
                    "PLATFORM_SUBSCRIPTION_INVOICE",
                    false
            );
            return;
        }
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
        if (isPlatformSubscriptionBill(bill)) {
            sendPlatformSubscriptionEmail(
                    bill,
                    pdfBytes,
                    platformInvoicePdfUrl(bill),
                    "Prenesi račun (PDF)",
                    "PLATFORM_SUBSCRIPTION_INVOICE",
                    false
            );
            return;
        }
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



    private void sendPlatformSubscriptionEmail(
            Bill bill,
            byte[] pdfBytes,
            String primaryUrl,
            String primaryLabel,
            String messageType,
            boolean paid
    ) {
        if (!isInvoiceDeliveryEnabled(bill)) {
            log.info("Platform subscription email not sent for bill {}: recipient delivery is suppressed", bill == null ? null : bill.getId());
            logBillEmailSkipped(bill, messageType, null, "Platform subscription invoice", "Recipient delivery is suppressed");
            return;
        }
        String recipient = resolveRecipientEmail(bill);
        if (recipient == null || recipient.isBlank()) {
            log.warn("Platform subscription email not sent for bill {}: missing recipient email", bill == null ? null : bill.getId());
            logBillEmailSkipped(bill, messageType, null, "Platform subscription invoice", "Missing recipient email");
            return;
        }
        if (!mailConfigured) {
            log.warn("Platform subscription email not sent for bill {}: mail is not configured", bill == null ? null : bill.getId());
            logBillEmailSkipped(bill, messageType, recipient, "Platform subscription invoice", "Mail is not configured");
            return;
        }

        String subject = PLATFORM_INVOICE_SUBJECT.formatted(safeBillNumber(bill));
        PlatformInvoiceEmailData data = platformInvoiceEmailData(bill, primaryUrl, primaryLabel, pdfBytes != null, paid);
        String body = renderPlatformInvoiceHtml(data);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            applyClientSender(helper, bill);
            helper.setTo(recipient);
            helper.setSubject(subject);
            helper.setText(body, true);
            helper.addInline(CALENDRA_LOGO_CID, new ClassPathResource(CALENDRA_LOGO_CLASSPATH), "image/png");
            addPlatformInvoiceInlineAssets(helper);
            if (pdfBytes != null && pdfBytes.length > 0) {
                helper.addAttachment(
                        "racun-" + safeFileName(safeBillNumber(bill)) + ".pdf",
                        new ByteArrayResource(pdfBytes),
                        "application/pdf"
                );
            }
            mailSender.send(message);
            logBillEmailSent(bill, messageType, recipient, subject, stripHtmlForLog(body));
            log.info("Platform subscription invoice email sent billId={} companyId={} clientId={} recipient={}",
                    bill.getId(), billCompanyId(bill), billClientId(bill), LogSanitizer.emailHash(recipient));
        } catch (Exception ex) {
            logBillEmailFailed(bill, messageType, recipient, subject, ex.getMessage());
            log.warn("Failed to send platform subscription invoice email for bill {}: {}", bill == null ? null : bill.getId(), ex.getMessage());
        }
    }

    private void addPlatformInvoiceInlineAssets(MimeMessageHelper helper) throws MessagingException {
        addPlatformInvoiceIcon(helper, PLATFORM_RECEIPT_ICON_CID, "receipt.png");
        addPlatformInvoiceIcon(helper, PLATFORM_DOCUMENT_ICON_CID, "document.png");
        addPlatformInvoiceIcon(helper, PLATFORM_BUILDING_ICON_CID, "building.png");
        addPlatformInvoiceIcon(helper, PLATFORM_PACKAGE_ICON_CID, "package.png");
        addPlatformInvoiceIcon(helper, PLATFORM_PERIOD_ICON_CID, "calendar-range.png");
        addPlatformInvoiceIcon(helper, PLATFORM_DATE_ICON_CID, "calendar-date.png");
        addPlatformInvoiceIcon(helper, PLATFORM_CLOCK_ICON_CID, "clock.png");
        addPlatformInvoiceIcon(helper, PLATFORM_WALLET_ICON_CID, "wallet.png");
        addPlatformInvoiceIcon(helper, PLATFORM_BANK_ICON_CID, "bank.png");
        addPlatformInvoiceIcon(helper, PLATFORM_DOWNLOAD_ICON_CID, "download-white.png");
        addPlatformInvoiceIcon(helper, PLATFORM_FOLDER_ICON_CID, "folder.png");
        addPlatformInvoiceIcon(helper, PLATFORM_PAPERCLIP_ICON_CID, "paperclip.png");
        addPlatformInvoiceIcon(helper, PLATFORM_INFO_ICON_CID, "info.png");
    }

    private void addPlatformInvoiceIcon(MimeMessageHelper helper, String contentId, String fileName) throws MessagingException {
        helper.addInline(contentId, new ClassPathResource(PLATFORM_ICON_CLASSPATH + fileName), "image/png");
    }

    private PlatformInvoiceEmailData platformInvoiceEmailData(
            Bill bill,
            String primaryUrl,
            String primaryLabel,
            boolean pdfAttached,
            boolean paid
    ) {
        Long tenantId = platformSubscriptionTenantId(bill);
        LocalDate issueDate = bill == null ? null : bill.getIssueDate();
        LocalDate dueDate = issueDate == null ? null : issueDate.plusDays(resolvePaymentDeadlineDays(bill));
        String issuerName = resolveCompanyName(bill);
        String supportEmail = firstNonBlank(
                settingValue(billCompanyId(bill), SettingKey.COMPANY_EMAIL),
                "info@calendra.si"
        );
        String invoicesUrl = platformReceivedInvoicesUrl();
        String safePrimaryUrl = firstNonBlank(primaryUrl, invoicesUrl);
        String safePrimaryLabel = firstNonBlank(primaryLabel, "Odpri prejete račune");
        String paymentStatus = paid ? "Plačano" : "V plačilo";
        String heading = paid ? "Plačilo računa je potrjeno" : "Vaš račun je pripravljen";
        String badge = paid ? "Plačano" : "Račun";
        String intro = paid
                ? "Plačilo vašega računa za naročnino na platformo Calendra je bilo uspešno potrjeno."
                : "Vaš račun za naročnino na platformo Calendra je bil izdan z glavnega računa platforme, ki stoji za storitvijo Calendra.";
        String attachmentNote = pdfAttached
                ? "Račun v PDF obliki je priložen temu e-poštnemu sporočilu."
                : "Račun in stanje plačila lahko kadar koli preverite med prejetimi računi v aplikaciji Calendra.";

        return new PlatformInvoiceEmailData(
                firstNonBlank(resolveRecipientFirstName(bill), "uporabnik"),
                safeBillNumber(bill),
                issuerName,
                resolvePlatformPackageLabel(bill, tenantId),
                resolvePlatformBillingPeriod(bill, tenantId),
                formatSlovenianDate(issueDate),
                formatSlovenianDate(dueDate),
                formatEuro(bill == null ? null : bill.getTotalGross()),
                resolvePaymentMethodLabel(bill),
                paymentStatus,
                heading,
                badge,
                intro,
                attachmentNote,
                safePrimaryUrl,
                safePrimaryLabel,
                invoicesUrl,
                supportEmail
        );
    }

    private String renderPlatformInvoiceHtml(PlatformInvoiceEmailData data) {
        String template = """
                <!doctype html>
                <html lang="sl">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    @media only screen and (max-width: 680px) {
                      .email-shell { width: 100% !important; border-radius: 0 !important; }
                      .email-pad { padding: 26px 20px !important; }
                      .email-title { font-size: 29px !important; line-height: 1.15 !important; }
                      .button-cell { display: block !important; width: 100% !important; padding: 0 0 10px 0 !important; }
                      .email-button { display: block !important; text-align: center !important; }
                      .summary-value { max-width: 230px !important; }
                    }
                  </style>
                </head>
                <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#17233a;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f7fb;">
                    <tr>
                      <td align="center" style="padding:32px 12px;">
                        <table role="presentation" class="email-shell" width="680" cellspacing="0" cellpadding="0" border="0" style="width:680px;max-width:680px;background:#ffffff;border:1px solid #dce5f1;border-radius:28px;box-shadow:0 18px 50px rgba(34,73,126,0.10);overflow:hidden;">
                          <tr>
                            <td class="email-pad" style="padding:38px 40px 28px 40px;">
                              <img src="cid:calendraLogo" width="225" alt="Calendra" style="display:block;width:225px;max-width:70%;height:auto;border:0;margin:0 0 22px 0;">
                              <span style="display:inline-block;padding:8px 15px;border-radius:999px;background:#edf4ff;color:#1768e5;font-size:14px;font-weight:700;line-height:1;">{{badge}}</span>
                              <h1 class="email-title" style="margin:20px 0 16px 0;font-size:38px;line-height:1.15;letter-spacing:-1.1px;color:#111a2c;">{{heading}} <img src="cid:platformInvoiceReceiptIcon" width="27" height="27" alt="" style="display:inline-block;width:27px;height:27px;margin-left:7px;vertical-align:-3px;border:0;"></h1>
                              <p style="margin:0 0 12px 0;font-size:17px;line-height:1.65;color:#536581;">Pozdravljeni {{recipientFirstName}},</p>
                              <p style="margin:0 0 15px 0;font-size:17px;line-height:1.65;color:#536581;">{{intro}}</p>
                              <p style="margin:0 0 25px 0;font-size:17px;line-height:1.65;color:#536581;">Hvala, ker zaupate Calendri za učinkovito upravljanje vašega poslovanja.</p>

                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #dce5f1;border-radius:17px;border-collapse:separate;overflow:hidden;">
                                <tr><td colspan="3" style="padding:22px 22px 13px 22px;font-size:21px;font-weight:800;color:#111a2c;">Povzetek računa</td></tr>
                                {{summaryRows}}
                              </table>

                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:22px;">
                                <tr>
                                  <td class="button-cell" width="50%" style="padding:0 10px 0 0;">
                                    <a class="email-button" href="{{primaryUrl}}" style="display:block;padding:16px 18px;border-radius:12px;background:#1768e5;color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;text-align:center;box-shadow:0 8px 20px rgba(23,104,229,0.20);"><img src="cid:platformInvoiceDownloadIcon" width="18" height="18" alt="" style="display:inline-block;width:18px;height:18px;margin-right:8px;vertical-align:-4px;border:0;">{{primaryLabel}}</a>
                                  </td>
                                  <td class="button-cell" width="50%" style="padding:0 0 0 10px;">
                                    <a class="email-button" href="{{invoicesUrl}}" style="display:block;padding:15px 18px;border-radius:12px;border:1px solid #1768e5;background:#ffffff;color:#1768e5;text-decoration:none;font-size:16px;font-weight:800;text-align:center;"><img src="cid:platformInvoiceFolderIcon" width="18" height="18" alt="" style="display:inline-block;width:18px;height:18px;margin-right:8px;vertical-align:-4px;border:0;">Odpri prejete račune</a>
                                  </td>
                                </tr>
                              </table>

                              <p style="margin:20px 2px 24px 2px;font-size:14px;line-height:1.55;color:#6f7f97;"><img src="cid:platformInvoicePaperclipIcon" width="17" height="17" alt="" style="display:inline-block;width:17px;height:17px;margin-right:7px;vertical-align:-4px;border:0;">{{attachmentNote}}</p>

                              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5f9ff;border:1px solid #cfe0fb;border-radius:13px;">
                                <tr>
                                  <td style="width:36px;padding:20px 0 20px 20px;vertical-align:top;"><img src="cid:platformInvoiceInfoIcon" width="25" height="25" alt="" style="display:block;width:25px;height:25px;border:0;"></td>
                                  <td style="padding:20px 20px 20px 12px;vertical-align:top;">
                                    <div style="margin:0 0 9px 0;color:#1768e5;font-size:15px;font-weight:800;text-transform:uppercase;">Pomembno</div>
                                    <div style="font-size:14px;line-height:1.65;color:#536581;">Ta račun je izdan z glavnega računa platforme Calendra ({{issuerName}}) in se nanaša na vašo naročnino na platformo Calendra.</div>
                                    <div style="margin-top:9px;font-size:14px;line-height:1.65;color:#536581;">Za vprašanja v zvezi z naročnino ali plačilom smo vam na voljo na <a href="{{supportEmailHref}}" style="color:#1768e5;text-decoration:none;font-weight:700;">{{supportEmail}}</a>.</div>
                                  </td>
                                </tr>
                              </table>

                              <div style="height:1px;background:#e2e8f1;margin:24px 0 18px 0;"></div>
                              <p style="margin:0;text-align:center;font-size:13px;line-height:1.7;color:#8a99af;">To je avtomatizirano sporočilo platforme Calendra.<br>Podpora: <a href="{{supportEmailHref}}" style="color:#1768e5;text-decoration:none;font-weight:700;">{{supportEmail}}</a></p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
                """;

        Map<String, String> tokens = new LinkedHashMap<>();
        tokens.put("{{badge}}", html(data.badge()));
        tokens.put("{{heading}}", html(data.heading()));
        tokens.put("{{recipientFirstName}}", html(data.recipientFirstName()));
        tokens.put("{{intro}}", html(data.intro()));
        tokens.put("{{summaryRows}}", renderPlatformInvoiceSummaryRows(data));
        tokens.put("{{primaryUrl}}", htmlAttribute(data.primaryUrl()));
        tokens.put("{{primaryLabel}}", html(data.primaryLabel()));
        tokens.put("{{invoicesUrl}}", htmlAttribute(data.invoicesUrl()));
        tokens.put("{{attachmentNote}}", html(data.attachmentNote()));
        tokens.put("{{issuerName}}", html(data.issuerName()));
        tokens.put("{{supportEmailHref}}", htmlAttribute("mailto:" + data.supportEmail()));
        tokens.put("{{supportEmail}}", html(data.supportEmail()));
        for (Map.Entry<String, String> token : tokens.entrySet()) {
            template = template.replace(token.getKey(), token.getValue());
        }
        return template;
    }

    private String renderPlatformInvoiceSummaryRows(PlatformInvoiceEmailData data) {
        StringBuilder rows = new StringBuilder();
        appendPlatformInvoiceRow(rows, PLATFORM_DOCUMENT_ICON_CID, "Številka računa", data.invoiceNumber(), false, false);
        appendPlatformInvoiceRow(rows, PLATFORM_BUILDING_ICON_CID, "Izdajatelj", data.issuerName() + "||Glavni račun platforme Calendra", false, false);
        appendPlatformInvoiceRow(rows, PLATFORM_PACKAGE_ICON_CID, "Paket", data.packageLabel(), false, false);
        appendPlatformInvoiceRow(rows, PLATFORM_PERIOD_ICON_CID, "Obračunsko obdobje", data.billingPeriod(), false, false);
        appendPlatformInvoiceRow(rows, PLATFORM_DATE_ICON_CID, "Datum izdaje", data.issueDate(), false, false);
        appendPlatformInvoiceRow(rows, PLATFORM_CLOCK_ICON_CID, "Rok plačila", data.dueDate(), false, false);
        appendPlatformInvoiceRow(rows, PLATFORM_WALLET_ICON_CID, "Znesek", data.amount(), true, false);
        appendPlatformInvoiceRow(rows, PLATFORM_BANK_ICON_CID, "Način plačila", data.paymentMethod(), false, true);
        return rows.toString();
    }

    private void appendPlatformInvoiceRow(
            StringBuilder rows,
            String iconCid,
            String label,
            String value,
            boolean amount,
            boolean last
    ) {
        String[] valueLines = firstNonBlank(value, "—").split("\\|\\|", 2);
        String background = amount ? "background:#f0f6ff;" : "";
        String border = last ? "" : "border-bottom:1px solid #e6ecf4;";
        String valueStyle = amount
                ? "font-size:22px;font-weight:800;color:#1768e5;"
                : "font-size:15px;font-weight:700;color:#17233a;";
        rows.append("<tr>")
                .append("<td style=\"width:38px;padding:13px 0 13px 18px;").append(background).append(border).append("vertical-align:middle;\">")
                .append("<img src=\"cid:").append(htmlAttributeCid(iconCid)).append("\" width=\"21\" height=\"21\" alt=\"\" style=\"display:block;width:21px;height:21px;border:0;\"></td>")
                .append("<td style=\"padding:13px 10px;").append(background).append(border).append("font-size:15px;font-weight:700;color:#536581;vertical-align:middle;\">")
                .append(html(label)).append("</td>")
                .append("<td class=\"summary-value\" align=\"right\" style=\"padding:13px 18px 13px 10px;").append(background).append(border).append(valueStyle).append("vertical-align:middle;\">")
                .append(html(valueLines[0]));
        if (valueLines.length > 1 && !valueLines[1].isBlank()) {
            rows.append("<div style=\"margin-top:3px;font-size:12px;line-height:1.35;font-weight:400;color:#7b8ba3;\">")
                    .append(html(valueLines[1])).append("</div>");
        }
        rows.append("</td></tr>");
    }

    private String resolveRecipientFirstName(Bill bill) {
        if (bill == null) return "";
        String first = firstNonBlank(bill.getClientFirstNameSnapshot());
        if (!first.isBlank()) return first;
        Client client = bill.getClient();
        if (client != null && client.getFirstName() != null) return client.getFirstName().trim();
        String full = resolveGuestName(bill);
        int space = full.indexOf(' ');
        return space > 0 ? full.substring(0, space) : full;
    }

    private String resolvePlatformPackageLabel(Bill bill, Long tenantId) {
        if (bill != null && bill.getItems() != null) {
            for (BillItem item : bill.getItems()) {
                TransactionService tx = item == null ? null : item.getTransactionService();
                String code = tx == null ? "" : defaultString(tx.getCode()).toUpperCase(Locale.ROOT);
                if (!(code.startsWith("BASIC_") || code.startsWith("PRO_") || code.startsWith("BUS_") || code.startsWith("CUSTOM_"))) {
                    continue;
                }
                String raw = firstNonBlank(item.getInvoiceLineDescription(), tx == null ? null : tx.getDescription());
                String cleaned = raw
                        .replaceAll("(?i)\\s+package\\s*-\\s*(monthly|annual|yearly)\\s*$", "")
                        .replaceAll("(?i)\\s+-\\s+(monthly|annual|yearly)\\s*$", "")
                        .trim();
                return localizePackageLabel(cleaned, code);
            }
        }
        String packageKey = tenantId == null ? "" : defaultString(settingValue(tenantId, SettingKey.SIGNUP_PACKAGE_NAME)).toUpperCase(Locale.ROOT);
        if ("CUSTOM".equals(packageKey)) {
            String custom = settingValue(tenantId, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_NAME);
            if (custom != null && !custom.isBlank()) return ensurePaketSuffix(custom);
        }
        return switch (packageKey) {
            case "BASIC", "TRIAL" -> "Osnovni paket";
            case "PREMIUM" -> "Premium paket";
            case "PROFESSIONAL", "PRO" -> "Poslovni paket";
            default -> "Calendra paket";
        };
    }

    private String localizePackageLabel(String label, String code) {
        String cleaned = defaultString(label);
        String normalized = cleaned.toLowerCase(Locale.ROOT);
        if (normalized.equals("basic")) return "Osnovni paket";
        if (normalized.equals("pro") || normalized.equals("professional")) return "Poslovni paket";
        if (normalized.equals("business") || normalized.equals("premium")) return "Premium paket";
        if (!cleaned.isBlank()) return ensurePaketSuffix(cleaned);
        if (code.startsWith("BASIC_")) return "Osnovni paket";
        if (code.startsWith("PRO_")) return "Poslovni paket";
        if (code.startsWith("BUS_")) return "Premium paket";
        return "Calendra paket";
    }

    private String ensurePaketSuffix(String value) {
        String cleaned = firstNonBlank(value, "Calendra");
        String lower = cleaned.toLowerCase(Locale.ROOT);
        if (lower.endsWith(" paket") || lower.endsWith(" package")) return cleaned;
        return cleaned + " paket";
    }

    private String resolvePlatformBillingPeriod(Bill bill, Long tenantId) {
        LocalDate issueDate = bill == null ? null : bill.getIssueDate();
        LocalDate start = tenantId == null ? null : parseDate(settingValue(tenantId, SettingKey.BILLING_SUBSCRIPTION_START));
        LocalDate endExclusive = tenantId == null ? null : parseDate(settingValue(tenantId, SettingKey.BILLING_SUBSCRIPTION_END));
        String interval = tenantId == null ? "" : defaultString(settingValue(tenantId, SettingKey.BILLING_SUBSCRIPTION_INTERVAL)).toUpperCase(Locale.ROOT);
        LocalDate effectiveStart = start == null ? issueDate : start;
        if (effectiveStart == null) return "—";
        if (endExclusive == null || !endExclusive.isAfter(effectiveStart)) {
            endExclusive = "YEARLY".equals(interval) ? effectiveStart.plusYears(1) : effectiveStart.plusMonths(1);
        }
        LocalDate effectiveEnd = endExclusive.minusDays(1);
        return formatSlovenianDate(effectiveStart) + " – " + formatSlovenianDate(effectiveEnd);
    }

    private String resolvePaymentMethodLabel(Bill bill) {
        PaymentMethod method = bill == null ? null : bill.getPaymentMethod();
        if (method == null || method.getPaymentType() == null) return "—";
        return switch (method.getPaymentType()) {
            case BANK_TRANSFER -> "Bančno nakazilo";
            case CARD -> "Plačilna kartica";
            case CASH -> "Gotovina";
            case ADVANCE -> "Predplačilo";
            case OTHER -> firstNonBlank(method.getName(), "Drugo");
        };
    }

    private Long platformSubscriptionTenantId(Bill bill) {
        if (!isPlatformSubscriptionBill(bill)) return null;
        String reference = defaultString(bill.getBankTransferReference());
        try {
            return Long.valueOf(reference.substring(PLATFORM_SUBSCRIPTION_REFERENCE_PREFIX.length()).trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private String platformInvoicePdfUrl(Bill bill) {
        if (bill == null || bill.getId() == null) return platformReceivedInvoicesUrl();
        return frontendBaseUrl + "/received-invoices/" + bill.getId() + "/download";
    }

    private String platformReceivedInvoicesUrl() {
        return frontendBaseUrl + "/received-invoices";
    }

    private static String normalizeBaseUrl(String value) {
        String base = firstNonBlank(value, "https://app.calendra.si");
        return base.replaceAll("/+$", "");
    }

    private static LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return LocalDate.parse(value.trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String formatSlovenianDate(LocalDate date) {
        if (date == null) return "—";
        return date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
    }

    private static String formatSlovenianMonthYear(LocalDate date) {
        if (date == null) return "—";
        String month = switch (date.getMonth()) {
            case JANUARY -> "januar";
            case FEBRUARY -> "februar";
            case MARCH -> "marec";
            case APRIL -> "april";
            case MAY -> "maj";
            case JUNE -> "junij";
            case JULY -> "julij";
            case AUGUST -> "avgust";
            case SEPTEMBER -> "september";
            case OCTOBER -> "oktober";
            case NOVEMBER -> "november";
            case DECEMBER -> "december";
        };
        return Character.toUpperCase(month.charAt(0)) + month.substring(1) + " " + date.getYear();
    }

    private static String formatEuro(BigDecimal value) {
        BigDecimal normalized = value == null ? BigDecimal.ZERO : value.setScale(2, RoundingMode.HALF_UP);
        return normalized.toPlainString().replace('.', ',') + " €";
    }

    private static String safeFileName(String value) {
        String safe = firstNonBlank(value, "racun").replaceAll("[^a-zA-Z0-9._-]", "_");
        return safe.isBlank() ? "racun" : safe;
    }

    private static String html(String value) {
        return defaultString(value)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static String htmlAttribute(String value) {
        String clean = defaultString(value);
        if (!(clean.startsWith("https://") || clean.startsWith("http://") || clean.startsWith("mailto:"))) {
            return "#";
        }
        return html(clean);
    }

    private static String htmlAttributeCid(String value) {
        return defaultString(value).replaceAll("[^a-zA-Z0-9._-]", "");
    }

    private static String stripHtmlForLog(String value) {
        if (value == null) return null;
        String text = value.replaceAll("(?s)<style.*?</style>", " ")
                .replaceAll("(?s)<[^>]+>", " ")
                .replace("&nbsp;", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return text.length() <= 1000 ? text : text.substring(0, 1000);
    }

    private record PlatformInvoiceEmailData(
            String recipientFirstName,
            String invoiceNumber,
            String issuerName,
            String packageLabel,
            String billingPeriod,
            String issueDate,
            String dueDate,
            String amount,
            String paymentMethod,
            String paymentStatus,
            String heading,
            String badge,
            String intro,
            String attachmentNote,
            String primaryUrl,
            String primaryLabel,
            String invoicesUrl,
            String supportEmail
    ) {}

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
        if (isPlatformSubscriptionBill(bill)) {
            sendPlatformSubscriptionEmail(
                    bill,
                    pdfBytes,
                    platformInvoicePdfUrl(bill),
                    "Prenesi račun (PDF)",
                    "PLATFORM_SUBSCRIPTION_PAID_RECEIPT",
                    true
            );
            return;
        }
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
        // Platform subscription invoices use the dedicated Calendra template and must not depend on
        // Platform Admin's tenant-facing Obvestila -> Dostava računa template/toggle. The recipient-level
        // suppression remains active so deleted/archived tenant recipients are never emailed again.
        if (isPlatformSubscriptionBill(bill)) {
            return !isRecipientInvoiceEmailSuppressed(bill);
        }
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
