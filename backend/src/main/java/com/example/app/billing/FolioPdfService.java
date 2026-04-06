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
import java.text.Normalizer;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
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

    private static final PDType1Font FONT =
            new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private static final PDType1Font FONT_BOLD =
            new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);

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
        float pageH = layout.getPageHeight();
        float pageW = layout.getPageWidth();
        var tbl = layout.getTable();

        try (var doc = new PDDocument(); var out = new ByteArrayOutputStream()) {
            var ctx = new PageContext(doc, pageW, pageH);
            ctx.newPage();

            drawLogo(ctx, layout, logoBytes);
            drawHeaderFields(ctx, layout, req);

            // Table: Y in the config is distance from page top; convert to PDF coords
            float cursorY = pageH - tbl.getStartY();
            cursorY = drawTableHeader(ctx, layout, cursorY);

            List<FolioPdfRequest.ServiceLine> lines = req.getServices();
            BigDecimal totalNett = BigDecimal.ZERO;
            BigDecimal totalGross = BigDecimal.ZERO;

            for (var line : lines) {
                if (cursorY - tbl.getRowHeight() < BOTTOM_MARGIN) {
                    ctx.closeStream();
                    ctx.newPage();
                    cursorY = pageH - 50; // top margin on continuation pages
                    cursorY = drawTableHeader(ctx, layout, cursorY);
                }
                cursorY = drawServiceRow(ctx, layout, cursorY, line);

                BigDecimal lineNett  = (line.getNettPrice()  != null ? line.getNettPrice()  : BigDecimal.ZERO)
                        .multiply(BigDecimal.valueOf(line.getQty()));
                BigDecimal lineGross = line.getTotalPrice() != null ? line.getTotalPrice()
                        : (line.getGrossPrice() != null ? line.getGrossPrice() : BigDecimal.ZERO)
                                .multiply(BigDecimal.valueOf(line.getQty()));
                totalNett  = totalNett.add(lineNett);
                totalGross = totalGross.add(lineGross);
            }

            drawFooter(ctx, layout, cursorY, totalNett, totalGross, req);
            drawSignature(ctx, layout, signatureBytes);
            drawPaymentQr(ctx, layout, req);

            ctx.closeStream();
            doc.save(out);
            return out.toByteArray();

        } catch (IOException e) {
            throw new RuntimeException("Unable to generate folio PDF", e);
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

    private void drawHeaderFields(PageContext ctx, FolioLayoutConfig layout, FolioPdfRequest req) throws IOException {
        Map<String, String> values = new HashMap<>();
        values.put("companyName",       safe(req.getCompanyName()));
        values.put("companyAddress",    safe(req.getCompanyAddress()));
        values.put("companyPostalCode", safe(req.getCompanyPostalCode()));
        values.put("companyCity",       safe(req.getCompanyCity()));
        values.put("companyTaxId",      safe(req.getCompanyTaxId()));
        values.put("folioNumber",       safe(req.getFolioNumber()));
        values.put("folioDate",         safe(req.getFolioDate()));
        values.put("dateOfService",     safe(req.getDateOfService()));
        values.put("dueDate",           safe(req.getDueDate()));
        values.put("recipientName",     safe(req.getRecipientName()));
        values.put("recipientAddress",  safe(req.getRecipientAddress()));
        values.put("recipientPostalCode", safe(req.getRecipientPostalCode()));
        values.put("recipientCity",     safe(req.getRecipientCity()));
        values.put("recipientVatId",    safe(req.getRecipientVatId()));

        float pageH = layout.getPageHeight();
        for (var field : layout.getFields()) {
            if (!field.isVisible()) continue;
            String text;
            if ("custom".equals(field.getType())) {
                text = safe(field.getText());
            } else {
                text = values.getOrDefault(field.getKey(), "");
            }
            if (text == null || text.isBlank()) continue;

            PDType1Font font = field.isBold() ? FONT_BOLD : FONT;
            float pdfY = pageH - field.getY() - field.getFontSize();

            if ("right".equals(field.getAlignment())) {
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

    private float drawTableHeader(PageContext ctx, FolioLayoutConfig layout, float y) throws IOException {
        var tbl = layout.getTable();
        int fs = tbl.getHeaderFontSize();
        y -= 6;

        for (var col : tbl.getColumns()) {
            float colX = tbl.getStartX() + col.getRelX();
            if ("right".equals(col.getAlignment())) {
                drawTextRight(ctx, FONT_BOLD, fs, colX + col.getWidth(), y, col.getLabel());
            } else {
                drawText(ctx, FONT_BOLD, fs, colX, y, col.getLabel());
            }
        }

        y -= 4;
        drawHLine(ctx, tbl.getStartX(), tbl.getStartX() + tbl.getWidth(), y, 0.5f);
        y -= tbl.getRowHeight() * 0.6f;
        return y;
    }

    private float drawServiceRow(PageContext ctx, FolioLayoutConfig layout, float y,
                                  FolioPdfRequest.ServiceLine line) throws IOException {
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
            float colX = tbl.getStartX() + col.getRelX();
            if ("right".equals(col.getAlignment())) {
                drawTextRight(ctx, FONT, fs, colX + col.getWidth(), y, text);
            } else {
                drawText(ctx, FONT, fs, colX, y, text);
            }
        }

        y -= tbl.getRowHeight();
        return y;
    }

    /* ────────────────────────── footer ────────────────────────── */

    private void drawFooter(PageContext ctx, FolioLayoutConfig layout, float lastRowY,
                            BigDecimal totalNett, BigDecimal totalGross,
                            FolioPdfRequest req) throws IOException {
        var tbl = layout.getTable();
        var ftr = layout.getFooter();
        float y = lastRowY - ftr.getGapAfterTable();

        drawHLine(ctx, tbl.getStartX(), tbl.getStartX() + tbl.getWidth(), y, 0.75f);
        y -= ftr.getLineSpacing() + 2;

        float rightEdge = tbl.getStartX() + tbl.getWidth();
        float leftEdge = tbl.getStartX();
        float pageH = layout.getPageHeight();

        Map<String, String> footerValues = new HashMap<>();
        footerValues.put("totalNett",  "Total nett:  " + fmtEur(totalNett));
        footerValues.put("totalGross", "Total gross: " + fmtEur(totalGross));
        if (req.getNotes() != null && !req.getNotes().isBlank())
            footerValues.put("notes", "Notes: " + safe(req.getNotes()));
        if (req.getPaymentMethod() != null && !req.getPaymentMethod().isBlank())
            footerValues.put("payment", "Payment: " + safe(req.getPaymentMethod()));
        if (req.getIban() != null && !req.getIban().isBlank())
            footerValues.put("iban", "IBAN: " + safe(req.getIban()));
        if (req.getIssuedBy() != null && !req.getIssuedBy().isBlank())
            footerValues.put("issuedBy", "Issued by: " + safe(req.getIssuedBy()));

        for (var item : ftr.getItems()) {
            String text = footerValues.get(item.getKey());
            if (text == null || text.isBlank()) continue;

            PDType1Font font = item.isBold() ? FONT_BOLD : FONT;

            // Use absolute positioning when x/y are set (>= 0), otherwise fall back to sequential layout
            if (item.getX() >= 0 && item.getY() >= 0) {
                float absY = pageH - item.getY() - item.getFontSize();
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

    /* ────────────────────────── payment QR ────────────────────────── */

    private void drawPaymentQr(PageContext ctx, FolioLayoutConfig layout, FolioPdfRequest req) throws IOException {
        var qrCfg = layout.getPaymentQr();
        if (qrCfg == null || !qrCfg.isVisible()) return;
        String payload = req.getPaymentQrPayload() == null ? "" : req.getPaymentQrPayload().replace("\r", "");
        if (payload.isBlank()) return;

        byte[] png = createQrPng(payload,
                Math.max(64, Math.round(qrCfg.getWidth())),
                Math.max(64, Math.round(qrCfg.getHeight())));
        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, png, "payment-qr");
        float pageH = layout.getPageHeight();
        float pdfY = pageH - qrCfg.getY() - qrCfg.getHeight();
        ctx.stream.drawImage(img, qrCfg.getX(), pdfY, qrCfg.getWidth(), qrCfg.getHeight());
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

    private void drawSignature(PageContext ctx, FolioLayoutConfig layout, byte[] signatureBytes) throws IOException {
        if (signatureBytes == null || signatureBytes.length == 0) return;
        var sigCfg = layout.getSignature();
        if (sigCfg == null || !sigCfg.isVisible()) return;

        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, signatureBytes, "signature");
        float pageH = layout.getPageHeight();
        float pdfY = pageH - sigCfg.getY() - sigCfg.getHeight();
        ctx.stream.drawImage(img, sigCfg.getX(), pdfY, sigCfg.getWidth(), sigCfg.getHeight());
    }

    /* ────────────────────────── drawing primitives ────────────────────────── */

    private void drawText(PageContext ctx, PDType1Font font, int size, float x, float y, String text) throws IOException {
        if (text == null || text.isBlank()) return;
        var s = ctx.stream;
        s.beginText();
        s.setFont(font, size);
        s.newLineAtOffset(x, y);
        s.showText(text);
        s.endText();
    }

    private void drawTextRight(PageContext ctx, PDType1Font font, int size, float rightX, float y, String text) throws IOException {
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

    /* ────────────────────────── formatting helpers ────────────────────────── */

    private static String fmt(BigDecimal v) {
        if (v == null) return "0.00";
        return v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String fmtEur(BigDecimal v) {
        return "EUR " + fmt(v);
    }

    private static String safe(String v) {
        if (v == null) return "";
        String s = v.replace("\r", "").trim();
        s = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        s = s.replaceAll("[^\\x20-\\x7E\\n]", "");
        return s;
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
}
