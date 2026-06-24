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
    private static final int LAYOUT_PREVIEW_SERVICE_ROWS = 1;
    private static final float DOUBLE_RULE_GAP = 2.0f;
    private static final int PAYMENT_QR_CAPTION_FONT_SIZE = 7;
    private static final float PAYMENT_QR_CAPTION_GAP = 0.0f;

    private enum VatBreakdownBucket {
        VAT_22,
        VAT_9_5,
        VAT_0,
        NO_VAT
    }

    private record VatBreakdownRow(VatBreakdownBucket bucket, BigDecimal netBasis, BigDecimal vatAmount, int lineCount) {}
    private record InvoiceTotals(BigDecimal net, BigDecimal gross) {}
    private record FooterRenderData(Map<String, String> values, List<String> paymentLines) {}
    private record PaymentBlockMetrics(float anchorY, float lineGap, float extraHeight, float x, float width, boolean fixedOnly) {}
    private record SummaryBlockMetrics(float topY, float bottomY, float leftX, float rightX, List<FolioLayoutConfig.FooterItem> items, boolean fixedOnly) {}

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
        if (req == null) throw new IllegalArgumentException("FolioPdfRequest is required");
        layout = FolioLayoutConfig.normalize(layout);
        String selectedLocale = normalizeLocale(locale);
        float pageH = layout.getPageHeight();
        float pageW = layout.getPageWidth();
        var tbl = layout.getTable();

        List<FolioPdfRequest.ServiceLine> lines = req.getServices() == null ? List.of() : req.getServices();
        InvoiceTotals totals = calculateInvoiceTotals(lines);

        try (var doc = new PDDocument(); var out = new ByteArrayOutputStream()) {
            FontSet fonts = loadFonts(doc);
            var ctx = new PageContext(doc, pageW, pageH);
            ctx.newPage();
            drawFixedPageSections(ctx, layout, req, selectedLocale, fonts, logoBytes, signatureBytes, totals);

            drawLogo(ctx, layout, logoBytes, false);
            drawFields(ctx, layout, req, selectedLocale, fonts, false);

            // Table: Y in the config is distance from page top; convert to PDF coords
            float cursorY = pageH - tbl.getStartY();
            cursorY = drawTableHeader(ctx, layout, cursorY, selectedLocale, fonts);

            int rowsOnCurrentPage = 0;
            for (var line : lines) {
                if (cursorY - tbl.getRowHeight() < contentBottomLimit(layout)) {
                    ctx.closeStream();
                    ctx.newPage();
                    drawFixedPageSections(ctx, layout, req, selectedLocale, fonts, logoBytes, signatureBytes, totals);
                    cursorY = pageH - continuationTableStartY(layout);
                    cursorY = drawTableHeader(ctx, layout, cursorY, selectedLocale, fonts);
                    rowsOnCurrentPage = 0;
                }
                cursorY = drawServiceRow(ctx, layout, cursorY, line, fonts);
                rowsOnCurrentPage++;
            }

            float advancePaymentsTableOffset = advancePaymentsTableFlowOffset(layout, req);
            drawAdvancePaymentsTable(ctx, layout, req, cursorY, selectedLocale, fonts);
            float tableFlowOffset = tableFlowOffset(layout, rowsOnCurrentPage) + advancePaymentsTableOffset;
            drawFooter(ctx, layout, cursorY, totals.net(), totals.gross(), req, selectedLocale, fonts, tableFlowOffset);
            drawVatBreakdownTable(ctx, layout, req, selectedLocale, fonts, tableFlowOffset, false);
            drawSignature(ctx, layout, signatureBytes, tableFlowOffset, false);
            drawPaymentQr(ctx, layout, req, selectedLocale, fonts, tableFlowOffset, false);
            drawFiscalQr(ctx, layout, req, tableFlowOffset, false);

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

    private void drawFixedPageSections(
            PageContext ctx,
            FolioLayoutConfig layout,
            FolioPdfRequest req,
            String locale,
            FontSet fonts,
            byte[] logoBytes,
            byte[] signatureBytes,
            InvoiceTotals totals
    ) throws IOException {
        drawLogo(ctx, layout, logoBytes, true);
        drawFields(ctx, layout, req, locale, fonts, true);
        drawFixedFooterItems(ctx, layout, totals.net(), totals.gross(), req, locale, fonts);
        drawVatBreakdownTable(ctx, layout, req, locale, fonts, 0, true);
        drawSignature(ctx, layout, signatureBytes, 0, true);
        drawPaymentQr(ctx, layout, req, locale, fonts, 0, true);
        drawFiscalQr(ctx, layout, req, 0, true);
    }

    private InvoiceTotals calculateInvoiceTotals(List<FolioPdfRequest.ServiceLine> lines) {
        BigDecimal totalNett = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        if (lines != null) {
            for (var line : lines) {
                totalNett = totalNett.add(lineNetBasis(line));
                totalGross = totalGross.add(lineGrossTotal(line));
            }
        }
        return new InvoiceTotals(totalNett, totalGross);
    }

    private float contentBottomLimit(FolioLayoutConfig layout) {
        float fixedFooterHeight = layout.getPageSections() == null ? 0 : layout.getPageSections().getFooterHeight();
        return Math.max(BOTTOM_MARGIN, fixedFooterHeight + 12f);
    }

    private float continuationTableStartY(FolioLayoutConfig layout) {
        float headerHeight = layout.getPageSections() == null ? 0 : layout.getPageSections().getHeaderHeight();
        return Math.max(50f, headerHeight + 20f);
    }

    private boolean isFixedPageSectionBlock(FolioLayoutConfig layout, float y, float height) {
        if (layout == null || layout.getPageSections() == null) return false;
        float blockBottom = y + Math.max(0, height);
        float headerBottom = layout.getPageSections().getHeaderHeight();
        float footerTop = layout.getPageHeight() - layout.getPageSections().getFooterHeight();
        return blockBottom <= headerBottom || y >= footerTop;
    }

    /* ────────────────────────── logo ────────────────────────── */

    private void drawLogo(PageContext ctx, FolioLayoutConfig layout, byte[] logoBytes, boolean fixedOnly) throws IOException {
        if (logoBytes == null || logoBytes.length == 0) return;
        var logoCfg = layout.getLogo();
        if (logoCfg == null || !logoCfg.isVisible()) return;
        if (isFixedPageSectionBlock(layout, logoCfg.getY(), logoCfg.getHeight()) != fixedOnly) return;

        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, logoBytes, "logo");
        float pageH = layout.getPageHeight();
        float pdfY = pageH - logoCfg.getY() - logoCfg.getHeight();
        ctx.stream.drawImage(img, logoCfg.getX(), pdfY, logoCfg.getWidth(), logoCfg.getHeight());
    }

    /* ────────────────────────── header fields ────────────────────────── */

    private void drawFields(
            PageContext ctx,
            FolioLayoutConfig layout,
            FolioPdfRequest req,
            String locale,
            FontSet fonts,
            boolean fixedOnly
    ) throws IOException {
        Map<String, String> values = new HashMap<>();
        values.put("companyName", req.getCompanyName());
        values.put("companyAddress", req.getCompanyAddress());
        values.put("companyPostalCode", req.getCompanyPostalCode());
        values.put("companyCity", req.getCompanyCity());
        values.put("companyPostalCodeCity", joinPostalCodeAndCity(req.getCompanyPostalCode(), req.getCompanyCity()));
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
        values.put("recipientPostalCodeCity", joinPostalCodeAndCity(req.getRecipientPostalCode(), req.getRecipientCity()));
        values.put("recipientVatId", req.getRecipientVatId());

        boolean hasToBePaid = resolveToBePaid(req).compareTo(BigDecimal.ZERO) > 0;

        float pageH = layout.getPageHeight();
        for (var field : layout.getFields()) {
            if (!field.isVisible()) continue;
            if (isFixedPageSectionBlock(layout, field.getY(), field.getHeight()) != fixedOnly) continue;
            if ("dueDate".equals(field.getKey()) && !hasToBePaid) continue;
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
            if ("folioNumber".equals(field.getKey())) {
                String dynamicPrefix = safe(req.getFolioNumberLabel());
                if (dynamicPrefix != null && !dynamicPrefix.isBlank()) {
                    prefix = dynamicPrefix;
                }
            }

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
        int fs = compactTableFontSize(layout);
        float left = tbl.getStartX();
        float right = tbl.getStartX() + tbl.getWidth();

        // Top rule above the column labels, rendered as a double line like the reference invoice style.
        // Raise it slightly so it sits clearly above the header text instead of touching it.
        drawDoubleHLine(ctx, left, right, y + 6, 0.5f);
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

        // Keep a thin separator between the column labels and body rows for readability.
        y -= 4;
        drawHLine(ctx, left, right, y, 0.5f);
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
        int fs = compactTableFontSize(layout);
        Map<String, String> cellValues = new HashMap<>();
        String desc = safe(line.getDescription());
        if (desc.length() > 50) desc = desc.substring(0, 50) + "...";
        cellValues.put("date", safe(line.getDate()));
        cellValues.put("description", desc);
        cellValues.put("qty", String.valueOf(line.getQty()));
        cellValues.put("nett", fmt(line.getNettPrice()));
        cellValues.put("gross", fmt(line.getGrossPrice()));
        cellValues.put("taxPercent", displayTaxPercent(line.getTaxPercent()));
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

    private float drawAdvancePaymentsTable(
            PageContext ctx,
            FolioLayoutConfig layout,
            FolioPdfRequest req,
            float lastRowY,
            String locale,
            FontSet fonts
    ) throws IOException {
        List<FolioPdfRequest.AdvancePaymentLine> rows = advancePaymentRows(req);
        if (rows.isEmpty()) return 0f;
        var tbl = layout.getTable();
        float x = tbl.getStartX();
        float right = tbl.getStartX() + tbl.getWidth();
        float rowH = Math.max(12f, tbl.getRowHeight());
        int headerFs = compactTableFontSize(layout);
        int bodyFs = headerFs;

        float titleY = lastRowY - 18f;
        drawText(ctx, fonts.bold(), headerFs, x, titleY, localizedAdvancePaymentsTitle(locale));

        float headerTop = titleY - 10f;
        float headerBaseline = headerTop - 11f;
        float firstRowBaseline = headerBaseline - rowH;
        drawDoubleHLine(ctx, x, right, headerTop, 0.5f);
        drawHLine(ctx, x, right, headerBaseline - 5f, 0.5f);

        float[] colX = new float[] { x + 6f, x + 98f, x + 170f, x + 250f, x + 320f, x + 390f, x + 480f };
        float advanceBasisRight = colX[3] + 55f;
        float advanceVatRight = colX[4] + 45f;
        float advanceTotalRight = colX[5] + 30f;
        float advanceUsedRight = right - 6f;
        String[] headers = localizedAdvancePaymentHeaders(locale);
        drawText(ctx, fonts.bold(), headerFs, colX[0], headerBaseline, headers[0]);
        drawText(ctx, fonts.bold(), headerFs, colX[1], headerBaseline, headers[1]);
        drawText(ctx, fonts.bold(), headerFs, colX[2], headerBaseline, headers[2]);
        drawTextRight(ctx, fonts.bold(), headerFs, advanceBasisRight, headerBaseline, headers[3]);
        drawTextRight(ctx, fonts.bold(), headerFs, advanceVatRight, headerBaseline, headers[4]);
        drawTextRight(ctx, fonts.bold(), headerFs, advanceTotalRight, headerBaseline, headers[5]);
        drawTextRight(ctx, fonts.bold(), headerFs, advanceUsedRight, headerBaseline, headers[6]);

        float y = firstRowBaseline;
        for (FolioPdfRequest.AdvancePaymentLine row : rows) {
            drawText(ctx, fonts.regular(), bodyFs, colX[0], y, safe(row.getAdvanceNumber()));
            drawText(ctx, fonts.regular(), bodyFs, colX[1], y, formatDateValue(safe(row.getDate()), "YYYY-MM-DD"));
            drawText(ctx, fonts.regular(), bodyFs, colX[2], y, displayTaxPercent(row.getTaxPercent()));
            drawTextRight(ctx, fonts.regular(), bodyFs, advanceBasisRight, y, fmt(row.getNetBasis()));
            drawTextRight(ctx, fonts.regular(), bodyFs, advanceVatRight, y, fmt(row.getTaxAmount()));
            drawTextRight(ctx, fonts.regular(), bodyFs, advanceTotalRight, y, fmt(row.getTotalGross()));
            drawTextRight(ctx, fonts.regular(), bodyFs, advanceUsedRight, y, fmt(row.getUsedGross()));
            y -= rowH;
        }
        drawDoubleHLine(ctx, x, right, y + rowH - 5f, 0.5f);
        return advancePaymentsTableFlowOffset(layout, req);
    }

    private float advancePaymentsTableFlowOffset(FolioLayoutConfig layout, FolioPdfRequest req) {
        List<FolioPdfRequest.AdvancePaymentLine> rows = advancePaymentRows(req);
        var tbl = layout.getTable();
        float rowH = Math.max(12f, tbl.getRowHeight());
        if (rows.isEmpty()) {
            // The editor shows the VAT/totals block below the Predplačila preview.
            // When the real invoice does not use advance payments, collapse the whole
            // reserved Predplačila area and anchor the first follow-up block directly
            // below the services table instead of only subtracting a hardcoded table height.
            return -advancePaymentsReservedAreaToCollapse(layout);
        }
        // One advance row fits into the preview/reserved area. Additional advance rows push content down.
        return rowH * Math.max(0, rows.size() - 1);
    }

    private float advancePaymentsReservedAreaToCollapse(FolioLayoutConfig layout) {
        if (layout == null || layout.getTable() == null) return 0f;
        var tbl = layout.getTable();
        float baselineTableBottom = visualServicesTableBottom(
                tbl.getStartY(),
                tbl.getHeaderHeight(),
                tbl.getRowHeight(),
                LAYOUT_PREVIEW_SERVICE_ROWS
        );
        float desiredFirstBlockY = baselineTableBottom + advancePaymentsCollapsedGap(layout);
        float firstFollowUpY = firstAdvanceAwareFollowUpY(layout, baselineTableBottom);
        if (firstFollowUpY <= 0f || firstFollowUpY <= desiredFirstBlockY) return 0f;
        return firstFollowUpY - desiredFirstBlockY;
    }

    private float advancePaymentsCollapsedGap(FolioLayoutConfig layout) {
        if (layout == null || layout.getTable() == null) return 12f;
        // Keep the collapsed layout tight, but not glued to the services table.
        // Scale the small gap with the configured services-row height so custom layouts remain readable.
        return Math.max(8f, Math.min(16f, layout.getTable().getRowHeight() * 0.65f));
    }

    private float firstAdvanceAwareFollowUpY(FolioLayoutConfig layout, float baselineTableBottom) {
        float firstY = Float.MAX_VALUE;

        var vat = layout.getVatBreakdownTable();
        if (vat != null && vat.isVisible()) {
            float h = Math.max(10f, vat.getHeaderHeight()) + Math.max(10f, vat.getRowHeight());
            firstY = minAdvanceAwareY(layout, firstY, vat.getY(), h, baselineTableBottom);
        }

        if (layout.getFooter() != null && layout.getFooter().getItems() != null) {
            for (var item : layout.getFooter().getItems()) {
                if (item == null || !isSummaryBlockKey(item.getKey())) continue;
                firstY = minAdvanceAwareY(layout, firstY, item.getY(), footerItemHeight(layout, item), baselineTableBottom);
            }
        }

        // Fallbacks for very customized layouts where VAT/totals are hidden or moved.
        if (layout.getPaymentQr() != null && layout.getPaymentQr().isVisible()) {
            firstY = minAdvanceAwareY(layout, firstY, layout.getPaymentQr().getY(), layout.getPaymentQr().getHeight(), baselineTableBottom);
        }
        if (layout.getSignature() != null && layout.getSignature().isVisible()) {
            firstY = minAdvanceAwareY(layout, firstY, layout.getSignature().getY(), layout.getSignature().getHeight(), baselineTableBottom);
        }

        return firstY == Float.MAX_VALUE ? 0f : firstY;
    }

    private float minAdvanceAwareY(FolioLayoutConfig layout, float currentMin, float y, float height, float baselineTableBottom) {
        if (y < baselineTableBottom) return currentMin;
        if (isFixedPageSectionBlock(layout, y, Math.max(1f, height))) return currentMin;
        return Math.min(currentMin, y);
    }

    private List<FolioPdfRequest.AdvancePaymentLine> advancePaymentRows(FolioPdfRequest req) {
        var rows = new ArrayList<FolioPdfRequest.AdvancePaymentLine>();
        if (req == null || req.getAdvancePayments() == null) return rows;
        for (FolioPdfRequest.AdvancePaymentLine row : req.getAdvancePayments()) {
            if (row != null && row.getUsedGross() != null && row.getUsedGross().abs().compareTo(BigDecimal.ZERO) > 0) {
                rows.add(row);
            }
        }
        return rows;
    }

    private String localizedAdvancePaymentsTitle(String locale) {
        return "sl".equals(normalizeLocale(locale)) ? "Predplačila" : "Advance payments";
    }

    private String[] localizedAdvancePaymentHeaders(String locale) {
        if ("sl".equals(normalizeLocale(locale))) {
            return new String[] { "Predplačilo št.", "Datum", "Stopnja DDV", "Osnova", "DDV", "Skupaj", "Porabljeno" };
        }
        return new String[] { "Advance no.", "Date", "Tax rate", "Basis", "VAT", "Total", "Used" };
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
        // Position the closing double rule a bit lower so it sits nearer the bottom of the services block.
        float y = lastRowY + 14f;

        drawDoubleHLine(ctx, tbl.getStartX(), tbl.getStartX() + tbl.getWidth(), y, 0.75f);
        y -= DOUBLE_RULE_GAP + ftr.getLineSpacing() + 2;

        float rightEdge = tbl.getStartX() + tbl.getWidth();
        float leftEdge = tbl.getStartX();
        float pageH = layout.getPageHeight();

        FooterRenderData footerData = buildFooterRenderData(totalNett, totalGross, req);
        Map<String, String> footerValues = footerData.values();
        List<String> paymentLines = footerData.paymentLines();

        drawSummaryBlock(ctx, layout, footerValues, false, tableFlowOffset);

        for (var item : ftr.getItems()) {
            if (item.getX() >= 0 && item.getY() >= 0
                    && isFixedPageSectionBlock(layout, item.getY(), item.getHeight() > 0 ? item.getHeight() : ftr.getLineSpacing())) {
                continue;
            }
            if ("payment".equals(item.getKey())) {
                if (paymentLines.isEmpty()) continue;
                String label = resolveLocalized(item.getLabelI18n(), item.getLabel(), locale);
                PDFont font = item.isBold() ? fonts.bold() : fonts.regular();
                float lineGap = Math.max(item.getFontSize() + 3, Math.min(ftr.getLineSpacing(), 14));

                if (item.getX() >= 0 && item.getY() >= 0) {
                    float itemY = effectivePaymentStartY(layout, false, item);
                    itemY = shiftedBelowServicesTableY(itemY, layout, tableFlowOffset);
                    float itemRight = item.getWidth() > 0 ? item.getX() + item.getWidth() : rightEdge;
                    for (int i = 0; i < paymentLines.size(); i++) {
                        String value = paymentLines.get(i);
                        String text = (i == 0 && label != null && !label.isBlank()) ? (label + ": " + value) : value;
                        float absY = pageH - (itemY + lineGap * i) - item.getFontSize();
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
            String label = suppressFooterLabel(item.getKey()) ? "" : resolveLocalized(item.getLabelI18n(), item.getLabel(), locale);
            String text = (label == null || label.isBlank()) ? value : (label + ": " + value);

            PDFont font = item.isBold() ? fonts.bold() : fonts.regular();

            // Use absolute positioning when x/y are set (>= 0), otherwise fall back to sequential layout
            if (item.getX() >= 0 && item.getY() >= 0) {
                float baseItemY = effectiveSummaryItemY(layout, footerValues, false, tableFlowOffset, item);
                float itemY = baseItemY + paymentBlockOffset(layout, req, false, baseItemY, item.getX(), item.getWidth());
                int drawFontSize = isSummaryBlockKey(item.getKey()) ? summaryFontSize(layout) : item.getFontSize();
                float absY = pageH - itemY - drawFontSize;
                float itemRight = item.getWidth() > 0 ? item.getX() + item.getWidth() : rightEdge;
                if (isSummaryBlockKey(item.getKey())) {
                    drawFooterLabelAndValue(ctx, font, drawFontSize, item.getX(), itemRight, absY, label, value);
                } else if ("right".equals(item.getAlignment())) {
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

    private void drawFixedFooterItems(
            PageContext ctx,
            FolioLayoutConfig layout,
            BigDecimal totalNett,
            BigDecimal totalGross,
            FolioPdfRequest req,
            String locale,
            FontSet fonts
    ) throws IOException {
        var ftr = layout.getFooter();
        if (ftr == null || ftr.getItems() == null) return;
        float pageH = layout.getPageHeight();
        FooterRenderData footerData = buildFooterRenderData(totalNett, totalGross, req);
        Map<String, String> footerValues = footerData.values();
        List<String> paymentLines = footerData.paymentLines();

        drawSummaryBlock(ctx, layout, footerValues, true, 0f);

        for (var item : ftr.getItems()) {
            if (item.getX() < 0 || item.getY() < 0) continue;
            float itemHeight = item.getHeight() > 0 ? item.getHeight() : ftr.getLineSpacing();
            if (!isFixedPageSectionBlock(layout, item.getY(), itemHeight)) continue;

            PDFont font = item.isBold() ? fonts.bold() : fonts.regular();
            float itemRight = item.getWidth() > 0 ? item.getX() + item.getWidth() : item.getX() + 150;
            if ("payment".equals(item.getKey())) {
                if (paymentLines.isEmpty()) continue;
                String label = resolveLocalized(item.getLabelI18n(), item.getLabel(), locale);
                float lineGap = Math.max(item.getFontSize() + 3, Math.min(ftr.getLineSpacing(), 14));
                float anchorY = effectivePaymentStartY(layout, true, item);
                for (int i = 0; i < paymentLines.size(); i++) {
                    String value = paymentLines.get(i);
                    String text = (i == 0 && label != null && !label.isBlank()) ? (label + ": " + value) : value;
                    float absY = pageH - (anchorY + lineGap * i) - item.getFontSize();
                    if ("right".equals(item.getAlignment())) {
                        drawTextRight(ctx, font, item.getFontSize(), itemRight, absY, text);
                    } else {
                        drawText(ctx, font, item.getFontSize(), item.getX(), absY, text);
                    }
                }
                continue;
            }

            String value = footerValues.get(item.getKey());
            if (value == null || value.isBlank()) continue;
            String label = suppressFooterLabel(item.getKey()) ? "" : resolveLocalized(item.getLabelI18n(), item.getLabel(), locale);
            String text = (label == null || label.isBlank()) ? value : (label + ": " + value);
            float baseItemY = effectiveSummaryItemY(layout, footerValues, true, 0f, item);
            float shiftedItemY = baseItemY + paymentBlockOffset(layout, req, true, baseItemY, item.getX(), item.getWidth());
            int drawFontSize = isSummaryBlockKey(item.getKey()) ? summaryFontSize(layout) : item.getFontSize();
            float absY = pageH - shiftedItemY - drawFontSize;
            if (isSummaryBlockKey(item.getKey())) {
                drawFooterLabelAndValue(ctx, font, drawFontSize, item.getX(), itemRight, absY, label, value);
            } else if ("right".equals(item.getAlignment())) {
                drawTextRight(ctx, font, item.getFontSize(), itemRight, absY, text);
            } else {
                drawText(ctx, font, item.getFontSize(), item.getX(), absY, text);
            }
        }
    }

    private FooterRenderData buildFooterRenderData(BigDecimal totalNett, BigDecimal totalGross, FolioPdfRequest req) {
        Map<String, String> footerValues = new HashMap<>();
        footerValues.put("totalNett", fmtMoneySuffix(totalNett, req));
        footerValues.put("totalGross", fmtMoneySuffix(totalGross, req));
        BigDecimal usedAdvancePaymentsGross = req == null || req.getUsedAdvancePaymentsGross() == null
                ? BigDecimal.ZERO
                : req.getUsedAdvancePaymentsGross().abs().setScale(2, RoundingMode.HALF_UP);
        if (usedAdvancePaymentsGross.compareTo(BigDecimal.ZERO) > 0) {
            footerValues.put("usedAdvances", fmtMoneyDeductionSuffix(usedAdvancePaymentsGross, req));
        }
        BigDecimal discountAmountGross = req == null ? null : req.getDiscountAmountGross();
        if (!isCreditNoteRequest(req) && discountAmountGross != null && discountAmountGross.compareTo(BigDecimal.ZERO) > 0) {
            footerValues.put("discount", fmtMoneyDeductionSuffix(discountAmountGross, req));
        }
        footerValues.put("toBePaid", fmtMoneySuffix(resolveToBePaid(req), req));
        List<VatBreakdownRow> vatRows = buildVatBreakdownRows(req == null ? null : req.getServices());
        footerValues.put("vat22", fmtMoney(vatBreakdownAmount(vatRows, VatBreakdownBucket.VAT_22), req));
        footerValues.put("vat95", fmtMoney(vatBreakdownAmount(vatRows, VatBreakdownBucket.VAT_9_5), req));
        footerValues.put("vat0", fmtMoney(vatBreakdownAmount(vatRows, VatBreakdownBucket.VAT_0), req));
        footerValues.put("noVat", fmtMoney(vatBreakdownAmount(vatRows, VatBreakdownBucket.NO_VAT), req));
        if (req != null && req.getNotes() != null && !req.getNotes().isBlank()) {
            footerValues.put("notes", safe(req.getNotes()));
        }
        List<String> paymentLines = paymentFooterLines(req);
        if (!paymentLines.isEmpty()) {
            footerValues.put("payment", safe(paymentLines.get(0)));
        }
        if (req != null && req.getIban() != null && !req.getIban().isBlank()) {
            footerValues.put("iban", safe(req.getIban()));
        }
        if (req != null && req.getIssuedBy() != null && !req.getIssuedBy().isBlank()) {
            footerValues.put("issuedBy", safe(req.getIssuedBy()));
        }
        if (req != null && req.getFiscalZoi() != null && !req.getFiscalZoi().isBlank()) {
            footerValues.put("fiscalZoi", safe(req.getFiscalZoi()));
        }
        if (req != null && req.getFiscalEor() != null && !req.getFiscalEor().isBlank()) {
            footerValues.put("fiscalEor", safe(req.getFiscalEor()));
        }
        return new FooterRenderData(footerValues, paymentLines);
    }

    private boolean suppressFooterLabel(String key) {
        return "notes".equals(key) || "iban".equals(key);
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
                lines.add(name + (amount == null ? "" : " " + fmtMoneySuffix(amount, req)));
            }
        }
        if (lines.isEmpty() && req != null && req.getPaymentMethod() != null && !req.getPaymentMethod().isBlank()) {
            lines.add(safe(req.getPaymentMethod()));
        }
        return lines;
    }

    /* ────────────────────────── payment QR ────────────────────────── */

    private void drawPaymentQr(
            PageContext ctx,
            FolioLayoutConfig layout,
            FolioPdfRequest req,
            String locale,
            FontSet fonts,
            float tableFlowOffset,
            boolean fixedOnly
    ) throws IOException {
        var qrCfg = layout.getPaymentQr();
        if (qrCfg == null || !qrCfg.isVisible()) return;
        if (isFixedPageSectionBlock(layout, qrCfg.getY(), qrCfg.getHeight()) != fixedOnly) return;
        String payload = req.getPaymentQrPayload() == null ? "" : req.getPaymentQrPayload().replace("\r", "");
        if (payload.isBlank()) return;

        float pageH = layout.getPageHeight();
        float qrBlockY = (fixedOnly ? qrCfg.getY() : shiftedBelowServicesTableY(qrCfg.getY(), layout, tableFlowOffset))
                + paymentBlockOffset(layout, req, fixedOnly, qrCfg.getY(), qrCfg.getX(), qrCfg.getWidth());
        String caption = paymentQrCaption(locale);
        float captionReserve = PAYMENT_QR_CAPTION_FONT_SIZE + PAYMENT_QR_CAPTION_GAP + 2;
        float qrSize = Math.min(qrCfg.getWidth(), Math.max(40, qrCfg.getHeight() - captionReserve));
        qrSize = Math.min(qrSize, qrCfg.getHeight());
        float qrX = qrCfg.getX() + Math.max(0, (qrCfg.getWidth() - qrSize) / 2f);

        byte[] png = createQrPng(payload,
                Math.max(64, Math.round(qrSize)),
                Math.max(64, Math.round(qrSize)));
        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, png, "payment-qr");
        float pdfY = pageH - qrBlockY - qrSize;
        ctx.stream.drawImage(img, qrX, pdfY, qrSize, qrSize);

        float captionYFromTop = qrBlockY + qrSize + PAYMENT_QR_CAPTION_GAP;
        float captionPdfY = pageH - captionYFromTop - PAYMENT_QR_CAPTION_FONT_SIZE;
        drawTextCentered(ctx, fonts.regular(), PAYMENT_QR_CAPTION_FONT_SIZE, qrCfg.getX(), qrCfg.getWidth(), captionPdfY, caption);
    }

    private String paymentQrCaption(String locale) {
        return "sl".equals(normalizeLocale(locale)) ? "Skeniraj in plačaj." : "Scan and pay.";
    }

    private void drawFiscalQr(PageContext ctx, FolioLayoutConfig layout, FolioPdfRequest req, float tableFlowOffset, boolean fixedOnly) throws IOException {
        var qrCfg = layout.getFiscalQr();
        if (qrCfg == null || !qrCfg.isVisible()) return;
        if (isFixedPageSectionBlock(layout, qrCfg.getY(), qrCfg.getHeight()) != fixedOnly) return;
        String payload = req.getFiscalQr() == null ? "" : req.getFiscalQr().replace("\r", "");
        if (payload.isBlank()) return;

        byte[] png = createQrPng(payload,
                Math.max(64, Math.round(qrCfg.getWidth())),
                Math.max(64, Math.round(qrCfg.getHeight())));
        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, png, "fiscal-qr");
        float pageH = layout.getPageHeight();
        float qrY = (fixedOnly ? qrCfg.getY() : shiftedBelowServicesTableY(qrCfg.getY(), layout, tableFlowOffset))
                + paymentBlockOffset(layout, req, fixedOnly, qrCfg.getY(), qrCfg.getX(), qrCfg.getWidth());
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
            float tableFlowOffset,
            boolean fixedOnly
    ) throws IOException {
        var cfg = layout.getVatBreakdownTable();
        if (cfg == null || !cfg.isVisible()) return;
        float tableHeightForZone = cfg.getHeaderHeight() + cfg.getRowHeight() * Math.max(1, buildVatBreakdownRows(req.getServices()).size());
        if (isFixedPageSectionBlock(layout, cfg.getY(), tableHeightForZone) != fixedOnly) return;

        List<VatBreakdownRow> rows = buildVatBreakdownRows(req.getServices());
        if (rows.isEmpty()) return;

        float x = cfg.getX();
        float yTopFromPageTop = (fixedOnly ? cfg.getY() : shiftedBelowServicesTableY(cfg.getY(), layout, tableFlowOffset))
                + paymentBlockOffset(layout, req, fixedOnly, cfg.getY(), cfg.getX(), cfg.getWidth());
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
        float right = x + width;

        // Match the services table style: horizontal rules around the body rows only.
        drawHLine(ctx, x, right, topY - headerH, 0.5f);
        drawHLine(ctx, x, right, bottomY, 0.5f);

        String[] labels = localizedVatTableColumnLabels(locale);
        float headerTextY = rowTextBaseline(topY, headerH, headerFs);
        drawText(ctx, fonts.bold(), headerFs, c1 + 3, headerTextY, labels[0]);
        drawText(ctx, fonts.bold(), headerFs, c2 + 3, headerTextY, labels[1]);
        drawTextRight(ctx, fonts.bold(), headerFs, c3 + basisW - 3, headerTextY, labels[2]);
        drawTextRight(ctx, fonts.bold(), headerFs, right - 3, headerTextY, labels[3]);

        for (int i = 0; i < rows.size(); i++) {
            var row = rows.get(i);
            float rowTop = topY - headerH - rowH * i;
            float textY = rowTextBaseline(rowTop, rowH, bodyFs);
            drawText(ctx, fonts.regular(), bodyFs, c1 + 3, textY, localizedVatBreakdownLabel(row.bucket(), locale));
            drawText(ctx, fonts.regular(), bodyFs, c2 + 3, textY, vatRateLabel(row.bucket(), locale));
            drawTextRight(ctx, fonts.regular(), bodyFs, c3 + basisW - 3, textY, fmtMoney(row.netBasis(), req));
            drawTextRight(ctx, fonts.regular(), bodyFs, right - 3, textY, fmtMoney(row.vatAmount(), req));
        }
    }


    private void drawSummaryBlock(
            PageContext ctx,
            FolioLayoutConfig layout,
            Map<String, String> footerValues,
            boolean fixedOnly,
            float tableFlowOffset
    ) throws IOException {
        SummaryBlockMetrics metrics = summaryBlockMetrics(layout, footerValues, fixedOnly, tableFlowOffset);
        if (metrics == null || metrics.items() == null || metrics.items().isEmpty()) return;
        float pageH = layout.getPageHeight();
        List<FolioLayoutConfig.FooterItem> items = metrics.items();
        for (var item : items) {
            if (item == null || !"toBePaid".equals(item.getKey())) continue;
            float itemY = effectiveSummaryItemY(layout, footerValues, fixedOnly, tableFlowOffset, item);
            float doubleLineY = pageH - Math.max(0f, itemY - 2.5f);
            drawDoubleHLine(ctx, metrics.leftX() + 4f, metrics.rightX() - 4f, doubleLineY, 0.6f);
            break;
        }
    }

    private SummaryBlockMetrics summaryBlockMetrics(
            FolioLayoutConfig layout,
            Map<String, String> footerValues,
            boolean fixedOnly,
            float tableFlowOffset
    ) {
        if (layout == null || layout.getFooter() == null || layout.getFooter().getItems() == null) return null;
        List<FolioLayoutConfig.FooterItem> items = new ArrayList<>();
        float left = Float.MAX_VALUE;
        float right = Float.MIN_VALUE;
        float top = Float.MAX_VALUE;
        float bottom = Float.MIN_VALUE;
        for (var item : layout.getFooter().getItems()) {
            if (item == null || !isSummaryBlockKey(item.getKey())) continue;
            if (item.getX() < 0 || item.getY() < 0) continue;
            float itemHeight = footerItemHeight(layout, item);
            if (isFixedPageSectionBlock(layout, item.getY(), itemHeight) != fixedOnly) continue;
            String value = footerValues == null ? null : footerValues.get(item.getKey());
            if (value == null || value.isBlank()) continue;
            float shiftedY = effectiveSummaryItemY(layout, footerValues, fixedOnly, tableFlowOffset, item);
            items.add(item);
            left = Math.min(left, item.getX());
            right = Math.max(right, item.getX() + (item.getWidth() > 0 ? item.getWidth() : 150f));
            top = Math.min(top, shiftedY);
            bottom = Math.max(bottom, shiftedY + itemHeight);
        }
        if (items.isEmpty()) return null;
        items.sort((a, b) -> Float.compare(effectiveSummaryItemY(layout, footerValues, fixedOnly, tableFlowOffset, a), effectiveSummaryItemY(layout, footerValues, fixedOnly, tableFlowOffset, b)));
        return new SummaryBlockMetrics(top - 5f, bottom + 5f, left - 6f, right + 6f, items, fixedOnly);
    }

    private boolean isSummaryBlockKey(String key) {
        return "totalNett".equals(key) || "discount".equals(key) || "totalGross".equals(key) || "usedAdvances".equals(key) || "toBePaid".equals(key);
    }

    private float footerItemHeight(FolioLayoutConfig layout, FolioLayoutConfig.FooterItem item) {
        if (item == null) return layout != null && layout.getFooter() != null ? layout.getFooter().getLineSpacing() : 16f;
        return item.getHeight() > 0 ? item.getHeight() : (layout != null && layout.getFooter() != null ? layout.getFooter().getLineSpacing() : 16f);
    }

    private float effectiveSummaryItemY(
            FolioLayoutConfig layout,
            Map<String, String> footerValues,
            boolean fixedOnly,
            float tableFlowOffset,
            FolioLayoutConfig.FooterItem item
    ) {
        float baseY = shiftedFooterItemY(layout, item, fixedOnly, tableFlowOffset);
        if (item == null || !isSummaryBlockKey(item.getKey())) return baseY;
        float hiddenShift = hiddenSummaryRowsBefore(layout, footerValues, fixedOnly, item.getY());
        return baseY - hiddenShift;
    }

    private float hiddenSummaryRowsBefore(FolioLayoutConfig layout, Map<String, String> footerValues, boolean fixedOnly, float itemY) {
        if (layout == null || layout.getFooter() == null || layout.getFooter().getItems() == null) return 0f;
        float shift = 0f;
        for (var footerItem : layout.getFooter().getItems()) {
            if (footerItem == null || !isSummaryBlockKey(footerItem.getKey()) || footerItem.getX() < 0 || footerItem.getY() < 0) continue;
            float itemHeight = footerItemHeight(layout, footerItem);
            if (isFixedPageSectionBlock(layout, footerItem.getY(), itemHeight) != fixedOnly) continue;
            if (footerItem.getY() >= itemY - 0.1f) continue;
            String value = footerValues == null ? null : footerValues.get(footerItem.getKey());
            if (value != null && !value.isBlank()) continue;
            shift += summaryRowGapAfter(layout, footerItem.getKey(), fixedOnly);
        }
        return shift;
    }

    private float summaryRowGapAfter(FolioLayoutConfig layout, String key, boolean fixedOnly) {
        if (layout == null || layout.getFooter() == null || layout.getFooter().getItems() == null) return 16f;
        Float currentY = null;
        Float nextY = null;
        for (var item : layout.getFooter().getItems()) {
            if (item == null || !isSummaryBlockKey(item.getKey()) || item.getX() < 0 || item.getY() < 0) continue;
            float itemHeight = footerItemHeight(layout, item);
            if (isFixedPageSectionBlock(layout, item.getY(), itemHeight) != fixedOnly) continue;
            if (key.equals(item.getKey())) {
                currentY = item.getY();
                break;
            }
        }
        if (currentY == null) return layout.getFooter().getLineSpacing();
        for (var item : layout.getFooter().getItems()) {
            if (item == null || !isSummaryBlockKey(item.getKey()) || item.getX() < 0 || item.getY() < 0) continue;
            float itemHeight = footerItemHeight(layout, item);
            if (isFixedPageSectionBlock(layout, item.getY(), itemHeight) != fixedOnly) continue;
            if (item.getY() > currentY + 0.1f && (nextY == null || item.getY() < nextY)) {
                nextY = item.getY();
            }
        }
        if (nextY != null) return Math.max(0f, nextY - currentY);
        return layout.getFooter().getLineSpacing();
    }

    private boolean isCreditNoteRequest(FolioPdfRequest req) {
        if (req == null || req.getFolioNumberLabel() == null) return false;
        String label = req.getFolioNumberLabel().trim().toLowerCase(java.util.Locale.ROOT);
        return label.contains("dobropis") || label.contains("refund");
    }

    private float shiftedFooterItemY(FolioLayoutConfig layout, FolioLayoutConfig.FooterItem item, boolean fixedOnly, float tableFlowOffset) {
        if (item == null) return 0f;
        return fixedOnly ? item.getY() : shiftedBelowServicesTableY(item.getY(), layout, tableFlowOffset);
    }

    private float summaryBlockBottomY(FolioLayoutConfig layout, boolean fixedOnly) {
        if (layout == null || layout.getFooter() == null || layout.getFooter().getItems() == null) return 0f;
        float bottom = 0f;
        for (var item : layout.getFooter().getItems()) {
            if (item == null || !isSummaryBlockKey(item.getKey()) || item.getX() < 0 || item.getY() < 0) continue;
            float itemHeight = footerItemHeight(layout, item);
            if (isFixedPageSectionBlock(layout, item.getY(), itemHeight) != fixedOnly) continue;
            bottom = Math.max(bottom, item.getY() + itemHeight);
        }
        return bottom;
    }

    private float effectivePaymentStartY(FolioLayoutConfig layout, boolean fixedOnly, FolioLayoutConfig.FooterItem paymentItem) {
        if (paymentItem == null) return 0f;
        float summaryBottom = summaryBlockBottomY(layout, fixedOnly);
        if (summaryBottom <= 0f) return paymentItem.getY();
        return Math.max(paymentItem.getY(), summaryBottom + 10f);
    }

    private float paymentBlockOffset(
            FolioLayoutConfig layout,
            FolioPdfRequest req,
            boolean fixedOnly,
            float originalY,
            float originalX,
            float originalWidth
    ) {
        PaymentBlockMetrics metrics = paymentBlockMetrics(layout, req, fixedOnly);
        if (metrics == null || metrics.extraHeight() <= 0f) return 0f;
        if (originalY <= metrics.anchorY() + 0.1f) return 0f;
        if (!belongsToPaymentColumn(originalX, originalWidth, metrics)) return 0f;
        return metrics.extraHeight();
    }

    private PaymentBlockMetrics paymentBlockMetrics(FolioLayoutConfig layout, FolioPdfRequest req, boolean fixedOnly) {
        if (layout == null || layout.getFooter() == null || layout.getFooter().getItems() == null) return null;
        List<String> paymentLines = paymentFooterLines(req);
        if (paymentLines.size() <= 1) return null;
        for (var item : layout.getFooter().getItems()) {
            if (item == null || !"payment".equals(item.getKey())) continue;
            if (item.getX() < 0 || item.getY() < 0) return null;
            float itemHeight = item.getHeight() > 0 ? item.getHeight() : layout.getFooter().getLineSpacing();
            if (isFixedPageSectionBlock(layout, item.getY(), itemHeight) != fixedOnly) return null;
            float lineGap = Math.max(item.getFontSize() + 3, Math.min(layout.getFooter().getLineSpacing(), 14));
            float extraHeight = lineGap * Math.max(0, paymentLines.size() - 1);
            float width = item.getWidth() > 0 ? item.getWidth() : 150f;
            float anchorY = effectivePaymentStartY(layout, fixedOnly, item);
            return new PaymentBlockMetrics(anchorY, lineGap, extraHeight, item.getX(), width, fixedOnly);
        }
        return null;
    }

    private boolean belongsToPaymentColumn(float originalX, float originalWidth, PaymentBlockMetrics metrics) {
        float paymentLeft = metrics.x();
        float elementLeft = originalX;
        float elementRight = originalWidth > 0 ? originalX + originalWidth : originalX;
        return elementLeft >= paymentLeft - 12f || elementRight >= paymentLeft + Math.max(8f, metrics.width() * 0.2f);
    }

    private static BigDecimal resolveToBePaid(FolioPdfRequest req) {
        if (req == null || req.getToBePaidGross() == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal value = req.getToBePaidGross().setScale(2, RoundingMode.HALF_UP);
        return value.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP) : value;
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

    private void drawSignature(PageContext ctx, FolioLayoutConfig layout, byte[] signatureBytes, float tableFlowOffset, boolean fixedOnly) throws IOException {
        if (signatureBytes == null || signatureBytes.length == 0) return;
        var sigCfg = layout.getSignature();
        if (sigCfg == null || !sigCfg.isVisible()) return;
        if (isFixedPageSectionBlock(layout, sigCfg.getY(), sigCfg.getHeight()) != fixedOnly) return;

        PDImageXObject img = PDImageXObject.createFromByteArray(ctx.doc, signatureBytes, "signature");
        float pageH = layout.getPageHeight();
        float sigY = fixedOnly ? sigCfg.getY() : shiftedBelowServicesTableY(sigCfg.getY(), layout, tableFlowOffset);
        float pdfY = pageH - sigY - sigCfg.getHeight();
        ctx.stream.drawImage(img, sigCfg.getX(), pdfY, sigCfg.getWidth(), sigCfg.getHeight());
    }

    /* ────────────────────────── drawing primitives ────────────────────────── */

    private int summaryFontSize(FolioLayoutConfig layout) {
        return compactTableFontSize(layout);
    }

    private int compactTableFontSize(FolioLayoutConfig layout) {
        int base = 8;
        if (layout != null && layout.getTable() != null && layout.getTable().getBodyFontSize() > 0) {
            base = layout.getTable().getBodyFontSize();
        }
        return Math.max(6, base - 1);
    }

    private void drawFooterLabelAndValue(PageContext ctx, PDFont font, int size, float leftX, float rightX, float y, String label, String value) throws IOException {
        String safeLabel = safe(label);
        if (safeLabel != null && !safeLabel.isBlank()) {
            String labelText = safeLabel.endsWith(":") ? safeLabel : safeLabel + ":";
            drawText(ctx, font, size, leftX, y, labelText);
        }
        drawTextRight(ctx, font, size, rightX, y, value);
    }

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

    private void drawTextCentered(PageContext ctx, PDFont font, int size, float x, float width, float y, String text) throws IOException {
        if (text == null || text.isBlank()) return;
        float tw = font.getStringWidth(text) / 1000f * size;
        drawText(ctx, font, size, x + (width - tw) / 2f, y, text);
    }

    private void drawHLine(PageContext ctx, float x1, float x2, float y, float lineWidth) throws IOException {
        var s = ctx.stream;
        s.setLineWidth(lineWidth);
        s.moveTo(x1, y);
        s.lineTo(x2, y);
        s.stroke();
    }

    private void drawDoubleHLine(PageContext ctx, float x1, float x2, float y, float lineWidth) throws IOException {
        drawHLine(ctx, x1, x2, y, lineWidth);
        drawHLine(ctx, x1, x2, y - DOUBLE_RULE_GAP, lineWidth);
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

    private static String currencyCode(FolioPdfRequest req) {
        String currency = req == null ? null : req.getCurrency();
        if (currency == null || currency.isBlank()) return "EUR";
        String normalized = currency.trim().toUpperCase(java.util.Locale.ROOT);
        return normalized.matches("^[A-Z]{3}$") ? normalized : "EUR";
    }

    private static String fmtMoney(BigDecimal v, FolioPdfRequest req) {
        return currencyCode(req) + " " + fmt(v);
    }

    private static String fmtMoneySuffix(BigDecimal v, FolioPdfRequest req) {
        return fmt(v) + " " + currencyCode(req);
    }

    private static String fmtMoneyDeductionSuffix(BigDecimal v, FolioPdfRequest req) {
        BigDecimal absolute = v == null ? BigDecimal.ZERO : v.abs();
        return "- " + fmt(absolute) + " " + currencyCode(req);
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
        if (value.isBlank() || value.contains("NO VAT") || value.contains("BREZ DDV") || value.contains("NEOBDAV")) {
            return VatBreakdownBucket.NO_VAT;
        }
        if (value.contains("22")) return VatBreakdownBucket.VAT_22;
        if (value.contains("9.5") || value.contains("9,5")) return VatBreakdownBucket.VAT_9_5;
        return VatBreakdownBucket.VAT_0;
    }

    private static String displayTaxPercent(String taxPercentRaw) {
        String value = taxPercentRaw == null ? "" : taxPercentRaw.trim();
        String upper = value.toUpperCase(Locale.ROOT);
        if (upper.isBlank() || upper.contains("NO VAT") || upper.contains("BREZ DDV") || upper.contains("NEOBDAV")) {
            return "";
        }
        return safe(value);
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

    private static float visualServicesTableBottom(float startY, float headerHeight, float rowHeight, int rows) {
        // Match the rendered services-table selection area to the bottom double line.
        // The bottom double line is intentionally raised above the old footer spacing,
        // so the layout block should end immediately after that line instead of leaving
        // an invisible gap.
        return startY + headerHeight + rowHeight * Math.max(0, rows) - 3f;
    }

    private static float shiftedBelowServicesTableY(float originalY, FolioLayoutConfig layout, float tableFlowOffset) {
        if (tableFlowOffset == 0) return originalY;
        var tbl = layout.getTable();
        float baselineTableBottom = visualServicesTableBottom(tbl.getStartY(), tbl.getHeaderHeight(), tbl.getRowHeight(), LAYOUT_PREVIEW_SERVICE_ROWS);
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


    private static String joinPostalCodeAndCity(String postalCode, String city) {
        String pc = safe(postalCode);
        String c = safe(city);
        if (pc.isBlank()) return c;
        if (c.isBlank()) return pc;
        return pc + " " + c;
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
