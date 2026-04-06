package com.example.app.billing;

import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.stereotype.Service;

@Service
public class BillPdfService {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AppSettingRepository settings;

    public BillPdfService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public byte[] generatePdf(Bill bill, Long companyId) {
        var today = LocalDate.now();
        int deadlineDays = parseIntSetting(companyId, SettingKey.PAYMENT_DEADLINE_DAYS, 15);
        var dueDate = today.plusDays(deadlineDays);
        var companyName = getSetting(companyId, SettingKey.COMPANY_NAME, "");
        var companyAddress = getSetting(companyId, SettingKey.COMPANY_ADDRESS, "");
        var companyPostal = getSetting(companyId, SettingKey.COMPANY_POSTAL_CODE, "");
        var companyCity = getSetting(companyId, SettingKey.COMPANY_CITY, "");
        var companyVat = getSetting(companyId, SettingKey.COMPANY_VAT_ID, "");
        var companyEmail = getSetting(companyId, SettingKey.COMPANY_EMAIL, "");
        var companyTel = getSetting(companyId, SettingKey.COMPANY_TELEPHONE, "");
        var companyIban = getSetting(companyId, SettingKey.COMPANY_IBAN, "");
        try (var doc = new PDDocument(); var out = new ByteArrayOutputStream()) {
            var page = new PDPage();
            doc.addPage(page);
            try (var stream = new PDPageContentStream(doc, page)) {
                var font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
                var fontBold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
                boolean companyRecipient = "COMPANY".equalsIgnoreCase(bill.getRecipientTypeSnapshot());
                var clientName = companyRecipient
                        ? emptySafe(bill.getRecipientCompanyNameSnapshot())
                        : (emptySafe(bill.getClientFirstNameSnapshot()) + " " + emptySafe(bill.getClientLastNameSnapshot())).trim();
                Map<String, LayoutField> layout = resolveFolioLayout(getSetting(companyId, SettingKey.FOLIO_TEMPLATE_LAYOUT_JSON, ""));
                float pageW = page.getMediaBox().getWidth();
                float pageH = page.getMediaBox().getHeight();

                drawAtField(stream, fontBold, 11, pageW, pageH, layout, "companyName", safe(companyName));
                drawAtField(stream, font, 10, pageW, pageH, layout, "companyAddress", safe(companyAddress));
                drawAtField(stream, font, 10, pageW, pageH, layout, "companyCityLine", safe((companyPostal + " " + companyCity).trim()));
                drawAtField(stream, font, 10, pageW, pageH, layout, "companyVat", companyVat.isBlank() ? "" : "VAT ID: " + companyVat.trim());
                drawAtField(stream, font, 10, pageW, pageH, layout, "companyEmail", companyEmail.isBlank() ? "" : "Email: " + companyEmail.trim());
                drawAtField(stream, font, 10, pageW, pageH, layout, "companyTelephone", companyTel.isBlank() ? "" : "Tel: " + companyTel.trim());

                drawAtField(stream, fontBold, 10, pageW, pageH, layout, "billNumber", "Bill no: " + bill.getBillNumber());
                drawAtField(stream, font, 10, pageW, pageH, layout, "billSlash", "/");
                drawAtField(stream, font, 10, pageW, pageH, layout, "issueDate", "Date: " + today);
                drawAtField(stream, font, 10, pageW, pageH, layout, "dueDate", "Due date: " + dueDate);
                drawAtField(stream, fontBold, 10, pageW, pageH, layout, "recipientName", safe(clientName));

                if (companyRecipient) {
                    drawAtField(stream, font, 10, pageW, pageH, layout, "recipientAddress", safe(emptySafe(bill.getRecipientCompanyAddressSnapshot())));
                    drawAtField(stream, font, 10, pageW, pageH, layout, "recipientCityLine", safe((emptySafe(bill.getRecipientCompanyPostalCodeSnapshot()) + " " + emptySafe(bill.getRecipientCompanyCitySnapshot())).trim()));
                    drawAtField(stream, font, 10, pageW, pageH, layout, "recipientVat", emptySafe(bill.getRecipientCompanyVatIdSnapshot()).isBlank() ? "" : "VAT ID: " + safe(emptySafe(bill.getRecipientCompanyVatIdSnapshot())));
                } else {
                    drawAtField(stream, font, 10, pageW, pageH, layout, "recipientAddress", "");
                    drawAtField(stream, font, 10, pageW, pageH, layout, "recipientCityLine", "");
                    drawAtField(stream, font, 10, pageW, pageH, layout, "recipientVat", "");
                }

                drawAtField(stream, fontBold, 10, pageW, pageH, layout, "itemsHeader", "Service | Qty | Net | Gross");
                LayoutField rowsField = layout.get("itemsRows");
                float rowsX = toPdfX(rowsField.xPct(), pageW);
                float rowsY = toPdfY(rowsField.yPct(), pageH, 10);
                float line = 14f;
                for (var item : bill.getItems()) {
                    String serviceText = item.getTransactionService().getCode() + " - " + item.getTransactionService().getDescription();
                    String row = (serviceText.length() > 38 ? serviceText.substring(0, 38) + "…" : serviceText)
                            + " | " + item.getQuantity()
                            + " | " + item.getNetPrice().setScale(2, RoundingMode.HALF_UP)
                            + " | " + item.getGrossPrice().setScale(2, RoundingMode.HALF_UP);
                    drawText(stream, font, 9, rowsX, rowsY, row);
                    rowsY -= line;
                    if (rowsY < 40) break;
                }

                drawAtField(stream, font, 10, pageW, pageH, layout, "totalNet", "Total net: " + bill.getTotalNet().setScale(2, RoundingMode.HALF_UP));
                drawAtField(stream, fontBold, 11, pageW, pageH, layout, "totalGross", "Total gross: " + bill.getTotalGross().setScale(2, RoundingMode.HALF_UP));
                drawAtField(stream, font, 9, pageW, pageH, layout, "fiscalZoi", bill.getFiscalZoi() == null ? "" : "ZOI: " + bill.getFiscalZoi());
                drawAtField(stream, font, 9, pageW, pageH, layout, "fiscalEor", bill.getFiscalEor() == null ? "" : "EOR: " + bill.getFiscalEor());
                drawAtField(stream, font, 9, pageW, pageH, layout, "fiscalQr", bill.getFiscalQr() == null ? "" : "QR: " + bill.getFiscalQr());
                drawAtField(stream, font, 10, pageW, pageH, layout, "companyIban", companyIban.isBlank() ? "" : "Pay to IBAN: " + companyIban.trim());
                drawAtField(stream, font, 10, pageW, pageH, layout, "consultantName", "Issued by: " + bill.getConsultant().getFirstName() + " " + bill.getConsultant().getLastName());
            }
            doc.save(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Unable to generate bill PDF", e);
        }
    }

    private record LayoutField(float xPct, float yPct, float wPct, float hPct) {}

    private static Map<String, LayoutField> resolveFolioLayout(String rawJson) {
        Map<String, LayoutField> fields = new HashMap<>();
        fields.put("companyName", new LayoutField(8, 22, 28, 3.8f));
        fields.put("companyAddress", new LayoutField(8, 26.5f, 28, 3.8f));
        fields.put("companyCityLine", new LayoutField(8, 31, 28, 3.8f));
        fields.put("companyTelephone", new LayoutField(8, 35.5f, 28, 3.8f));
        fields.put("companyEmail", new LayoutField(8, 40, 28, 3.8f));
        fields.put("companyVat", new LayoutField(8, 44.5f, 28, 3.8f));
        fields.put("recipientName", new LayoutField(8, 53, 30, 3.8f));
        fields.put("recipientAddress", new LayoutField(8, 57.5f, 34, 3.8f));
        fields.put("recipientCityLine", new LayoutField(8, 62, 30, 3.8f));
        fields.put("recipientVat", new LayoutField(8, 66.5f, 30, 3.8f));
        fields.put("billNumber", new LayoutField(62, 24, 30, 3.8f));
        fields.put("billSlash", new LayoutField(62, 28.5f, 30, 3.8f));
        fields.put("issueDate", new LayoutField(62, 33, 30, 3.8f));
        fields.put("dueDate", new LayoutField(62, 37.5f, 30, 3.8f));
        fields.put("itemsHeader", new LayoutField(8, 76, 86, 3.8f));
        fields.put("itemsRows", new LayoutField(8, 81, 86, 9.5f));
        fields.put("totalNet", new LayoutField(62, 90, 30, 3.8f));
        fields.put("totalGross", new LayoutField(62, 94.5f, 30, 3.8f));
        fields.put("fiscalZoi", new LayoutField(8, 84, 56, 3.8f));
        fields.put("fiscalEor", new LayoutField(8, 88, 56, 3.8f));
        fields.put("fiscalQr", new LayoutField(8, 92, 56, 3.8f));
        fields.put("companyIban", new LayoutField(8, 96, 58, 3.8f));
        fields.put("consultantName", new LayoutField(62, 99, 30, 3.8f));
        if (rawJson == null || rawJson.isBlank()) return fields;
        try {
            JsonNode root = JSON.readTree(rawJson);
            if (root == null || !root.isArray()) return fields;
            for (JsonNode n : root) {
                String id = n.path("id").asText("");
                if (!fields.containsKey(id)) continue;
                float x = (float) n.path("x").asDouble(fields.get(id).xPct());
                float y = (float) n.path("y").asDouble(fields.get(id).yPct());
                float w = (float) n.path("w").asDouble(fields.get(id).wPct());
                float h = (float) n.path("h").asDouble(fields.get(id).hPct());
                fields.put(id, new LayoutField(x, y, w, h));
            }
        } catch (Exception ignored) {
        }
        return fields;
    }

    private String getSetting(Long companyId, SettingKey key, String defaultValue) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(s -> s.getValue() == null ? "" : s.getValue())
                .orElse(defaultValue);
    }

