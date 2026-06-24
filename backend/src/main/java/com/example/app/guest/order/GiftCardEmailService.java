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
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.Currency;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class GiftCardEmailService {
    private static final Logger log = LoggerFactory.getLogger(GiftCardEmailService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter DATE_FORMAT_SL = DateTimeFormatter.ofPattern("dd. MM. yyyy");
    private static final String FONT_REGULAR_CLASSPATH = "/fonts/NotoSans-Regular.ttf";
    private static final String FONT_BOLD_CLASSPATH = "/fonts/NotoSans-Bold.ttf";


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
        String body = emailBody(entitlement, cardSettings);
        String preview = plainPreview(entitlement, cardSettings);
        try {
            byte[] pdfBytes = giftCardPdf(entitlement, cardSettings);
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setTo(recipient.trim());
            helper.setFrom(resolveFrom());
            helper.setSubject(subject);
            helper.setText(body, false);
            helper.addAttachment(giftCardFileName(entitlement), new ByteArrayResource(pdfBytes), "application/pdf");
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

    private String emailBody(GuestEntitlement entitlement, GiftCardSettings settings) {
        String companyName = companyName(entitlement);
        String productName = productName(entitlement);
        String code = firstNonBlank(entitlement.getDisplayCode(), entitlement.getEntitlementCode(), "");
        StringBuilder body = new StringBuilder();
        body.append("Pozdravljeni,\n\n");
        body.append("v priponki vam pošiljamo darilni bon");
        if (!productName.isBlank()) body.append(" ").append(productName);
        body.append(".\n");
        if (!code.isBlank()) {
            body.append("Koda darilnega bona: ").append(code).append("\n");
        }
        body.append("\nLep pozdrav,\n").append(companyName);
        return body.toString();
    }

    public byte[] giftCardPdf(GuestEntitlement entitlement) throws IOException {
        if (entitlement == null || entitlement.getCompany() == null) {
            throw new IOException("Gift-card entitlement is incomplete.");
        }
        return giftCardPdf(entitlement, loadSettings(entitlement.getCompany().getId()));
    }

    public String giftCardPdfFileName(GuestEntitlement entitlement) {
        return giftCardFileName(entitlement);
    }

    private byte[] giftCardPdf(GuestEntitlement entitlement, GiftCardSettings settings) throws IOException {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDFont regular = loadFont(document, FONT_REGULAR_CLASSPATH);
            PDFont bold = loadFont(document, FONT_BOLD_CLASSPATH);
            PDPage page = new PDPage(new PDRectangle(842, 595));
            document.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                drawGiftCardPage(document, stream, entitlement, settings, regular, bold);
            }
            document.save(out);
            return out.toByteArray();
        }
    }

    private void drawGiftCardPage(
            PDDocument document,
            PDPageContentStream stream,
            GuestEntitlement entitlement,
            GiftCardSettings settings,
            PDFont regular,
            PDFont bold
    ) throws IOException {
        float pageW = 842;
        float pageH = 595;
        float cardW = 720;
        float cardH = 390;
        float cardX = (pageW - cardW) / 2;
        float cardY = (pageH - cardH) / 2;

        fillRect(stream, 0, 0, pageW, pageH, new Color(244, 247, 251));
        fillRect(stream, cardX + 5, cardY - 7, cardW, cardH, new Color(225, 232, 240));
        fillRect(stream, cardX, cardY, cardW, cardH, new Color(255, 250, 242));

        byte[] background = decodeImageDataUrl(settings.backgroundImageDataUrl());
        if (background != null && background.length > 0) {
            try {
                PDImageXObject image = PDImageXObject.createFromByteArray(document, background, "gift-card-background");
                stream.saveGraphicsState();
                stream.addRect(cardX, cardY, cardW, cardH);
                stream.clip();
                drawCoverImage(stream, image, cardX, cardY, cardW, cardH);
                stream.restoreGraphicsState();
            } catch (Exception ex) {
                log.warn("Gift-card PDF background image could not be rendered: {}", ex.getMessage());
            }
        } else {
            drawDefaultGiftIllustration(stream, cardX, cardY, cardW, cardH);
        }

        // Light overlay, matching the Configuration preview where text stays readable over the uploaded background.
        setAlpha(stream, 0.92f);
        fillRect(stream, cardX, cardY, cardW * 0.58f, cardH, Color.WHITE);
        setAlpha(stream, 0.28f);
        fillRect(stream, cardX + cardW * 0.38f, cardY, cardW * 0.62f, cardH, Color.WHITE);
        setAlpha(stream, 1f);

        String code = firstNonBlank(entitlement.getDisplayCode(), entitlement.getEntitlementCode(), "—");
        if (settings.showCode()) {
            drawCodePill(stream, regular, code, cardX + cardW - 132, cardY + cardH - 52);
        }

        float leftX = cardX + 42;
        float topY = cardY + cardH - 48;
        float fieldWidth = 315;
        float cursorY = topY;
        Map<String, String> metadata = giftCardMetadata(entitlement);

        if (settings.showFrom()) {
            cursorY = drawPdfField(stream, regular, bold, "OD", fromName(entitlement), leftX, cursorY, fieldWidth, 23, true);
        }
        String to = metadata.get("giftCardRecipientName");
        if (settings.showTo() && to != null && !to.isBlank()) {
            cursorY = drawPdfField(stream, regular, bold, "ZA", to, leftX, cursorY, fieldWidth, 23, true);
        }
        if (settings.showValue()) {
            drawPdfLabel(stream, bold, "VREDNOST", leftX, cursorY);
            drawPdfText(stream, bold, value(entitlement), leftX, cursorY - 54, 46, new Color(183, 138, 66));
            cursorY -= 84;
        }
        if (settings.showExpires()) {
            cursorY = drawPdfField(stream, regular, bold, "POTEČE", expiry(entitlement), leftX, cursorY, fieldWidth, 20, true);
        }
        String message = metadata.get("giftCardMessage");
        if (settings.showText() && message != null && !message.isBlank()) {
            drawPdfLabel(stream, bold, "BESEDILO", leftX, cursorY);
            drawWrappedPdfText(stream, regular, message, leftX, cursorY - 22, fieldWidth, 14.5f, 19f, new Color(48, 38, 29), 4);
        }
    }

    private float drawPdfField(
            PDPageContentStream stream,
            PDFont regular,
            PDFont bold,
            String label,
            String value,
            float x,
            float y,
            float width,
            float valueSize,
            boolean underline
    ) throws IOException {
        drawPdfLabel(stream, bold, label, x, y);
        drawPdfText(stream, regular, firstNonBlank(value, "—"), x, y - 24, valueSize, new Color(48, 38, 29));
        float nextY = y - 54;
        if (underline) {
            stream.setStrokingColor(new Color(184, 137, 62));
            stream.setLineWidth(0.7f);
            stream.moveTo(x, nextY + 7);
            stream.lineTo(x + width, nextY + 7);
            stream.stroke();
            nextY -= 10;
        }
        return nextY;
    }

    private void drawPdfLabel(PDPageContentStream stream, PDFont bold, String text, float x, float y) throws IOException {
        drawPdfText(stream, bold, text, x, y, 9.5f, new Color(101, 74, 30));
    }

    private void drawCodePill(PDPageContentStream stream, PDFont regular, String code, float x, float y) throws IOException {
        String displayCode = firstNonBlank(code, "—");
        float width = Math.max(92, Math.min(132, textWidth(regular, displayCode, 9) + 24));
        fillRect(stream, x, y, width, 26, new Color(255, 255, 255));
        stream.setStrokingColor(new Color(184, 137, 62));
        stream.setLineWidth(0.8f);
        stream.addRect(x, y, width, 26);
        stream.stroke();
        drawPdfText(stream, regular, displayCode, x + 12, y + 9, 9, new Color(101, 74, 30));
    }

    private void drawDefaultGiftIllustration(PDPageContentStream stream, float cardX, float cardY, float cardW, float cardH) throws IOException {
        setAlpha(stream, 0.18f);
        Color gold = new Color(183, 138, 66);
        float x = cardX + cardW - 220;
        float y = cardY + 115;
        fillRect(stream, x + 30, y, 130, 112, gold);
        fillRect(stream, x + 12, y + 112, 166, 36, gold);
        fillRect(stream, x + 86, y, 20, 148, new Color(150, 106, 44));
        stream.setStrokingColor(gold);
        stream.setLineWidth(13);
        stream.moveTo(x + 96, y + 151);
        stream.curveTo(x + 38, y + 205, x + 20, y + 127, x + 86, y + 142);
        stream.stroke();
        stream.moveTo(x + 104, y + 151);
        stream.curveTo(x + 162, y + 205, x + 180, y + 127, x + 114, y + 142);
        stream.stroke();
        setAlpha(stream, 1f);
    }

    private void drawCoverImage(PDPageContentStream stream, PDImageXObject image, float x, float y, float width, float height) throws IOException {
        float imageW = image.getWidth();
        float imageH = image.getHeight();
        if (imageW <= 0 || imageH <= 0) return;
        float scale = Math.max(width / imageW, height / imageH);
        float drawW = imageW * scale;
        float drawH = imageH * scale;
        float drawX = x + (width - drawW) / 2f;
        float drawY = y + (height - drawH) / 2f;
        stream.drawImage(image, drawX, drawY, drawW, drawH);
    }

    private void fillRect(PDPageContentStream stream, float x, float y, float width, float height, Color color) throws IOException {
        stream.setNonStrokingColor(color);
        stream.addRect(x, y, width, height);
        stream.fill();
    }

    private void setAlpha(PDPageContentStream stream, float alpha) throws IOException {
        PDExtendedGraphicsState state = new PDExtendedGraphicsState();
        state.setNonStrokingAlphaConstant(alpha);
        state.setStrokingAlphaConstant(alpha);
        stream.setGraphicsStateParameters(state);
    }

    private void drawPdfText(PDPageContentStream stream, PDFont font, String text, float x, float y, float fontSize, Color color) throws IOException {
        stream.beginText();
        stream.setFont(font, fontSize);
        stream.setNonStrokingColor(color);
        stream.newLineAtOffset(x, y);
        stream.showText(pdfText(text));
        stream.endText();
    }

    private void drawWrappedPdfText(
            PDPageContentStream stream,
            PDFont font,
            String text,
            float x,
            float y,
            float maxWidth,
            float fontSize,
            float lineHeight,
            Color color,
            int maxLines
    ) throws IOException {
        float cursorY = y;
        int lines = 0;
        for (String line : wrapPdfText(font, pdfText(text), fontSize, maxWidth)) {
            if (lines >= maxLines) break;
            drawPdfText(stream, font, line, x, cursorY, fontSize, color);
            cursorY -= lineHeight;
            lines++;
        }
    }

    private java.util.List<String> wrapPdfText(PDFont font, String text, float fontSize, float maxWidth) throws IOException {
        java.util.List<String> lines = new java.util.ArrayList<>();
        if (text == null || text.isBlank()) return lines;
        String[] paragraphs = text.replace("\r", "").split("\n");
        for (String paragraph : paragraphs) {
            StringBuilder line = new StringBuilder();
            for (String word : paragraph.trim().split("\\s+")) {
                String candidate = line.isEmpty() ? word : line + " " + word;
                if (!line.isEmpty() && textWidth(font, candidate, fontSize) > maxWidth) {
                    lines.add(line.toString());
                    line = new StringBuilder(word);
                } else {
                    line = new StringBuilder(candidate);
                }
            }
            if (!line.isEmpty()) lines.add(line.toString());
        }
        return lines;
    }

    private float textWidth(PDFont font, String text, float fontSize) throws IOException {
        if (text == null || text.isBlank()) return 0;
        return font.getStringWidth(pdfText(text)) / 1000f * fontSize;
    }

    private PDFont loadFont(PDDocument document, String classpath) throws IOException {
        try (InputStream stream = GiftCardEmailService.class.getResourceAsStream(classpath)) {
            if (stream == null) throw new IOException("Missing font resource: " + classpath);
            return PDType0Font.load(document, stream, true);
        }
    }

    private byte[] decodeImageDataUrl(String dataUrl) {
        if (dataUrl == null || dataUrl.isBlank()) return null;
        String trimmed = dataUrl.trim();
        if (!trimmed.startsWith("data:image/")) return null;
        int comma = trimmed.indexOf(',');
        if (comma < 0 || comma >= trimmed.length() - 1) return null;
        String header = trimmed.substring(0, comma).toLowerCase(Locale.ROOT);
        String payload = trimmed.substring(comma + 1);
        if (!header.contains(";base64")) return null;
        try {
            return Base64.getDecoder().decode(payload);
        } catch (IllegalArgumentException ex) {
            return null;
        }
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
        BigDecimal amount = entitlement.getProduct() == null ? null : entitlement.getProduct().getPriceGross();
        if (amount == null && entitlement.getSourceOrder() != null) amount = entitlement.getSourceOrder().getTotalGross();
        if (amount == null) amount = entitlement.getRemainingValueGross();
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

    private String giftCardFileName(GuestEntitlement entitlement) {
        String code = firstNonBlank(entitlement.getDisplayCode(), entitlement.getEntitlementCode(), String.valueOf(entitlement.getId()));
        String safeCode = code == null ? "" : code.replaceAll("[^A-Za-z0-9._-]", "-");
        if (safeCode.isBlank()) safeCode = "bon";
        return "darilni-bon-" + safeCode + ".pdf";
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

    private static String pdfText(String value) {
        if (value == null) return "";
        return value
                .replace('\u00A0', ' ')
                .replace("\t", " ")
                .replaceAll("[\\p{Cntrl}&&[^\\r\\n]]", "")
                .trim();
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
