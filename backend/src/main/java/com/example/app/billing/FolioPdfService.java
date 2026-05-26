package com.example.app.billing;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.imageio.ImageIO;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.stereotype.Service;

/**
 * Generates a folio PDF from a {@link FolioPdfRequest} using a
 * {@link FolioLayoutConfig} for all field positions, table columns,
 * and footer layout. Supports pagination when rows exceed page height.
 */
@Service
public class FolioPdfService {

    private static final float BOTTOM_MARGIN = 60;
    private static final String FONT_REGULAR_CLASSPATH = "/fonts/NotoSans-Regular.ttf";
    private static final String FONT_BOLD_CLASSPATH = "/fonts/NotoSans-Bold.ttf";
    private static final int LAYOUT_PREVIEW_SERVICE_ROWS = 3;

    private enum VatBreakdownBucket {
        VAT_22,
        VAT_9_5,
        VAT_0,
        NO_VAT
    }

    private record VatBreakdownRow(VatBreakdownBucket bucket, BigDecimal netBasis, BigDecimal vatAmount, int lineCount) {}

    /**
     * Generate PDF using default layout.
     */
    public byte[] generate(FolioPdfRequest req) {
        return generate(req, FolioLayoutConfig.defaultLayout(), null);
    }

    public byte[] generate(FolioPdfRequest req, FolioLayoutConfig layout) {
        return generate(req, layout, null);
    }

    /**
     * Generate PDF using the supplied layout configuration, optional logo, and optional signature.
     */
    public byte[] generate(FolioPdfRequest req, FolioLayoutConfig layout, byte[] logoBytes) {
        return generate(req, layout, logoBytes, null);
    }

    public byte[] generate(FolioPdfRequest req, FolioLayoutConfig layout, byte[] logoBytes, byte[] signatureBytes) {
        return generate(req, layout, logoBytes, signatureBytes, req != null ? req.getLocale() : null);
    }

    public byte[] generate(FolioPdfRequest req, FolioLayoutConfig layout, byte[] logoBytes, byte[] signatureBytes, String locale) {
        String selectedLocale = normalizeLocale(locale);
        float pageH = layout.getPageHeight();
        float pageW = layout.getPageWidth();
        var tbl = layout.getTable();

        try (var doc = new PDDocument(); var out = new ByteArrayOutputStream()) {
            FontSet fonts = loadFonts(doc);
            var ctx = new PageContext(doc, pageW, pageH);
            ctx.newPage();

            drawLogo(ctx, layout, logoBytes);
            drawHeaderFields(ctx, layout, req, selectedLocale, fonts);

            // Table: Y in the config is distance from page top; convert to PDF coords
            float cursorY = pageH - tbl.getStartY();
            cursorY = drawTableHeader(ctx, layout, cursorY, selectedLocale, fonts);

            List<FolioPdfRequest.ServiceLine> lines = req.getServices() == null ? List.of() : req.getServices();
            BigDecimal totalNett = BigDecimal.ZERO;
            BigDecimal totalGross = BigDecimal.ZERO;
            int rowsOnCurrentPage = 0;

            for (var line : lines) {
                if (cursorY - tbl.getRowHeight() < BOTTOM_MARGIN) {
                    ctx.closeStream();
                    ctx.newPage();
                    cursorY = pageH - 50; // top margin on continuation pages
                    cursorY = drawTableHeader(ctx, layout, cursorY, selectedLocale, fonts);
                    rowsOnCurrentPage = 0;
                }
                cursorY = drawServiceRow(ctx, layout, cursorY, line, fonts);
                rowsOnCurrentPage++;

                BigDecimal lineNett = lineNetBasis(line);
                BigDecimal lineGross = lineGrossTotal(line);
                totalNett  = totalNett.add(lineNett);
                totalGross = totalGross.add(lineGross);
            }

            float tableFlowOffset = tableFlowOffset(layout, rowsOnCurrentPage);
            drawFooter(ctx, layout, cursorY, totalNett, totalGross, req, selectedLocale, fonts, tableFlowOffset);
            drawVatBreakdownTable(ctx, layout, req, selectedLocale, fonts, tableFlowOffset);
            drawSignature(ctx, layout, signatureBytes, tableFlowOffset);
            drawPaymentQr(ctx, layout, req, tableFlowOffset);
            drawFiscalQr(ctx, layout, req, tableFlowOffset);

            ctx.closeStream();
            doc.save(out);
            return out.toByteArray();

        } catch (IOException e) {
            throw new RuntimeException("Unable to generate folio PDF", e);
        }
    }