    private int parseIntSetting(Long companyId, SettingKey key, int defaultValue) {
        try {
            var v = getSetting(companyId, key, String.valueOf(defaultValue)).trim();
            if (v.isBlank()) return defaultValue;
            return Integer.parseInt(v);
        } catch (Exception ignored) {
            return defaultValue;
        }
    }

    private static float toPdfX(float xPct, float pageW) { return pageW * (xPct / 100f); }
    private static float toPdfY(float yPct, float pageH, int fontSize) { return pageH - (pageH * (yPct / 100f)) - fontSize; }

    private static void drawAtField(PDPageContentStream stream, PDType1Font font, int fontSize, float pageW, float pageH,
                                    Map<String, LayoutField> layout, String fieldId, String text) throws java.io.IOException {
        var f = layout.get(fieldId);
        if (f == null) return;
        drawText(stream, font, fontSize, toPdfX(f.xPct(), pageW), toPdfY(f.yPct(), pageH, fontSize), text);
    }

    private static void drawText(PDPageContentStream stream, PDType1Font font, int fontSize, float x, float y, String text) throws java.io.IOException {
        if (text == null || text.isBlank()) return;
        stream.beginText();
        stream.setFont(font, fontSize);
        stream.newLineAtOffset(x, y);
        stream.showText(safe(text));
        stream.endText();
    }

    private static String safe(String v) {
        if (v == null) return "";
        String s = v.replace("\n", " ").replace("\r", " ").trim();
        s = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        s = s.replaceAll("[^\\x20-\\x7E]", "");
        return s;
    }

    private static String emptySafe(String value) { return value == null ? "" : value; }
}
