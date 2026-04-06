package com.example.app.billing;

import com.example.app.client.Client;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
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

    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final String fallbackFrom;
    private final boolean mailConfigured;

    public BillingEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername
    ) {
        this.mailSender = mailSender;
        this.mailFrom = mailFrom == null ? "" : mailFrom.trim();
        this.fallbackFrom = mailUsername == null ? "" : mailUsername.trim();
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
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
        String recipient = resolveRecipientEmail(bill);
        if (recipient == null || recipient.isBlank()) {
            log.warn("Bank transfer folio not emailed for bill {}: missing recipient email", bill.getId());
            return;
        }
        if (!mailConfigured) {
            log.warn("Bank transfer folio not emailed for bill {}: mail is not configured", bill.getId());
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(resolveFromAddress());
            helper.setTo(recipient);
            helper.setSubject("Folio for bill " + bill.getBillNumber());
            helper.setText("""
                    Hello,

                    your folio %s is attached as a PDF.

                    Please scan the QR code on the folio with your banking app to prefill the bank transfer and complete payment.

                    Thank you.
                    """.formatted(bill.getBillNumber()), false);
            helper.addAttachment("folio-" + bill.getBillNumber() + ".pdf", new ByteArrayResource(pdfBytes), "application/pdf");
            mailSender.send(message);
            log.info("Bank transfer folio emailed for bill {} to {}", bill.getId(), recipient);
        } catch (Exception ex) {
            log.warn("Failed to send bank transfer folio for bill {}: {}", bill.getId(), ex.getMessage());
        }
    }


    private void sendPaymentLink(Bill bill, String url, String subject, String body, String logLabel) {
        String recipient = resolveRecipientEmail(bill);
        if (recipient == null || recipient.isBlank()) {
            log.warn("{} URL not emailed for bill {}: missing recipient email", logLabel, bill.getId());
            return;
        }
        if (!mailConfigured) {
            log.warn("{} URL not emailed for bill {}: mail is not configured", logLabel, bill.getId());
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(resolveFromAddress());
            helper.setTo(recipient);
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
            log.info("{} emailed for bill {} to {}", logLabel, bill.getId(), recipient);
        } catch (Exception ex) {
            log.warn("Failed to send {} email for bill {}: {}", logLabel, bill.getId(), ex.getMessage());
        }
    }

    public void sendPaidBillReceipt(Bill bill, byte[] pdfBytes) {
        String recipient = resolveRecipientEmail(bill);
        if (recipient == null || recipient.isBlank()) {
            log.warn("Paid bill receipt not emailed for bill {}: missing recipient email", bill.getId());
            return;
        }
        if (!mailConfigured) {
            log.warn("Paid bill receipt not emailed for bill {}: mail is not configured", bill.getId());
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(resolveFromAddress());
            helper.setTo(recipient);
            helper.setSubject("Invoice/receipt for bill " + bill.getBillNumber());
            helper.setText("""
                    Hello,

                    your payment for therapy bill %s has been completed.
                    Invoice/receipt is attached.

                    Thank you.
                    """.formatted(bill.getBillNumber()), false);
            helper.addAttachment(bill.getBillNumber() + ".pdf", new ByteArrayResource(pdfBytes), "application/pdf");
            mailSender.send(message);
            log.info("Paid bill receipt emailed for bill {} to {}", bill.getId(), recipient);
        } catch (Exception ex) {
            log.warn("Failed to send paid bill receipt for bill {}: {}", bill.getId(), ex.getMessage());
        }
    }

    private String resolveRecipientEmail(Bill bill) {
        Client client = bill.getClient();
        if (client != null && client.getEmail() != null && !client.getEmail().isBlank()) {
            return client.getEmail().trim();
        }
        if (bill.getRecipientCompanyEmailSnapshot() != null && !bill.getRecipientCompanyEmailSnapshot().isBlank()) {
            return bill.getRecipientCompanyEmailSnapshot().trim();
        }
        return null;
    }

    private String resolveFromAddress() {
        if (!mailFrom.isBlank()) return mailFrom;
        if (!fallbackFrom.isBlank()) return fallbackFrom;
        return "noreply@localhost";
    }
}