    private FontSet loadFonts(PDDocument doc) throws IOException {
        try (
                var regularFontStream = FolioPdfService.class.getResourceAsStream(FONT_REGULAR_CLASSPATH);
                var boldFontStream = FolioPdfService.class.getResourceAsStream(FONT_BOLD_CLASSPATH)
        ) {
            if (regularFontStream == null) {
                throw new IOException("Missing font resource: " + FONT_REGULAR_CLASSPATH);
            }
            if (boldFontStream == null) {
                throw new IOException("Missing font resource: " + FONT_BOLD_CLASSPATH);
            }
            PDFont regular = PDType0Font.load(doc, regularFontStream, true);
            PDFont bold = PDType0Font.load(doc, boldFontStream, true);
            return new FontSet(regular, bold);
        }
    }

    /* ────────────────────────── logo ────────────────────────── */

    private void drawLogo(PageContext ctx, FolioLayoutConfig layout, byte[] logoBytes) throws IOException {
        if (logoBytes == null || logoBytes.length == 0) return;
        var logoCfg = layout.getLogo();
        if (logoCfg == null || !logoCfg.isVisible()) return;

        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, logoBytes, "logo");
        float pageH = layout.getPageHeight();
        float pdfY = pageH - logoCfg.getY() - logoCfg.getHeight();
        ctx.stream.drawImage(img, logoCfg.getX(), pdfY, logoCfg.getWidth(), logoCfg.getHeight());
    }

    /* ────────────────────────── header fields ────────────────────────── */

    private void drawHeaderFields(
            PageContext ctx,
            FolioLayoutConfig layout,
            FolioPdfRequest req,
            String locale,
            FontSet fonts
    ) throws IOException {
        Map<String, String> values = new HashMap<>();
        values.put("companyName", req.getCompanyName());
        values.put("companyAddress", req.getCompanyAddress());
        values.put("companyPostalCode", req.getCompanyPostalCode());
        values.put("companyCity", req.getCompanyCity());
        values.put("companyTaxId", req.getCompanyTaxId());
        values.put("folioNumber", req.getFolioNumber());
        values.put("folioDate", req.getFolioDate());
        values.put("dateOfService", req.getDateOfService());
        values.put("dueDate", req.getDueDate());
        values.put("fiscalZoi", req.getFiscalZoi());
        values.put("fiscalEor", req.getFiscalEor());
        values.put("recipientName", req.getRecipientName());
        values.put("recipientAddress", req.getRecipientAddress());
        values.put("recipientPostalCode", req.getRecipientPostalCode());
        values.put("recipientCity", req.getRecipientCity());
        values.put("recipientVatId", req.getRecipientVatId());

        float pageH = layout.getPageHeight();
        for (var field : layout.getFields()) {
            if (!field.isVisible()) continue;
            String text;
            if ("custom".equals(field.getType())) {
                text = safe(resolveLocalized(field.getTextI18n(), field.getText(), locale));
            } else {
                text = values.getOrDefault(field.getKey(), "");
                if (isDateFieldKey(field.getKey())) {
                    text = formatDateValue(text, field.getDateFormat());
                }
                text = safe(text);
            }
            if (text == null || text.isBlank()) continue;

            PDFont font = field.isBold() ? fonts.bold() : fonts.regular();
            float pdfY = pageH - field.getY() - field.getFontSize();
            String prefix = safe(resolveLocalized(field.getPrefixI18n(), "", locale));

            if (prefix != null && !prefix.isBlank()) {
                drawText(ctx, font, field.getFontSize(), field.getX(), pdfY, prefix);
                if ("right".equals(field.getAlignment())) {
                    drawTextRight(ctx, font, field.getFontSize(), field.getX() + field.getWidth(), pdfY, text);
                } else {
                    float prefixWidth = font.getStringWidth(prefix + " ") / 1000f * field.getFontSize();
                    drawText(ctx, font, field.getFontSize(), field.getX() + prefixWidth, pdfY, text);
                }
            } else if ("right".equals(field.getAlignment())) {
                float rightEdge = field.getX() + field.getWidth();
                drawTextRight(ctx, font, field.getFontSize(), rightEdge, pdfY, text);
            } else if ("center".equals(field.getAlignment())) {
                float tw = font.getStringWidth(text) / 1000f * field.getFontSize();
                float cx = field.getX() + (field.getWidth() - tw) / 2f;
                drawText(ctx, font, field.getFontSize(), cx, pdfY, text);
            } else {
                drawText(ctx, font, field.getFontSize(), field.getX(), pdfY, text);
            }
        }
    }

    /* ────────────────────────── table ────────────────────────── */

    private float drawTableHeader(PageContext ctx, FolioLayoutConfig layout, float y, String locale, FontSet fonts) throws IOException {
        var tbl = layout.getTable();
        int fs = tbl.getHeaderFontSize();
        y -= 6;

        for (var col : tbl.getColumns()) {
            float colX = tbl.getStartX() + col.getRelX();
            String label = resolveLocalized(col.getLabelI18n(), col.getLabel(), locale);
            if ("right".equals(col.getAlignment())) {
                drawTextRight(ctx, fonts.bold(), fs, colX + col.getWidth(), y, label);
            } else {
                drawText(ctx, fonts.bold(), fs, colX, y, label);
            }
        }

        y -= 4;
        drawHLine(ctx, tbl.getStartX(), tbl.getStartX() + tbl.getWidth(), y, 0.5f);
        y -= tbl.getRowHeight() * 0.6f;
        return y;
    }

    private float drawServiceRow(
            PageContext ctx,
            FolioLayoutConfig layout,
            float y,
            FolioPdfRequest.ServiceLine line,
            FontSet fonts
    ) throws IOException {
        var tbl = layout.getTable();
        int fs = tbl.getBodyFontSize();
        Map<String, String> cellValues = new HashMap<>();
        String desc = safe(line.getDescription());
        if (desc.length() > 50) desc = desc.substring(0, 50) + "...";
        cellValues.put("date", safe(line.getDate()));
        cellValues.put("description", desc);
        cellValues.put("qty", String.valueOf(line.getQty()));
        cellValues.put("nett", fmt(line.getNettPrice()));
        cellValues.put("gross", fmt(line.getGrossPrice()));
        cellValues.put("taxPercent", safe(line.getTaxPercent()));
        cellValues.put("taxAmount", fmt(line.getTaxAmount()));
        cellValues.put("total", fmt(line.getTotalPrice()));

        for (var col : tbl.getColumns()) {
            String text = cellValues.getOrDefault(col.getKey(), "");
            if ("date".equals(col.getKey())) {
                text = formatDateValue(text, col.getDateFormat());
            }
            float colX = tbl.getStartX() + col.getRelX();
            if ("right".equals(col.getAlignment())) {
                drawTextRight(ctx, fonts.regular(), fs, colX + col.getWidth(), y, text);
            } else {
                drawText(ctx, fonts.regular(), fs, colX, y, text);
            }
        }

        y -= tbl.getRowHeight();
        return y;
    }

    /* ────────────────────────── footer ────────────────────────── */

    private void drawFooter(PageContext ctx, FolioLayoutConfig layout, float lastRowY,
                            BigDecimal totalNett, BigDecimal totalGross,
                            FolioPdfRequest req,
                            String locale,
                            FontSet fonts,
                            float tableFlowOffset) throws IOException {
        var tbl = layout.getTable();
        var ftr = layout.getFooter();
        float y = lastRowY - ftr.getGapAfterTable();

        drawHLine(ctx, tbl.getStartX(), tbl.getStartX() + tbl.getWidth(), y, 0.75f);
        y -= ftr.getLineSpacing() + 2;

        float rightEdge = tbl.getStartX() + tbl.getWidth();
        float leftEdge = tbl.getStartX();
        float pageH = layout.getPageHeight();

        Map<String, String> footerValues = new HashMap<>();
        footerValues.put("totalNett", fmtEur(totalNett));
        footerValues.put("totalGross", fmtEur(totalGross));
        List<VatBreakdownRow> vatRows = buildVatBreakdownRows(req.getServices());
        footerValues.put("vat22", fmtEur(vatBreakdownAmount(vatRows, VatBreakdownBucket.VAT_22)));
        footerValues.put("vat95", fmtEur(vatBreakdownAmount(vatRows, VatBreakdownBucket.VAT_9_5)));
        footerValues.put("vat0", fmtEur(vatBreakdownAmount(vatRows, VatBreakdownBucket.VAT_0)));
        footerValues.put("noVat", fmtEur(vatBreakdownAmount(vatRows, VatBreakdownBucket.NO_VAT)));
        if (req.getNotes() != null && !req.getNotes().isBlank())
            footerValues.put("notes", safe(req.getNotes()));
        List<String> paymentLines = paymentFooterLines(req);
        if (!paymentLines.isEmpty())
            footerValues.put("payment", safe(paymentLines.get(0)));
        if (req.getIban() != null && !req.getIban().isBlank())
            footerValues.put("iban", safe(req.getIban()));
        if (req.getIssuedBy() != null && !req.getIssuedBy().isBlank())
            footerValues.put("issuedBy", safe(req.getIssuedBy()));
        if (req.getFiscalZoi() != null && !req.getFiscalZoi().isBlank())
            footerValues.put("fiscalZoi", safe(req.getFiscalZoi()));
        if (req.getFiscalEor() != null && !req.getFiscalEor().isBlank())
            footerValues.put("fiscalEor", safe(req.getFiscalEor()));

        for (var item : ftr.getItems()) {
            if ("payment".equals(item.getKey())) {
                if (paymentLines.isEmpty()) continue;
                String label = resolveLocalized(item.getLabelI18n(), item.getLabel(), locale);
                PDFont font = item.isBold() ? fonts.bold() : fonts.regular();
                float lineGap = Math.max(item.getFontSize() + 3, Math.min(ftr.getLineSpacing(), 14));

                if (item.getX() >= 0 && item.getY() >= 0) {
                    float itemY = shiftedBelowServicesTableY(item.getY(), layout, tableFlowOffset);
                    float firstLineY = itemY - (lineGap * Math.max(0, paymentLines.size() - 1));
                    float itemRight = item.getWidth() > 0 ? item.getX() + item.getWidth() : rightEdge;
                    for (int i = 0; i < paymentLines.size(); i++) {
                        String value = paymentLines.get(i);
                        String text = (i == 0 && label != null && !label.isBlank()) ? (label + ": " + value) : value;
                        float absY = pageH - (firstLineY + lineGap * i) - item.getFontSize();
                        if ("right".equals(item.getAlignment())) {
                            drawTextRight(ctx, font, item.getFontSize(), itemRight, absY, text);
                        } else {
                            drawText(ctx, font, item.getFontSize(), item.getX(), absY, text);
                        }
                    }
                } else {
                    for (int i = 0; i < paymentLines.size(); i++) {
                        String value = paymentLines.get(i);
                        String text = (i == 0 && label != null && !label.isBlank()) ? (label + ": " + value) : value;
                        if ("right".equals(item.getAlignment())) {
                            drawTextRight(ctx, font, item.getFontSize(), rightEdge, y, text);
                        } else {
                            drawText(ctx, font, item.getFontSize(), leftEdge, y, text);
                        }
                        y -= ftr.getLineSpacing();
                    }
                }
                continue;
            }

            String value = footerValues.get(item.getKey());
            if (value == null || value.isBlank()) continue;
            String label = resolveLocalized(item.getLabelI18n(), item.getLabel(), locale);
            String text = (label == null || label.isBlank()) ? value : (label + ": " + value);

            PDFont font = item.isBold() ? fonts.bold() : fonts.regular();

            // Use absolute positioning when x/y are set (>= 0), otherwise fall back to sequential layout
            if (item.getX() >= 0 && item.getY() >= 0) {
                float itemY = shiftedBelowServicesTableY(item.getY(), layout, tableFlowOffset);
                float absY = pageH - itemY - item.getFontSize();
                if ("right".equals(item.getAlignment())) {
                    float itemRight = item.getWidth() > 0 ? item.getX() + item.getWidth() : rightEdge;
                    drawTextRight(ctx, font, item.getFontSize(), itemRight, absY, text);
                } else {
                    drawText(ctx, font, item.getFontSize(), item.getX(), absY, text);
                }
            } else {
                if ("right".equals(item.getAlignment())) {
                    drawTextRight(ctx, font, item.getFontSize(), rightEdge, y, text);
                } else {
                    drawText(ctx, font, item.getFontSize(), leftEdge, y, text);
                }
                y -= ftr.getLineSpacing();
            }
        }
    }

    private List<String> paymentFooterLines(FolioPdfRequest req) {
        var lines = new ArrayList<String>();
        if (req != null && req.getPaymentMethods() != null) {
            for (FolioPdfRequest.PaymentLine line : req.getPaymentMethods()) {
                if (line == null) continue;
                String name = safe(line.getName());
                BigDecimal amount = line.getAmountGross();
                if (name.isBlank() && amount == null) continue;
                if (name.isBlank()) name = "Payment";
                lines.add(name + (amount == null ? "" : " " + fmtEur(amount)));
            }
        }
        if (lines.isEmpty() && req != null && req.getPaymentMethod() != null && !req.getPaymentMethod().isBlank()) {
            lines.add(safe(req.getPaymentMethod()));
        }
        return lines;
    }

    /* ────────────────────────── payment QR ────────────────────────── */

    private void drawPaymentQr(PageContext ctx, FolioLayoutConfig layout, FolioPdfRequest req, float tableFlowOffset) throws IOException {
        var qrCfg = layout.getPaymentQr();
        if (qrCfg == null || !qrCfg.isVisible()) return;
        String payload = req.getPaymentQrPayload() == null ? "" : req.getPaymentQrPayload().replace("\r", "");
        if (payload.isBlank()) return;

        byte[] png = createQrPng(payload,
                Math.max(64, Math.round(qrCfg.getWidth())),
                Math.max(64, Math.round(qrCfg.getHeight())));
        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, png, "payment-qr");
        float pageH = layout.getPageHeight();
        float qrY = shiftedBelowServicesTableY(qrCfg.getY(), layout, tableFlowOffset);
        float pdfY = pageH - qrY - qrCfg.getHeight();
        ctx.stream.drawImage(img, qrCfg.getX(), pdfY, qrCfg.getWidth(), qrCfg.getHeight());
    }

    private void drawFiscalQr(PageContext ctx, FolioLayoutConfig layout, FolioPdfRequest req, float tableFlowOffset) throws IOException {
        var qrCfg = layout.getFiscalQr();
        if (qrCfg == null || !qrCfg.isVisible()) return;
        String payload = req.getFiscalQr() == null ? "" : req.getFiscalQr().replace("\r", "");
        if (payload.isBlank()) return;

        byte[] png = createQrPng(payload,
                Math.max(64, Math.round(qrCfg.getWidth())),
                Math.max(64, Math.round(qrCfg.getHeight())));
        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, png, "fiscal-qr");
        float pageH = layout.getPageHeight();
        float qrY = shiftedBelowServicesTableY(qrCfg.getY(), layout, tableFlowOffset);
        float pdfY = pageH - qrY - qrCfg.getHeight();
        ctx.stream.drawImage(img, qrCfg.getX(), pdfY, qrCfg.getWidth(), qrCfg.getHeight());
    }

    /* ────────────────────────── VAT breakdown table ────────────────────────── */

    private void drawVatBreakdownTable(
            PageContext ctx,
            FolioLayoutConfig layout,
            FolioPdfRequest req,
            String locale,
            FontSet fonts,
            float tableFlowOffset
    ) throws IOException {
        var cfg = layout.getVatBreakdownTable();
        if (cfg == null || !cfg.isVisible()) return;

        List<VatBreakdownRow> rows = buildVatBreakdownRows(req.getServices());
        if (rows.isEmpty()) return;

        float x = cfg.getX();
        float yTopFromPageTop = shiftedBelowServicesTableY(cfg.getY(), layout, tableFlowOffset);
        float width = Math.max(160, cfg.getWidth());
        float headerH = Math.max(10, cfg.getHeaderHeight());
        float rowH = Math.max(10, cfg.getRowHeight());
        int headerFs = Math.max(6, cfg.getHeaderFontSize());
        int bodyFs = Math.max(6, cfg.getBodyFontSize());
        float topY = layout.getPageHeight() - yTopFromPageTop;
        float bottomY = topY - headerH - rowH * rows.size();

        float descW = width * 0.34f;
        float rateW = width * 0.18f;
        float basisW = width * 0.24f;
        float c1 = x;
        float c2 = c1 + descW;
        float c3 = c2 + rateW;
        float c4 = c3 + basisW;
        float right = x + width;

        drawHLine(ctx, x, right, topY, 0.5f);
        drawHLine(ctx, x, right, topY - headerH, 0.5f);
        drawHLine(ctx, x, right, bottomY, 0.5f);
        drawVLine(ctx, x, topY, bottomY, 0.5f);
        drawVLine(ctx, c2, topY, bottomY, 0.5f);
        drawVLine(ctx, c3, topY, bottomY, 0.5f);
        drawVLine(ctx, c4, topY, bottomY, 0.5f);
        drawVLine(ctx, right, topY, bottomY, 0.5f);

        String[] labels = localizedVatTableColumnLabels(locale);
        float headerTextY = rowTextBaseline(topY, headerH, headerFs);
        drawText(ctx, fonts.bold(), headerFs, c1 + 3, headerTextY, labels[0]);
        drawText(ctx, fonts.bold(), headerFs, c2 + 3, headerTextY, labels[1]);
        drawTextRight(ctx, fonts.bold(), headerFs, c3 + basisW - 3, headerTextY, labels[2]);
        drawTextRight(ctx, fonts.bold(), headerFs, right - 3, headerTextY, labels[3]);

        for (int i = 0; i < rows.size(); i++) {
            var row = rows.get(i);
            float rowTop = topY - headerH - rowH * i;
            float rowBottom = rowTop - rowH;
            drawHLine(ctx, x, right, rowBottom, 0.25f);
            float textY = rowTextBaseline(rowTop, rowH, bodyFs);
            drawText(ctx, fonts.regular(), bodyFs, c1 + 3, textY, localizedVatBreakdownLabel(row.bucket(), locale));
            drawText(ctx, fonts.regular(), bodyFs, c2 + 3, textY, vatRateLabel(row.bucket(), locale));
            drawTextRight(ctx, fonts.regular(), bodyFs, c3 + basisW - 3, textY, fmtEur(row.netBasis()));
            drawTextRight(ctx, fonts.regular(), bodyFs, right - 3, textY, fmtEur(row.vatAmount()));
        }
    }

    private byte[] createQrPng(String payload, int width, int height) throws IOException {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.MARGIN, 0);
            hints.put(EncodeHintType.CHARACTER_SET, "ISO-8859-2");
            hints.put(EncodeHintType.QR_VERSION, 15);
            hints.put(EncodeHintType.ERROR_CORRECTION, com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M);
            BitMatrix matrix = new MultiFormatWriter().encode(payload, BarcodeFormat.QR_CODE, width, height, hints);
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            for (int x = 0; x < width; x++) {
                for (int y = 0; y < height; y++) {
                    image.setRGB(x, y, matrix.get(x, y) ? Color.BLACK.getRGB() : Color.WHITE.getRGB());
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "PNG", out);
            return out.toByteArray();
        } catch (WriterException ex) {
            throw new IOException("Unable to render payment QR", ex);
        }
    }

    /* ────────────────────────── signature ────────────────────────── */

    private void drawSignature(PageContext ctx, FolioLayoutConfig layout, byte[] signatureBytes, float tableFlowOffset) throws IOException {
        if (signatureBytes == null || signatureBytes.length == 0) return;
        var sigCfg = layout.getSignature();
        if (sigCfg == null || !sigCfg.isVisible()) return;

        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, signatureBytes, "signature");
        float pageH = layout.getPageHeight();
        float sigY = shiftedBelowServicesTableY(sigCfg.getY(), layout, tableFlowOffset);
        float pdfY = pageH - sigY - sigCfg.getHeight();
        ctx.stream.drawImage(img, sigCfg.getX(), pdfY, sigCfg.getWidth(), sigCfg.getHeight());
    }

    /* ────────────────────────── drawing primitives ────────────────────────── */

    private void drawText(PageContext ctx, PDFont font, int size, float x, float y, String text) throws IOException {
        if (text == null || text.isBlank()) return;
        var s = ctx.stream;
        s.beginText();
        s.setFont(font, size);
        s.newLineAtOffset(x, y);
        s.showText(text);
        s.endText();
    }

    private void drawTextRight(PageContext ctx, PDFont font, int size, float rightX, float y, String text) throws IOException {
        if (text == null || text.isBlank()) return;
        float tw = font.getStringWidth(text) / 1000f * size;
        drawText(ctx, font, size, rightX - tw, y, text);
    }

    private void drawHLine(PageContext ctx, float x1, float x2, float y, float lineWidth) throws IOException {
        var s = ctx.stream;
        s.setLineWidth(lineWidth);
        s.moveTo(x1, y);
        s.lineTo(x2, y);
        s.stroke();
    }

    private void drawVLine(PageContext ctx, float x, float yTop, float yBottom, float lineWidth) throws IOException {
        var s = ctx.stream;
        s.setLineWidth(lineWidth);
        s.moveTo(x, yTop);
        s.lineTo(x, yBottom);
        s.stroke();
    }

    /* ────────────────────────── formatting helpers ────────────────────────── */

    private static String fmt(BigDecimal v) {
        if (v == null) return "0.00";
        return v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String fmtEur(BigDecimal v) {
        return "EUR " + fmt(v);
    }

    private static List<VatBreakdownRow> buildVatBreakdownRows(List<FolioPdfRequest.ServiceLine> lines) {
        Map<VatBreakdownBucket, BigDecimal> netTotals = new EnumMap<>(VatBreakdownBucket.class);
        Map<VatBreakdownBucket, BigDecimal> vatTotals = new EnumMap<>(VatBreakdownBucket.class);
        Map<VatBreakdownBucket, Integer> counts = new EnumMap<>(VatBreakdownBucket.class);
        for (VatBreakdownBucket bucket : VatBreakdownBucket.values()) {
            netTotals.put(bucket, BigDecimal.ZERO);
            vatTotals.put(bucket, BigDecimal.ZERO);
            counts.put(bucket, 0);
        }
        if (lines != null) {
            for (var line : lines) {
                VatBreakdownBucket bucket = classifyVatBreakdownBucket(line.getTaxPercent());
                BigDecimal netBasis = lineNetBasis(line);
                BigDecimal vatAmount = lineVatAmount(line, netBasis);
                netTotals.put(bucket, netTotals.getOrDefault(bucket, BigDecimal.ZERO).add(netBasis));
                vatTotals.put(bucket, vatTotals.getOrDefault(bucket, BigDecimal.ZERO).add(vatAmount));
                counts.put(bucket, counts.getOrDefault(bucket, 0) + 1);
            }
        }

        List<VatBreakdownRow> rows = new ArrayList<>();
        for (VatBreakdownBucket bucket : List.of(
                VatBreakdownBucket.VAT_22,
                VatBreakdownBucket.VAT_9_5,
                VatBreakdownBucket.VAT_0
        )) {
            BigDecimal net = netTotals.getOrDefault(bucket, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            BigDecimal vat = vatTotals.getOrDefault(bucket, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            int count = counts.getOrDefault(bucket, 0);
            if (net.compareTo(BigDecimal.ZERO) != 0 || vat.compareTo(BigDecimal.ZERO) != 0) {
                rows.add(new VatBreakdownRow(bucket, net, vat, count));
            }
        }
        return rows;
    }

    private static BigDecimal vatBreakdownAmount(List<VatBreakdownRow> rows, VatBreakdownBucket bucket) {
        return rows.stream()
                .filter(row -> row.bucket() == bucket)
                .map(VatBreakdownRow::vatAmount)
                .findFirst()
                .orElse(BigDecimal.ZERO)
                .setScale(2, RoundingMode.HALF_UP);
    }

    private static VatBreakdownBucket classifyVatBreakdownBucket(String taxPercentRaw) {
        String value = taxPercentRaw == null ? "" : taxPercentRaw.trim().toUpperCase(Locale.ROOT);
        if (value.contains("22")) return VatBreakdownBucket.VAT_22;
        if (value.contains("9.5") || value.contains("9,5")) return VatBreakdownBucket.VAT_9_5;
        return VatBreakdownBucket.VAT_0;
    }

    private static String localizedVatBreakdownLabel(VatBreakdownBucket bucket, String locale) {
        boolean sl = "sl".equals(normalizeLocale(locale));
        return switch (bucket) {
            case VAT_22 -> sl ? "DDV 22%" : "VAT 22%";
            case VAT_9_5 -> sl ? "DDV 9,5%" : "VAT 9.5%";
            case VAT_0, NO_VAT -> sl ? "DDV 0%" : "VAT 0%";
        };
    }

    private static String vatRateLabel(VatBreakdownBucket bucket, String locale) {
        boolean sl = "sl".equals(normalizeLocale(locale));
        return switch (bucket) {
            case VAT_22 -> "22%";
            case VAT_9_5 -> sl ? "9,5%" : "9.5%";
            case VAT_0, NO_VAT -> "0%";
        };
    }

    private static String[] localizedVatTableColumnLabels(String locale) {
        boolean sl = "sl".equals(normalizeLocale(locale));
        return sl
                ? new String[] { "Opis DDV", "Stopnja DDV", "Osnova DDV", "Vrednost DDV" }
                : new String[] { "VAT description", "VAT rate", "VAT basis", "VAT amount" };
    }

    private static BigDecimal lineNetBasis(FolioPdfRequest.ServiceLine line) {
        if (line == null) return BigDecimal.ZERO;
        BigDecimal net = line.getNettPrice() == null ? BigDecimal.ZERO : line.getNettPrice();
        return net.multiply(BigDecimal.valueOf(Math.max(0, line.getQty()))).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal lineGrossTotal(FolioPdfRequest.ServiceLine line) {
        if (line == null) return BigDecimal.ZERO;
        if (line.getTotalPrice() != null) return line.getTotalPrice().setScale(2, RoundingMode.HALF_UP);
        BigDecimal gross = line.getGrossPrice() == null ? BigDecimal.ZERO : line.getGrossPrice();
        return gross.multiply(BigDecimal.valueOf(Math.max(0, line.getQty()))).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal lineVatAmount(FolioPdfRequest.ServiceLine line, BigDecimal netBasis) {
        if (line == null) return BigDecimal.ZERO;
        if (line.getTaxAmount() != null) return line.getTaxAmount().setScale(2, RoundingMode.HALF_UP);
        return lineGrossTotal(line).subtract(netBasis == null ? BigDecimal.ZERO : netBasis).setScale(2, RoundingMode.HALF_UP);
    }

    private static float tableFlowOffset(FolioLayoutConfig layout, int rowsOnCurrentPage) {
        var tbl = layout.getTable();
        int extraRows = Math.max(0, rowsOnCurrentPage - LAYOUT_PREVIEW_SERVICE_ROWS);
        return extraRows * tbl.getRowHeight();
    }

    private static float shiftedBelowServicesTableY(float originalY, FolioLayoutConfig layout, float tableFlowOffset) {
        if (tableFlowOffset <= 0) return originalY;
        var tbl = layout.getTable();
        float baselineTableBottom = tbl.getStartY() + tbl.getHeaderHeight() + (tbl.getRowHeight() * LAYOUT_PREVIEW_SERVICE_ROWS) + tbl.getFooterSpacing();
        return originalY >= baselineTableBottom ? originalY + tableFlowOffset : originalY;
    }

    private static float rowTextBaseline(float rowTop, float rowHeight, int fontSize) {
        return rowTop - rowHeight + ((rowHeight - fontSize) / 2f) + 2f;
    }

    private static String normalizeLocale(String locale) {
        if (locale == null || locale.isBlank()) return "en";
        String value = locale.toLowerCase(Locale.ROOT);
        if (value.startsWith("sl")) return "sl";
        return "en";
    }

    private static String resolveLocalized(FolioLayoutConfig.LocalizedText i18n, String legacy, String locale) {
        String safeLegacy = safe(legacy);
        if (i18n == null) return safeLegacy;
        String primary = "sl".equals(locale) ? safe(i18n.getSl()) : safe(i18n.getEn());
        if (primary != null && !primary.isBlank()) return primary;
        if (safeLegacy != null && !safeLegacy.isBlank()) return safeLegacy;
        String secondary = "sl".equals(locale) ? safe(i18n.getEn()) : safe(i18n.getSl());
        return secondary == null ? "" : secondary;
    }

    private static boolean isDateFieldKey(String key) {
        return "folioDate".equals(key) || "dateOfService".equals(key) || "dueDate".equals(key);
    }

    private static String formatDateValue(String raw, String configuredFormat) {
        if (raw == null || raw.isBlank()) return "";
        String format = configuredFormat == null || configuredFormat.isBlank() ? "YYYY-MM-DD" : configuredFormat;
        boolean includeTime = format.contains("HH");
        if (includeTime) {
            LocalDateTime parsedDateTime = parseDateTime(raw.trim());
            if (parsedDateTime == null) {
                LocalDate parsedDate = parseDate(raw.trim());
                parsedDateTime = parsedDate == null ? null : parsedDate.atStartOfDay();
            }
            if (parsedDateTime == null) return raw;
            return switch (format) {
                case "DD-MM-YYYY HH:mm" -> parsedDateTime.format(DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm"));
                case "DD.MM.YYYY HH:mm" -> parsedDateTime.format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"));
                case "YYYY-MM-DD HH:mm" -> parsedDateTime.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
                default -> parsedDateTime.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
            };
        }

        LocalDate parsed = parseDate(raw.trim());
        if (parsed == null) return raw;
        return switch (format) {
            case "DD-MM-YYYY" -> parsed.format(DateTimeFormatter.ofPattern("dd-MM-yyyy"));
            case "DD.MM.YYYY" -> parsed.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"));
            case "YYYY-MM-DD" -> parsed.format(DateTimeFormatter.ISO_LOCAL_DATE);
            default -> parsed.format(DateTimeFormatter.ISO_LOCAL_DATE);
        };
    }

    private static LocalDateTime parseDateTime(String value) {
        String v = value.trim();
        try {
            return LocalDateTime.parse(v, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (DateTimeParseException ignored) {
            // continue
        }
        try {
            return Instant.parse(v).atZone(ZoneId.systemDefault()).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            // continue
        }
        try {
            return OffsetDateTime.parse(v).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            // continue
        }
        try {
            return ZonedDateTime.parse(v).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            // continue
        }

        DateTimeFormatter[] formats = new DateTimeFormatter[] {
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
                DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm"),
                DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm:ss"),
                DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"),
                DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm:ss"),
                DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"),
                DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm")
        };
        for (DateTimeFormatter formatter : formats) {
            try {
                return LocalDateTime.parse(v, formatter);
            } catch (DateTimeParseException ignored) {
                // try next format
            }
        }
        return null;
    }

    private static LocalDate parseDate(String value) {
        String v = value.trim();
        // Common API / DB string shapes that are not plain ISO dates
        try {
            return LocalDateTime.parse(v, DateTimeFormatter.ISO_LOCAL_DATE_TIME).toLocalDate();
        } catch (DateTimeParseException ignored) {
            // continue
        }
        try {
            return Instant.parse(v).atZone(ZoneId.systemDefault()).toLocalDate();
        } catch (DateTimeParseException ignored) {
            // continue
        }
        try {
            return OffsetDateTime.parse(v).toLocalDate();
        } catch (DateTimeParseException ignored) {
            // continue
        }
        try {
            return ZonedDateTime.parse(v).toLocalDate();
        } catch (DateTimeParseException ignored) {
            // continue
        }

        DateTimeFormatter[] formats = new DateTimeFormatter[] {
                DateTimeFormatter.ISO_LOCAL_DATE,
                DateTimeFormatter.ofPattern("dd-MM-yyyy"),
                DateTimeFormatter.ofPattern("dd.MM.yyyy"),
                DateTimeFormatter.ofPattern("dd/MM/yyyy"),
                DateTimeFormatter.ofPattern("yyyy/MM/dd")
        };
        for (DateTimeFormatter formatter : formats) {
            try {
                return LocalDate.parse(v, formatter);
            } catch (DateTimeParseException ignored) {
                // try next format
            }
        }
        return null;
    }

    private static String safe(String v) {
        if (v == null) return "";
        String s = v.trim();
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch == '\r') continue;
            if (ch == '\n' || ch == '\t' || !Character.isISOControl(ch)) {
                out.append(ch);
            }
        }
        return out.toString();
    }

    /* ────────────────────────── page context ────────────────────────── */

    private static class PageContext {
        final PDDocument doc;
        final float pageW;
        final float pageH;
        PDPageContentStream stream;

        PageContext(PDDocument doc, float pageW, float pageH) {
            this.doc = doc;
            this.pageW = pageW;
            this.pageH = pageH;
        }

        void newPage() throws IOException {
            var rect = new PDRectangle(pageW, pageH);
            var page = new PDPage(rect);
            doc.addPage(page);
            stream = new PDPageContentStream(doc, page);
        }

        void closeStream() throws IOException {
            if (stream != null) { stream.close(); stream = null; }
        }
    }

    private record FontSet(PDFont regular, PDFont bold) {
    }
}
