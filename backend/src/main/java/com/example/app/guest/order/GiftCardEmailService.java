package com.example.app.guest.order;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.delivery.MessageDeliveryChannel;
import com.example.app.delivery.MessageDeliveryLogService;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.ProductType;
import com.example.app.logging.LogSanitizer;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.internet.MimeMessage;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Currency;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class GiftCardEmailService {
    private static final Logger log = LoggerFactory.getLogger(GiftCardEmailService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter DATE_FORMAT_SL = DateTimeFormatter.ofPattern("dd. MM. yyyy");

    private final JavaMailSender mailSender;
    private final AppSettingRepository settings;
    private final String mailFrom;
    private final String fallbackFrom;
    private final boolean mailConfigured;

    @Autowired(required = false)
    private MessageDeliveryLogService deliveryLogs;

    public GiftCardEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            AppSettingRepository settings,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername
    ) {
        this.mailSender = mailSender;
        this.settings = settings;
        this.mailFrom = mailFrom == null ? "" : mailFrom.trim();
        this.fallbackFrom = mailUsername == null ? "" : mailUsername.trim();
        this.mailConfigured = mailSender != null && mailHost != null && !mailHost.isBlank();
    }

    public void sendGiftCardEmail(GuestEntitlement entitlement) {
        if (entitlement == null || entitlement.getCompany() == null || entitlement.getProduct() == null) return;
        GuestProduct product = entitlement.getProduct();
        if (product.getProductType() != ProductType.GIFT_CARD) return;
        GiftCardSettings cardSettings = loadSettings(entitlement.getCompany().getId());
        if (!cardSettings.active()) return;
        String recipient = recipientEmail(entitlement);
        if (recipient == null || recipient.isBlank()) {
            log.info("Gift-card email skipped for entitlement {}: recipient email missing", entitlement.getId());
            return;
        }
        if (!mailConfigured || mailSender == null) {
            log.warn("Gift-card email skipped for entitlement {} recipient={}: SMTP is not configured", entitlement.getId(), LogSanitizer.emailHash(recipient));
            return;
        }
        String subject = subject(entitlement);
        String html = html(entitlement, cardSettings);
        String preview = plainPreview(entitlement, cardSettings);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setTo(recipient.trim());
            helper.setFrom(resolveFrom());
            helper.setSubject(subject);
            helper.setText(html, true);
            mailSender.send(message);
            logDeliverySent(entitlement, recipient, subject, preview);
        } catch (Exception ex) {
            log.warn("Failed to send gift-card email for entitlement {} recipient={}: {}", entitlement.getId(), LogSanitizer.emailHash(recipient), ex.getMessage());
            logDeliveryFailed(entitlement, recipient, subject, preview, ex.getMessage());
        }
    }

    private GiftCardSettings loadSettings(Long companyId) {
        if (companyId == null || settings == null) return GiftCardSettings.defaults();
        return settings.findByCompanyIdAndKey(companyId, SettingKey.BILLING_GIFT_CARD_SETTINGS_JSON)
                .map(AppSetting::getValue)
                .map(GiftCardSettings::parse)
                .orElseGet(GiftCardSettings::defaults);
    }

    private String recipientEmail(GuestEntitlement entitlement) {
        Client client = entitlement.getClient();
        if (client != null && client.getEmail() != null && !client.getEmail().isBlank()) {
            return client.getEmail();
        }
        GuestOrder order = entitlement.getSourceOrder();
        GuestUser guestUser = order == null ? null : order.getGuestUser();
        return guestUser == null ? null : guestUser.getEmail();
    }

    private String subject(GuestEntitlement entitlement) {
        Company company = entitlement.getCompany();
        String companyName = company == null || company.getName() == null || company.getName().isBlank()
                ? "Calendra"
                : company.getName().trim();
        return "Darilni bon " + companyName;
    }

    private String html(GuestEntitlement entitlement, GiftCardSettings settings) {
        String companyName = escape(companyName(entitlement));
        String productName = escape(productName(entitlement));
        String backgroundStyle = settings.backgroundImageDataUrl() == null || settings.backgroundImageDataUrl().isBlank()
                ? ""
                : "background-image: linear-gradient(90deg, rgba(255,255,255,.92), rgba(255,255,255,.55)), url('" + safeCssUrl(settings.backgroundImageDataUrl()) + "'); background-size: cover; background-position: center;";
        String code = firstNonBlank(entitlement.getDisplayCode(), entitlement.getEntitlementCode(), "—");
        StringBuilder fields = new StringBuilder();
        if (settings.showFrom()) {
            fields.append(field("Od", fromName(entitlement)));
        }
        String to = giftCardMetadata(entitlement).get("giftCardRecipientName");
        if (settings.showTo() && to != null && !to.isBlank()) {
            fields.append(field("Za", to));
        }
        if (settings.showValue()) {
            fields.append("""
                    <div style=\"margin: 0 0 18px;\">
                      <div style=\"font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #6f4e15; margin-bottom: 6px;\">Vrednost</div>
                      <div style=\"font-family: Georgia, 'Times New Roman', serif; font-size: 58px; line-height: .95; letter-spacing: -.05em; color: #b7893f;\">%s</div>
                    </div>
                    """.formatted(escape(value(entitlement))));
        }
        if (settings.showExpires()) {
            fields.append(field("Poteče", expiry(entitlement)));
        }
        String text = giftCardMetadata(entitlement).get("giftCardMessage");
        if (settings.showText() && text != null && !text.isBlank()) {
            fields.append(field("Besedilo", text));
        }
        String codeHtml = settings.showCode()
                ? "<div style=\"position:absolute; top:24px; right:24px; padding:8px 11px; border:1px solid rgba(184,137,62,.45); border-radius:999px; background:rgba(255,255,255,.78); color:#654a1e; font-size:11px; font-weight:900; letter-spacing:.08em; text-transform:uppercase;\">" + escape(code) + "</div>"
                : "";
        return """
                <!doctype html>
                <html>
                <body style=\"margin:0; padding:0; background:#f4f7fb; font-family: Arial, sans-serif; color:#0f172a;\">
                  <div style=\"max-width:760px; margin:0 auto; padding:28px 16px;\">
                    <div style=\"background:#ffffff; border:1px solid #dbe4f0; border-radius:22px; padding:24px; box-shadow:0 18px 42px rgba(15,23,42,.08);\">
                      <h1 style=\"margin:0 0 6px; font-size:24px; line-height:1.25;\">Prejeli ste darilni bon</h1>
                      <p style=\"margin:0 0 22px; color:#64748b; font-size:14px; line-height:1.5;\">%s vam pošilja darilni bon: %s.</p>
                      <div style=\"position:relative; overflow:hidden; min-height:360px; border-radius:22px; background:linear-gradient(120deg,#fffaf2,#f1dfc7); box-shadow:0 20px 46px rgba(69,53,31,.18); %s\">
                        %s
                        <div style=\"width:min(420px, 62%%); padding:36px 38px;\">
                          %s
                        </div>
                      </div>
                      <p style=\"margin:18px 0 0; color:#64748b; font-size:13px; line-height:1.45;\">Kodo darilnega bona shranite. Uporabi se lahko skladno s pogoji ponudnika.</p>
                    </div>
                  </div>
                </body>
                </html>
                """.formatted(companyName, productName, backgroundStyle, codeHtml, fields);
    }

    private String field(String label, String value) {
        return """
                <div style=\"padding-bottom:13px; margin-bottom:15px; border-bottom:1px solid rgba(184,137,62,.44);\">
                  <div style=\"font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #6f4e15; margin-bottom: 6px;\">%s</div>
                  <div style=\"font-family: Georgia, 'Times New Roman', serif; font-size: 25px; line-height: 1.12; color:#30261d;\">%s</div>
                </div>
                """.formatted(escape(label), escape(value));
    }

    private String plainPreview(GuestEntitlement entitlement, GiftCardSettings settings) {
        return "Gift card " + productName(entitlement) + " · " + value(entitlement) + " · " + firstNonBlank(entitlement.getDisplayCode(), entitlement.getEntitlementCode(), "");
    }

    private String companyName(GuestEntitlement entitlement) {
        Company company = entitlement.getCompany();
        return company == null || company.getName() == null || company.getName().isBlank() ? "Calendra" : company.getName().trim();
    }

    private String productName(GuestEntitlement entitlement) {
        GuestProduct product = entitlement.getProduct();
        return product == null || product.getName() == null || product.getName().isBlank() ? "Darilni bon" : product.getName().trim();
    }

    private String fromName(GuestEntitlement entitlement) {
        Client client = entitlement.getClient();
        if (client == null) return "—";
        return firstNonBlank((firstNonBlank(client.getFirstName(), "") + " " + firstNonBlank(client.getLastName(), "")).trim(), client.getEmail(), "—");
    }

    private String value(GuestEntitlement entitlement) {
        BigDecimal amount = entitlement.getRemainingValueGross();
        if (amount == null && entitlement.getProduct() != null) amount = entitlement.getProduct().getPriceGross();
        if (amount == null) amount = BigDecimal.ZERO;
        String currencyCode = entitlement.getProduct() == null ? "EUR" : entitlement.getProduct().getCurrency();
        if (currencyCode == null || currencyCode.isBlank()) currencyCode = "EUR";
        try {
            NumberFormat format = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("sl-SI"));
            format.setCurrency(Currency.getInstance(currencyCode.trim().toUpperCase(Locale.ROOT)));
            return format.format(amount.setScale(2, RoundingMode.HALF_UP));
        } catch (Exception ignore) {
            return amount.setScale(2, RoundingMode.HALF_UP) + " " + currencyCode;
        }
    }

    private String expiry(GuestEntitlement entitlement) {
        if (entitlement.getValidUntil() == null) return "—";
        return DATE_FORMAT_SL.format(entitlement.getValidUntil().atZone(ZoneId.systemDefault()).toLocalDate());
    }

    private Map<String, String> giftCardMetadata(GuestEntitlement entitlement) {
        Map<String, String> result = new LinkedHashMap<>();
        String raw = entitlement.getMetadataJson();
        if (raw == null || raw.isBlank()) return result;
        try {
            JsonNode root = JSON.readTree(raw);
            putIfText(result, root, "giftCardRecipientName");
            putIfText(result, root, "giftCardMessage");
        } catch (Exception ignore) {
        }
        return result;
    }

    private static void putIfText(Map<String, String> result, JsonNode root, String fieldName) {
        if (root == null || !root.has(fieldName)) return;
        String value = root.path(fieldName).asText(null);
        if (value != null && !value.isBlank()) result.put(fieldName, value.trim());
    }

    private String resolveFrom() {
        return !mailFrom.isBlank() ? mailFrom : (!fallbackFrom.isBlank() ? fallbackFrom : "no-reply@calendra.si");
    }

    private void logDeliverySent(GuestEntitlement entitlement, String recipient, String subject, String preview) {
        if (deliveryLogs == null) return;
        GuestOrder order = entitlement.getSourceOrder();
        deliveryLogs.sent(
                entitlement.getCompany(),
                entitlement.getClient(),
                order == null ? null : order.getGuestUser(),
                MessageDeliveryChannel.EMAIL,
                "GIFT_CARD_EMAIL",
                recipient,
                subject,
                preview,
                "guest_entitlement",
                entitlement.getId()
        );
    }

    private void logDeliveryFailed(GuestEntitlement entitlement, String recipient, String subject, String preview, String errorMessage) {
        if (deliveryLogs == null) return;
        GuestOrder order = entitlement.getSourceOrder();
        deliveryLogs.failed(
                entitlement.getCompany(),
                entitlement.getClient(),
                order == null ? null : order.getGuestUser(),
                MessageDeliveryChannel.EMAIL,
                "GIFT_CARD_EMAIL",
                recipient,
                subject,
                preview,
                "guest_entitlement",
                entitlement.getId(),
                errorMessage
        );
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String safeCssUrl(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        if (!trimmed.startsWith("data:image/")) return "";
        return trimmed.replace("'", "").replace("\\", "");
    }

    private static String escape(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private record GiftCardSettings(
            boolean active,
            boolean showFrom,
            boolean showTo,
            boolean showValue,
            boolean showExpires,
            boolean showText,
            boolean showCode,
            String backgroundImageDataUrl
    ) {
        static GiftCardSettings defaults() {
            return new GiftCardSettings(true, true, true, true, true, true, true, "");
        }

        static GiftCardSettings parse(String raw) {
            if (raw == null || raw.isBlank()) return defaults();
            try {
                JsonNode root = JSON.readTree(raw);
                GiftCardSettings defaults = defaults();
                return new GiftCardSettings(
                        bool(root, "active", defaults.active()),
                        bool(root, "showFrom", defaults.showFrom()),
                        bool(root, "showTo", defaults.showTo()),
                        bool(root, "showValue", defaults.showValue()),
                        bool(root, "showExpires", defaults.showExpires()),
                        bool(root, "showText", defaults.showText()),
                        bool(root, "showCode", defaults.showCode()),
                        text(root, "backgroundImageDataUrl", "")
                );
            } catch (Exception ignore) {
                return defaults();
            }
        }

        private static boolean bool(JsonNode root, String fieldName, boolean fallback) {
            if (root == null || !root.has(fieldName)) return fallback;
            JsonNode node = root.path(fieldName);
            if (node.isBoolean()) return node.asBoolean();
            if (node.isTextual()) {
                String value = node.asText("").trim();
                if (value.equalsIgnoreCase("true")) return true;
                if (value.equalsIgnoreCase("false")) return false;
            }
            return fallback;
        }

        private static String text(JsonNode root, String fieldName, String fallback) {
            if (root == null || !root.has(fieldName)) return fallback;
            String value = root.path(fieldName).asText(fallback);
            return value == null ? fallback : value.trim();
        }
    }
}
