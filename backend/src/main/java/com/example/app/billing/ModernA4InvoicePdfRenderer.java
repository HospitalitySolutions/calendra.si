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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import javax.imageio.ImageIO;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

/**
 * Flow-based renderer for the new A4 invoice templates shown in the settings
 * screen. It intentionally ignores the legacy absolute A4 coordinates. The
 * saved A4 configuration now acts like the 58 mm configuration: template,
 * visibility, order, text size, tax clauses, reference text and footer text
 * are the source of truth for both preview and issued invoices.
 */
final class ModernA4InvoicePdfRenderer {
    private static final String FONT_REGULAR_CLASSPATH = "/fonts/NotoSans-Regular.ttf";
    private static final String FONT_BOLD_CLASSPATH = "/fonts/NotoSans-Bold.ttf";
    private static final String AUTO_NO_VAT_CLAUSE = "DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1.";
    private static final float PAGE_W = PDRectangle.A4.getWidth();
    private static final float PAGE_H = PDRectangle.A4.getHeight();
    private static final float MARGIN_X = 36f;
    private static final float TOP = 34f;
    private static final float BOTTOM = 34f;
    private static final float GRID_GAP = 12f;
    private static final float CONTENT_W = PAGE_W - 2 * MARGIN_X;
    private static final float COLUMN_W = (CONTENT_W - GRID_GAP) / 2f;
    private static final Color TEXT = new Color(15, 23, 42);
    private static final Color MUTED = new Color(100, 116, 139);
    private static final Color BORDER = new Color(220, 229, 240);
    private static final Color TABLE_BORDER = new Color(226, 232, 240);

    byte[] render(
            FolioPdfRequest request,
            FolioLayoutConfig layout,
            byte[] logoBytes,
            byte[] signatureBytes,
            String locale
    ) {
        String selectedLocale = normalizeLocale(locale == null || locale.isBlank() ? request.getLocale() : locale);
        Theme theme = Theme.from(layout);
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Fonts fonts = loadFonts(document);
            State state = new State(document, fonts, theme, selectedLocale, request, layout);
            state.newPage(false);

            for (GridRow row : buildDenseGrid(layout, request)) {
                if (row.full != null) {
                    if ("items".equals(row.full)) drawItems(state, layout, request);
                    else drawFullWidth(state, layout, request, logoBytes, signatureBytes, row.full);
                } else {
                    drawPair(state, layout, request, logoBytes, signatureBytes, row.left, row.right);
                }
            }

            state.close();
            document.save(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException("Unable to generate modern A4 invoice PDF", e);
        }
    }


    /** Mirrors CSS grid-auto-flow: row dense used by the former HTML preview. */
    private List<GridRow> buildDenseGrid(FolioLayoutConfig layout, FolioPdfRequest request) {
        if (isPresetTemplate(layout)) return buildPresetGrid(layout, request);
        List<GridRow> rows = new ArrayList<>();
        for (String section : effectiveSectionOrder(layout)) {
            if (!isRenderable(section, request, layout)) continue;
            if (isFullWidth(section, layout)) {
                rows.add(GridRow.full(section));
                continue;
            }
            GridRow available = null;
            for (GridRow row : rows) {
                if (row.full == null && row.left != null && row.right == null) {
                    available = row;
                    break;
                }
            }
            if (available == null) rows.add(GridRow.half(section));
            else available.right = section;
        }
        return rows;
    }

    private void drawPair(
            State state,
            FolioLayoutConfig layout,
            FolioPdfRequest request,
            byte[] logoBytes,
            byte[] signatureBytes,
            String leftSection,
            String rightSection
    ) throws IOException {
        float leftHeight = leftSection == null ? 0 : estimateSectionHeight(state, layout, request, leftSection, COLUMN_W);
        float rightHeight = rightSection == null ? 0 : estimateSectionHeight(state, layout, request, rightSection, COLUMN_W);
        float rowHeight = Math.max(leftHeight, rightHeight);
        if (rowHeight <= 0f) return;
        state.ensureSpace(rowHeight);
        float y = state.y;
        if (leftSection != null) {
            drawSection(state, layout, request, logoBytes, signatureBytes, leftSection, MARGIN_X, y, COLUMN_W, rowHeight);
        }
        if (rightSection != null) {
            drawSection(state, layout, request, logoBytes, signatureBytes, rightSection, MARGIN_X + COLUMN_W + GRID_GAP, y, COLUMN_W, rowHeight);
        }
        state.y += rowHeight + state.theme.gap;
    }

    private void drawFullWidth(
            State state,
            FolioLayoutConfig layout,
            FolioPdfRequest request,
            byte[] logoBytes,
            byte[] signatureBytes,
            String section
    ) throws IOException {
        float height = estimateSectionHeight(state, layout, request, section, CONTENT_W);
        state.ensureSpace(height);
        drawSection(state, layout, request, logoBytes, signatureBytes, section, MARGIN_X, state.y, CONTENT_W, height);
        state.y += height + state.theme.gap;
    }

    private List<GridRow> buildPresetGrid(FolioLayoutConfig layout, FolioPdfRequest request) {
        List<GridRow> rows = new ArrayList<>();
        addPresetFull(rows, layout, request, "company");
        addPresetPair(rows, isRenderable("recipient", request, layout) ? "recipient" : null, "document");
        addPresetFull(rows, layout, request, "items");
        addPresetPair(rows,
                isRenderable("taxClauses", request, layout) ? "taxClauses" : null,
                isRenderable("totals", request, layout) ? "totals" : null);
        addPresetPair(rows,
                isRenderable("fiscal", request, layout) ? "fiscal" : null,
                isRenderable("reference", request, layout) ? "reference" : null);
        addPresetPair(rows,
                isRenderable("issuedBy", request, layout) ? "issuedBy" : null,
                isRenderable("signature", request, layout) ? "signature" : null);
        return rows;
    }

    private void addPresetFull(List<GridRow> rows, FolioLayoutConfig layout, FolioPdfRequest request, String section) {
        if (isRenderable(section, request, layout)) rows.add(GridRow.full(section));
    }

    private void addPresetPair(List<GridRow> rows, String left, String right) {
        if (left == null && right == null) return;
        GridRow row = new GridRow();
        row.left = left;
        row.right = right;
        rows.add(row);
    }

    private void drawSection(
            State state,
            FolioLayoutConfig layout,
            FolioPdfRequest request,
            byte[] logoBytes,
            byte[] signatureBytes,
            String section,
            float x,
            float y,
            float width,
            float height
    ) throws IOException {
        drawSectionFrame(state, section, x, y, width, height);
        switch (section) {
            case "company" -> drawCompany(state, request, layout, logoBytes, x, y, width, height);
            case "document" -> drawDocument(state, request, x, y, width, height);
            case "recipient" -> drawRecipient(state, request, x, y, width, height);
            case "advancePayments" -> drawAdvancePayments(state, request, x, y, width, height);
            case "vat" -> drawVatBreakdown(state, request, x, y, width, height);
            case "totals" -> drawTotals(state, request, x, y, width, height);
            case "taxClauses" -> drawTaxClauses(state, layout, request, x, y, width, height);
            case "reference" -> drawReference(state, layout, request, x, y, width, height);
            case "paymentQr" -> drawPaymentQr(state, request, x, y, width, height);
            case "fiscal" -> drawFiscal(state, request, x, y, width, height);
            case "issuedBy" -> drawIssuedBy(state, request, x, y, width, height);
            case "signature" -> drawSignature(state, signatureBytes, x, y, width, height);
            case "footer" -> drawFooterText(state, layout, x, y, width, height);
            default -> { }
        }
    }

    private void drawCompany(State state, FolioPdfRequest request, FolioLayoutConfig layout, byte[] logoBytes, float x, float y, float width, float height) throws IOException {
        if (state.theme.minimal) {
            drawCompanyMinimal(state, request, layout, logoBytes, x, y, width, height);
        } else if ("CLASSIC".equals(state.theme.template)) {
            drawCompanyClassic(state, request, layout, logoBytes, x, y, width, height);
        } else if ("COMPACT".equals(state.theme.template)) {
            drawCompanyCompact(state, request, layout, logoBytes, x, y, width, height);
        }
    }

    private void drawDocument(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        if (state.theme.minimal) {
            drawDocumentMinimal(state, request, x, y, width, height);
        } else if ("CLASSIC".equals(state.theme.template)) {
            drawDocumentClassic(state, request, x, y, width, height);
        } else {
            drawDocumentCompact(state, request, x, y, width, height);
        }
    }

    private void drawMeta(State state, float x, float y, float width, String label, String value) throws IOException {
        state.text(state.fonts.regular, state.theme.small, x, y + state.theme.small, label, MUTED);
        state.text(state.fonts.bold, state.theme.base, x, y + state.theme.small + state.theme.line, fitText(state.fonts.bold, state.theme.base, width, value), TEXT);
    }

    private void drawRecipient(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        float baseline = sectionTitle(state, recipientLabel(state.locale), x, y, width);
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, safe(request.getRecipientName()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, safe(request.getRecipientAddress()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, joinPostalCity(request.getRecipientPostalCode(), request.getRecipientCity()), TEXT);
        if (!safe(request.getRecipientVatId()).isBlank()) {
            baseline += state.theme.line;
            state.text(state.fonts.regular, state.theme.base, x + pad, baseline, safe(request.getRecipientVatId()), TEXT);
        }
    }

    private void drawAdvancePayments(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        float baseline = sectionTitle(state, advancesLabel(state.locale), x, y, width);
        List<FolioPdfRequest.AdvancePaymentLine> lines = request.getAdvancePayments() == null ? List.of() : request.getAdvancePayments();
        if (lines.isEmpty()) {
            state.text(state.fonts.regular, state.theme.base, x + pad, baseline, advancesSingularLabel(state.locale), TEXT);
            state.textRight(state.fonts.bold, state.theme.base, x + width - pad, baseline, money(request.getUsedAdvancePaymentsGross(), state.locale), TEXT);
            return;
        }
        for (FolioPdfRequest.AdvancePaymentLine line : lines) {
            String label = firstNonBlank(line.getAdvanceNumber(), advancesSingularLabel(state.locale));
            BigDecimal amount = line.getUsedGross() != null ? line.getUsedGross() : line.getTotalGross();
            state.text(state.fonts.regular, state.theme.base, x + pad, baseline, fitText(state.fonts.regular, state.theme.base, width * 0.64f, label), TEXT);
            state.textRight(state.fonts.bold, state.theme.base, x + width - pad, baseline, money(amount, state.locale), TEXT);
            baseline += state.theme.line + 2f;
        }
    }

    private void drawVatBreakdown(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        float baseline = sectionTitle(state, vatBreakdownLabel(state.locale), x, y, width);
        List<VatRow> rows = vatRows(request.getServices());
        String[] headers = vatHeaders(state.locale);
        // Keep all VAT column titles fully visible. The previous narrow rate column
        // shortened "Stopnja DDV" to "Stopnja D…", which also made the generated
        // PDF differ from the configured A4 template and broke text extraction.
        float[] proportions = {0.29f, 0.24f, 0.22f, 0.25f};
        float currentX = x + pad;
        float tableW = width - 2 * pad;
        for (int i = 0; i < headers.length; i++) {
            float cellW = tableW * proportions[i];
            float headerSize = fitFontSize(
                    state.fonts.bold,
                    state.theme.small,
                    Math.max(5f, state.theme.small - 2f),
                    cellW - 3f,
                    headers[i]
            );
            state.text(state.fonts.bold, headerSize, currentX, baseline, headers[i], MUTED);
            currentX += cellW;
        }
        baseline += state.theme.line;
        for (VatRow row : rows) {
            currentX = x + pad;
            String[] values = {vatRowLabel(row.bucket, state.locale), vatRate(row.bucket, state.locale), vatMoney(row.net), vatMoney(row.vat)};
            for (int i = 0; i < values.length; i++) {
                float cellW = tableW * proportions[i];
                if (i >= 2) state.textRight(state.fonts.regular, state.theme.base, currentX + cellW - 2f, baseline, values[i], TEXT);
                else state.text(state.fonts.regular, state.theme.base, currentX, baseline, values[i], TEXT);
                currentX += cellW;
            }
            baseline += state.theme.line + 1f;
        }
    }

    private void drawTotals(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        BigDecimal net = totalNet(request.getServices());
        BigDecimal gross = totalGross(request.getServices());
        BigDecimal discount = nvl(request.getDiscountAmountGross());
        BigDecimal total = gross;
        if (request.getSubtotalBeforeDiscountGross() != null) {
            total = request.getSubtotalBeforeDiscountGross().subtract(discount).max(BigDecimal.ZERO);
        }
        BigDecimal payable = request.getToBePaidGross() == null
                ? total.subtract(nvl(request.getUsedAdvancePaymentsGross())).max(BigDecimal.ZERO)
                : request.getToBePaidGross().max(BigDecimal.ZERO);

        float baseline = y + pad + state.theme.base;
        drawTotalRow(state, x, width, pad, baseline, subtotalLabel(state.locale), money(net, state.locale), false);
        baseline += state.theme.line + 2f;
        if (showInlineVatBreakdown(request, state)) {
            drawTotalRow(state, x, width, pad, baseline, vatBreakdownLabel(state.locale), inlineVatBreakdownValue(request, state.locale), false);
            baseline += state.theme.line + 2f;
        }
        if (discount.compareTo(BigDecimal.ZERO) != 0) {
            drawTotalRow(state, x, width, pad, baseline, discountLabel(state.locale), "-" + money(discount.abs(), state.locale), false);
            baseline += state.theme.line + 2f;
        }
        drawTotalRow(state, x, width, pad, baseline, totalLabel(state.locale), money(total, state.locale), true);
        baseline += state.theme.line + 8f;
        state.line(x + pad, baseline - state.theme.base - 4f, x + width - pad, baseline - state.theme.base - 4f, state.theme.accent, 0.9f);
        state.text(state.fonts.bold, state.theme.base + 0.3f, x + pad, baseline, payableLabel(state.locale), state.theme.accent);
        state.textRight(state.fonts.bold, state.theme.base + 0.3f, x + width - pad, baseline, money(payable, state.locale), state.theme.accent);
    }

    private void drawTotalRow(State state, float x, float width, float pad, float baseline, String label, String value, boolean bold) throws IOException {
        PDFont font = bold ? state.fonts.bold : state.fonts.regular;
        state.text(font, state.theme.base, x + pad, baseline, label, TEXT);
        state.textRight(font, state.theme.base, x + width - pad, baseline, value, TEXT);
    }

    private void drawTaxClauses(State state, FolioLayoutConfig layout, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        float baseline = y + pad + state.theme.base;
        for (String clause : effectiveTaxClauses(layout, request)) {
            List<String> lines = wrap(state.fonts.regular, state.theme.base, width - 2 * pad, clause);
            for (String line : lines) {
                state.text(state.fonts.regular, state.theme.base, x + pad, baseline, line, TEXT);
                baseline += state.theme.line;
            }
            baseline += 3f;
        }
    }

    private void drawReference(State state, FolioLayoutConfig layout, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        float baseline = y + pad + state.theme.base;
        if ("CLASSIC".equals(state.theme.template)) {
            state.text(state.fonts.bold, state.theme.sectionTitle, x + pad, baseline, referenceLabel(state.locale).toUpperCase(Locale.ROOT), state.theme.accent);
            baseline += state.theme.line + 4f;
        }
        String reference = referenceText(layout, request, state.locale);
        for (String line : wrap(state.fonts.regular, state.theme.base, width - 2 * pad, reference)) {
            state.text(state.fonts.regular, state.theme.base, x + pad, baseline, line, TEXT);
            baseline += state.theme.line;
        }
        if (layout.getPaymentQr() != null && layout.getPaymentQr().isVisible() && !safe(request.getPaymentQrPayload()).isBlank()) {
            byte[] png = createQrPng(request.getPaymentQrPayload(), 180, 180);
            PDImageXObject qr = PDImageXObject.createFromByteArray(state.document, png, "upn-qr");
            float size = "COMPACT".equals(state.theme.template) ? 66f : 62f;
            float qrY = Math.min(y + height - pad - size - state.theme.small - 7f, baseline + 8f);
            state.drawImage(qr, x + pad, qrY, size, size);
            String caption = "COMPACT".equals(state.theme.template)
                    ? ("sl".equals(state.locale) ? "UPN QR za plačilo" : scanPayLabel(state.locale))
                    : scanPayLabel(state.locale);
            state.text(state.fonts.regular, state.theme.small, x + pad, qrY + size + state.theme.small + 3f, caption, state.theme.accent);
        }
    }

    private void drawPaymentQr(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        sectionTitle(state, "UPN QR", x, y, width);
        byte[] png = createQrPng(request.getPaymentQrPayload(), 180, 180);
        PDImageXObject qr = PDImageXObject.createFromByteArray(state.document, png, "upn-qr");
        float size = Math.min(72f, height - 35f);
        state.drawImage(qr, x + pad, y + 28f, size, size);
        state.text(state.fonts.regular, state.theme.small, x + pad, y + 31f + size + state.theme.small, scanPayLabel(state.locale), MUTED);
    }

    private void drawFiscal(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        float baseline = y + pad;
        if ("CLASSIC".equals(state.theme.template)) {
            state.text(state.fonts.bold, state.theme.sectionTitle, x + pad, baseline + state.theme.sectionTitle, fiscalLabel(state.locale).toUpperCase(Locale.ROOT), state.theme.accent);
            baseline += state.theme.line + 9f;
        }
        float qrSize = state.theme.minimal ? 62f : "COMPACT".equals(state.theme.template) ? 70f : 66f;
        boolean hasQr = !safe(request.getFiscalQr()).isBlank();
        if (hasQr) {
            byte[] png = createQrPng(request.getFiscalQr(), 160, 160);
            PDImageXObject qr = PDImageXObject.createFromByteArray(state.document, png, "fiscal-qr");
            state.drawImage(qr, x + pad, baseline, qrSize, qrSize);
        }
        float textX;
        float textY;
        float textWidth;
        if (state.theme.minimal) {
            textX = x + pad;
            textY = baseline + (hasQr ? qrSize + 10f : state.theme.base);
            textWidth = width - 2 * pad;
        } else {
            textX = x + pad + (hasQr ? qrSize + 12f : 0f);
            textY = baseline + state.theme.base + 4f;
            textWidth = width - (textX - x) - pad;
        }
        if (!safe(request.getFiscalZoi()).isBlank()) {
            for (String line : wrap(state.fonts.regular, state.theme.small, textWidth, "ZOI: " + safe(request.getFiscalZoi()))) {
                state.text(state.fonts.regular, state.theme.small, textX, textY, line, TEXT);
                textY += state.theme.line;
            }
        }
        if (!safe(request.getFiscalEor()).isBlank()) {
            for (String line : wrap(state.fonts.regular, state.theme.small, textWidth, "EOR: " + safe(request.getFiscalEor()))) {
                state.text(state.fonts.regular, state.theme.small, textX, textY, line, TEXT);
                textY += state.theme.line;
            }
        }
    }

    private void drawIssuedBy(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        float baseline = sectionTitle(state, issuedByLabel(state.locale), x, y, width);
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, safe(request.getIssuedBy()), TEXT);
    }

    private void drawSignature(State state, byte[] signatureBytes, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        sectionTitle(state, signatureLabel(state.locale), x, y, width);
        if (signatureBytes != null && signatureBytes.length > 0) {
            try {
                PDImageXObject image = PDImageXObject.createFromByteArray(state.document, signatureBytes, "a4-signature");
                state.drawImage(image, x + pad, y + 24f, Math.min(130f, width - 2 * pad), Math.min(36f, height - 30f));
                return;
            } catch (IOException ignored) {
                // Draw a signature line instead.
            }
        }
        state.line(x + pad, y + Math.min(height - 10f, 46f), x + Math.min(width - pad, 150f), y + Math.min(height - 10f, 46f), new Color(190, 198, 210), 0.6f);
    }

    private void drawFooterText(State state, FolioLayoutConfig layout, float x, float y, float width, float height) throws IOException {
        if (state.theme.minimal) return;
        String footer = footerText(layout, state.locale);
        float baseline = y + (height + state.theme.base) / 2f;
        state.textCentered(state.fonts.regular, state.theme.base, x, width, baseline, footer, MUTED);
    }

    private void drawItems(State state, FolioLayoutConfig layout, FolioPdfRequest request) throws IOException {
        List<FolioPdfRequest.ServiceLine> lines = request.getServices() == null ? List.of() : request.getServices();
        boolean showQty = quantityVisible(layout);
        int index = 0;
        boolean firstSegment = true;
        while (firstSegment || index < lines.size()) {
            firstSegment = false;
            float titleH = "CLASSIC".equals(state.theme.template) ? 24f : "COMPACT".equals(state.theme.template) ? 18f : 20f;
            float headerH = "COMPACT".equals(state.theme.template) ? 18f : 20f;
            float minimum = titleH + headerH + 24f + 2 * state.theme.pad;
            state.ensureSpace(minimum);
            float segmentY = state.y;
            float cursor = segmentY;

            if ("CLASSIC".equals(state.theme.template)) {
                state.fillRect(MARGIN_X, cursor, CONTENT_W, titleH, state.theme.accent);
                state.text(state.fonts.bold, state.theme.sectionTitle, MARGIN_X + state.theme.pad, cursor + 15f, itemsLabel(state.locale).toUpperCase(Locale.ROOT), Color.WHITE);
            } else if ("COMPACT".equals(state.theme.template)) {
                state.line(MARGIN_X, cursor, MARGIN_X + CONTENT_W, cursor, state.theme.accent, 1.1f);
                state.text(state.fonts.bold, state.theme.sectionTitle, MARGIN_X + state.theme.pad, cursor + 13f, itemsLabel(state.locale).toUpperCase(Locale.ROOT), state.theme.accent);
            } else {
                cursor += state.theme.pad;
                state.text(state.fonts.bold, state.theme.sectionTitle, MARGIN_X + state.theme.pad, cursor + state.theme.sectionTitle, itemsLabel(state.locale).toUpperCase(Locale.ROOT), state.theme.accent);
            }
            cursor = segmentY + titleH;
            drawItemsHeader(state, MARGIN_X + (state.theme.minimal ? state.theme.pad : 0f), cursor,
                    CONTENT_W - (state.theme.minimal ? 2 * state.theme.pad : 0f), headerH, showQty);
            cursor += headerH;

            int segmentStartIndex = index;
            while (index < lines.size()) {
                FolioPdfRequest.ServiceLine line = lines.get(index);
                float rowH = itemRowHeight(state, line, showQty);
                if (cursor + rowH + state.theme.pad > PAGE_H - BOTTOM) break;
                drawItemRow(state, line, index + 1,
                        MARGIN_X + (state.theme.minimal ? state.theme.pad : 0f), cursor,
                        CONTENT_W - (state.theme.minimal ? 2 * state.theme.pad : 0f), rowH, showQty);
                cursor += rowH;
                index++;
            }
            if (segmentStartIndex == index && index < lines.size()) {
                FolioPdfRequest.ServiceLine line = lines.get(index);
                float forcedH = Math.max(24f, PAGE_H - BOTTOM - state.theme.pad - cursor);
                drawItemRow(state, line, index + 1,
                        MARGIN_X + (state.theme.minimal ? state.theme.pad : 0f), cursor,
                        CONTENT_W - (state.theme.minimal ? 2 * state.theme.pad : 0f), forcedH, showQty);
                cursor += forcedH;
                index++;
            }
            if (lines.isEmpty()) cursor += 20f;
            float segmentHeight = cursor - segmentY + (state.theme.minimal ? state.theme.pad : 0f);
            drawItemsFrame(state, MARGIN_X, segmentY, CONTENT_W, segmentHeight);
            state.y = segmentY + segmentHeight + state.theme.gap;
            if (index < lines.size()) state.newPage(true);
        }
    }

    private void drawItemsHeader(State state, float x, float y, float width, float height, boolean showQty) throws IOException {
        Color fill = "CLASSIC".equals(state.theme.template)
                ? tint(state.theme.accent, 0.92f)
                : "COMPACT".equals(state.theme.template) ? tint(state.theme.accent, 0.95f) : tint(state.theme.accent, 0.92f);
        state.fillRect(x, y, width, height, fill);
        float[] widths = itemColumnWidths(width, showQty);
        String[] headers = showQty
                ? new String[]{"#", descriptionLabel(state.locale), quantityLabel(state.locale), priceExVatLabel(state.locale), "DDV (%)", subtotalLabel(state.locale), discountColumnLabel(state.locale), grossTotalColumnLabel(state.locale)}
                : new String[]{"#", descriptionLabel(state.locale), priceExVatLabel(state.locale), "DDV (%)", subtotalLabel(state.locale), discountColumnLabel(state.locale), grossTotalColumnLabel(state.locale)};
        float currentX = x;
        float baseline = y + (height + state.theme.small) / 2f;
        Color headerColor = "COMPACT".equals(state.theme.template) ? state.theme.accent : MUTED;
        for (int i = 0; i < headers.length; i++) {
            float cellW = widths[i];
            if (i >= 2) state.textRight(state.fonts.bold, state.theme.small, currentX + cellW - 3f, baseline, fitText(state.fonts.bold, state.theme.small, cellW - 6f, headers[i]), headerColor);
            else state.text(state.fonts.bold, state.theme.small, currentX + 3f, baseline, fitText(state.fonts.bold, state.theme.small, cellW - 6f, headers[i]), headerColor);
            currentX += cellW;
        }
        state.line(x, y + height, x + width, y + height, "COMPACT".equals(state.theme.template) ? state.theme.accent : TABLE_BORDER, 0.6f);
    }

    private void drawItemRow(State state, FolioPdfRequest.ServiceLine line, int number, float x, float y, float width, float height, boolean showQty) throws IOException {
        float[] widths = itemColumnWidths(width, showQty);
        String[] values = showQty
                ? new String[]{String.valueOf(number), safe(line.getDescription()), String.valueOf(line.getQty()), money(line.getNettPrice(), state.locale), displayTax(line.getTaxPercent()), money(lineNet(line), state.locale), money(lineDiscountGross(line), state.locale), money(lineGross(line), state.locale)}
                : new String[]{String.valueOf(number), safe(line.getDescription()), money(line.getNettPrice(), state.locale), displayTax(line.getTaxPercent()), money(lineNet(line), state.locale), money(lineDiscountGross(line), state.locale), money(lineGross(line), state.locale)};
        float currentX = x;
        float baseline = y + state.theme.base + 6f;
        for (int i = 0; i < values.length; i++) {
            float cellW = widths[i];
            if (i == 1) {
                List<String> wrapped = wrap(state.fonts.regular, state.theme.base, cellW - 7f, values[i]);
                float lineY = baseline;
                for (String text : wrapped) {
                    if (lineY > y + height - 3f) break;
                    state.text(state.fonts.regular, state.theme.base, currentX + 3f, lineY, text, TEXT);
                    lineY += state.theme.line;
                }
            } else if (i >= 2) {
                state.textRight(state.fonts.regular, state.theme.base, currentX + cellW - 3f, baseline, fitText(state.fonts.regular, state.theme.base, cellW - 6f, values[i]), TEXT);
            } else {
                state.text(state.fonts.regular, state.theme.base, currentX + 3f, baseline, values[i], TEXT);
            }
            currentX += cellW;
        }
        state.line(x, y + height, x + width, y + height, TABLE_BORDER, 0.45f);
    }

    private float[] itemColumnWidths(float width, boolean showQty) {
        if (showQty) {
            float remaining = width - 22f;
            float opis = remaining * 0.31f;
            float qty = remaining * 0.08f;
            float price = remaining * 0.15f;
            float ddv = remaining * 0.11f;
            float subtotal = remaining * 0.14f;
            float discount = remaining * 0.10f;
            float gross = remaining - opis - qty - price - ddv - subtotal - discount;
            return new float[]{22f, opis, qty, price, ddv, subtotal, discount, gross};
        }
        float remaining = width - 22f;
        float opis = remaining * 0.42f;
        float price = remaining * 0.16f;
        float ddv = remaining * 0.11f;
        float subtotal = remaining * 0.14f;
        float discount = remaining * 0.09f;
        float gross = remaining - opis - price - ddv - subtotal - discount;
        return new float[]{22f, opis, price, ddv, subtotal, discount, gross};
    }

    private float itemRowHeight(State state, FolioPdfRequest.ServiceLine line, boolean showQty) throws IOException {
        float width = CONTENT_W - 2 * state.theme.pad;
        float descriptionW = itemColumnWidths(width, showQty)[1] - 7f;
        int lines = Math.max(1, wrap(state.fonts.regular, state.theme.base, descriptionW, safe(line.getDescription())).size());
        return Math.max(22f, lines * state.theme.line + 8f);
    }

    private float estimateSectionHeight(State state, FolioLayoutConfig layout, FolioPdfRequest request, String section, float width) throws IOException {
        float p = state.theme.pad;
        if (state.theme.minimal) {
            return switch (section) {
                case "company" -> 92f;
                case "document" -> 102f;
                case "recipient" -> 102f + (!safe(request.getRecipientVatId()).isBlank() ? state.theme.line : 0f);
                case "advancePayments" -> 0f;
                case "vat" -> 0f;
                case "totals" -> 88f + (showInlineVatBreakdown(request, state) ? state.theme.line + 2f : 0f) + (nvl(request.getDiscountAmountGross()).compareTo(BigDecimal.ZERO) != 0 ? state.theme.line + 2f : 0f);
                case "taxClauses" -> Math.max(44f, estimateTaxClauses(state, layout, request, width));
                case "reference" -> 108f;
                case "paymentQr", "fiscal" -> 118f;
                case "issuedBy", "signature" -> 64f;
                case "footer" -> 0f;
                default -> 50f;
            };
        }
        if ("CLASSIC".equals(state.theme.template)) {
            return switch (section) {
                case "company" -> 112f;
                case "document", "recipient" -> 112f;
                case "vat" -> 0f;
                case "totals" -> 102f + (showInlineVatBreakdown(request, state) ? state.theme.line + 2f : 0f) + (nvl(request.getDiscountAmountGross()).compareTo(BigDecimal.ZERO) != 0 ? state.theme.line + 2f : 0f);
                case "taxClauses" -> Math.max(82f, estimateTaxClauses(state, layout, request, width));
                case "reference", "fiscal" -> 132f;
                case "issuedBy", "signature" -> 72f;
                default -> 56f;
            };
        }
        if ("COMPACT".equals(state.theme.template)) {
            return switch (section) {
                case "company" -> 106f;
                case "document", "recipient" -> 106f;
                case "vat" -> 0f;
                case "totals" -> 92f + (showInlineVatBreakdown(request, state) ? state.theme.line + 2f : 0f) + (nvl(request.getDiscountAmountGross()).compareTo(BigDecimal.ZERO) != 0 ? state.theme.line + 2f : 0f);
                case "taxClauses" -> Math.max(70f, estimateTaxClauses(state, layout, request, width));
                case "reference", "fiscal" -> 122f;
                case "issuedBy", "signature" -> 66f;
                default -> 50f;
            };
        }
        return 50f;
    }

    private float estimateTaxClauses(State state, FolioLayoutConfig layout, FolioPdfRequest request, float width) throws IOException {
        int count = 0;
        for (String clause : effectiveTaxClauses(layout, request)) {
            count += Math.max(1, wrap(state.fonts.regular, state.theme.base, width - 2 * state.theme.pad, clause).size());
        }
        return 2 * state.theme.pad + Math.max(state.theme.line, count * state.theme.line + 4f);
    }

    private float sectionTitle(State state, String title, float x, float y, float width) throws IOException {
        float baseline = y + state.theme.pad + state.theme.sectionTitle;
        state.text(state.fonts.bold, state.theme.sectionTitle, x + state.theme.pad, baseline, title.toUpperCase(Locale.ROOT), state.theme.accent);
        return baseline + state.theme.line + 2f;
    }


    private void drawItemsFrame(State state, float x, float y, float width, float height) throws IOException {
        if (state.theme.minimal) {
            state.line(x, y + height, x + width, y + height, BORDER, 0.55f);
        } else if ("CLASSIC".equals(state.theme.template)) {
            state.rect(x, y, width, height, BORDER, 0.7f);
        } else {
            state.line(x, y + height, x + width, y + height, state.theme.accent, 0.65f);
        }
    }

    private void drawSectionFrame(State state, String section, float x, float y, float width, float height) throws IOException {
        if (state.theme.minimal || "company".equals(section)) return;
        if ("CLASSIC".equals(state.theme.template)) {
            if ("totals".equals(section)) state.fillRect(x, y, width, height, tint(state.theme.accent, 0.96f));
            state.rect(x, y, width, height, BORDER, 0.65f);
            return;
        }
        if ("recipient".equals(section) || "document".equals(section) || "taxClauses".equals(section)) {
            state.rect(x, y, width, height, tint(state.theme.accent, 0.72f), 0.65f);
        } else if ("fiscal".equals(section) || "reference".equals(section) || "issuedBy".equals(section) || "signature".equals(section)) {
            state.line(x, y, x + width, y, BORDER, 0.55f);
        }
    }

    private boolean isRenderable(String section, FolioPdfRequest request, FolioLayoutConfig layout) {
        if (layout.getHiddenSections() != null && layout.getHiddenSections().contains(section)) return false;
        boolean preset = isPresetTemplate(layout);
        return switch (section) {
            case "company", "document", "items", "totals" -> true;
            case "recipient" -> recipientVisible(layout) && !safe(request.getRecipientName()).isBlank();
            case "advancePayments" -> !preset && (advanceCount(request) > 0 || nvl(request.getUsedAdvancePaymentsGross()).compareTo(BigDecimal.ZERO) > 0);
            case "vat" -> !preset && layout.getVatBreakdownTable() != null && layout.getVatBreakdownTable().isVisible() && !vatRows(request.getServices()).isEmpty();
            case "taxClauses" -> !effectiveTaxClauses(layout, request).isEmpty();
            case "reference" -> footerVisible(layout, "notes", true) && !safe(request.getNotes()).isBlank();
            case "paymentQr" -> !preset && layout.getPaymentQr() != null && layout.getPaymentQr().isVisible() && !safe(request.getPaymentQrPayload()).isBlank();
            case "fiscal" -> fiscalVisible(layout) && (!safe(request.getFiscalQr()).isBlank() || !safe(request.getFiscalZoi()).isBlank() || !safe(request.getFiscalEor()).isBlank());
            case "issuedBy" -> footerVisible(layout, "issuedBy", true) && !safe(request.getIssuedBy()).isBlank();
            case "signature" -> layout.getSignature() != null && layout.getSignature().isVisible();
            case "footer" -> !preset && !footerText(layout, normalizeLocale(request.getLocale())).isBlank();
            default -> false;
        };
    }

    private static boolean isFullWidth(String section, FolioLayoutConfig layout) {
        if (isPresetTemplate(layout)) return "company".equals(section) || "items".equals(section) || "footer".equals(section);
        return "items".equals(section) || "taxClauses".equals(section) || "footer".equals(section);
    }

    private static List<String> effectiveSectionOrder(FolioLayoutConfig layout) {
        List<String> defaults = isPresetTemplate(layout)
                ? List.of("company", "recipient", "document", "items", "taxClauses", "totals", "fiscal", "reference", "issuedBy", "signature", "footer")
                : List.of("company", "document", "recipient", "advancePayments", "items", "vat", "totals", "taxClauses", "reference", "paymentQr", "fiscal", "issuedBy", "signature", "footer");
        if (isPresetTemplate(layout)) return new ArrayList<>(defaults);
        Set<String> result = new LinkedHashSet<>();
        if (layout.getSectionOrder() != null) {
            for (String section : layout.getSectionOrder()) if (defaults.contains(section)) result.add(section);
        }
        result.addAll(defaults);
        return new ArrayList<>(result);
    }

    private static boolean recipientVisible(FolioLayoutConfig layout) {
        if (layout.getFields() == null) return true;
        boolean found = false;
        for (FolioLayoutConfig.FieldConfig field : layout.getFields()) {
            if (field != null && "recipient".equals(field.getGroup())) {
                found = true;
                if (field.isVisible()) return true;
            }
        }
        return !found;
    }

    private static boolean quantityVisible(FolioLayoutConfig layout) {
        if (layout.getTable() == null || layout.getTable().getColumns() == null) return true;
        for (FolioLayoutConfig.ColumnConfig column : layout.getTable().getColumns()) {
            if (column != null && "qty".equals(column.getKey())) return column.isVisible();
        }
        return true;
    }

    private static boolean footerVisible(FolioLayoutConfig layout, String key, boolean fallback) {
        if (layout.getFooter() == null || layout.getFooter().getItems() == null) return fallback;
        for (FolioLayoutConfig.FooterItem item : layout.getFooter().getItems()) {
            if (item != null && key.equals(item.getKey())) return item.isVisible();
        }
        return fallback;
    }

    private static boolean fiscalVisible(FolioLayoutConfig layout) {
        boolean qr = layout.getFiscalQr() == null || layout.getFiscalQr().isVisible();
        return qr || footerVisible(layout, "fiscalZoi", true) || footerVisible(layout, "fiscalEor", true);
    }

    private static String footerText(FolioLayoutConfig layout, String locale) {
        if (layout.getFields() == null) return "";
        for (FolioLayoutConfig.FieldConfig field : layout.getFields()) {
            if (field != null && "templateFooterText".equals(field.getKey()) && field.isVisible()) {
                if (field.getTextI18n() != null) {
                    String localized = "sl".equals(locale) ? field.getTextI18n().getSl() : field.getTextI18n().getEn();
                    if (!safe(localized).isBlank()) return safe(localized);
                }
                return safe(field.getText());
            }
        }
        return "";
    }

    private static String referenceText(FolioLayoutConfig layout, FolioPdfRequest request, String locale) {
        String template = safe(layout.getReferenceText());
        if (template.isBlank()) {
            template = switch (locale) {
                case "sl" -> "Prosimo, da se pri plačilu sklicujete na št.: {reference-number}";
                case "sr" -> "Molimo da se prilikom plaćanja pozovete na broj: {reference-number}";
                default -> "Please use reference number {reference-number} when making payment.";
            };
        }
        String reference = safe(request.getNotes());
        return template.replace("{reference-number}", reference);
    }

    private static List<String> effectiveTaxClauses(FolioLayoutConfig layout, FolioPdfRequest request) {
        LinkedHashSet<String> clauses = new LinkedHashSet<>();
        // This clause is system-controlled, exactly as on 58 mm receipts. It must
        // not be enabled manually and is rendered only when every service line
        // explicitly uses the BREZ DDV / NO VAT tax level.
        if (allServicesExplicitlyNoVat(request == null ? null : request.getServices())) {
            clauses.add(AUTO_NO_VAT_CLAUSE);
        }
        if (layout != null && layout.getTaxClauses() != null) {
            for (String clause : layout.getTaxClauses()) {
                String normalized = safe(clause);
                if (!normalized.isBlank() && !AUTO_NO_VAT_CLAUSE.equals(normalized)) clauses.add(normalized);
            }
        }
        return new ArrayList<>(clauses);
    }

    private static int advanceCount(FolioPdfRequest request) {
        return request.getAdvancePayments() == null ? 0 : request.getAdvancePayments().size();
    }

    private static BigDecimal totalNet(List<FolioPdfRequest.ServiceLine> lines) {
        BigDecimal total = BigDecimal.ZERO;
        if (lines != null) for (FolioPdfRequest.ServiceLine line : lines) total = total.add(lineNet(line));
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal totalGross(List<FolioPdfRequest.ServiceLine> lines) {
        BigDecimal total = BigDecimal.ZERO;
        if (lines != null) for (FolioPdfRequest.ServiceLine line : lines) total = total.add(lineGross(line));
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal lineNet(FolioPdfRequest.ServiceLine line) {
        if (line == null) return BigDecimal.ZERO;
        return nvl(line.getNettPrice()).multiply(BigDecimal.valueOf(Math.max(0, line.getQty()))).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal lineGross(FolioPdfRequest.ServiceLine line) {
        if (line == null) return BigDecimal.ZERO;
        if (line.getTotalPrice() != null) return line.getTotalPrice().setScale(2, RoundingMode.HALF_UP);
        return nvl(line.getGrossPrice()).multiply(BigDecimal.valueOf(Math.max(0, line.getQty()))).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal lineVat(FolioPdfRequest.ServiceLine line) {
        if (line == null) return BigDecimal.ZERO;
        if (line.getTaxAmount() != null) return line.getTaxAmount().setScale(2, RoundingMode.HALF_UP);
        return lineGross(line).subtract(lineNet(line)).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal lineDiscountGross(FolioPdfRequest.ServiceLine line) {
        if (line == null) return BigDecimal.ZERO;
        BigDecimal undiscountedGross = nvl(line.getGrossPrice()).multiply(BigDecimal.valueOf(Math.max(0, line.getQty()))).setScale(2, RoundingMode.HALF_UP);
        BigDecimal actualGross = lineGross(line);
        BigDecimal diff = undiscountedGross.subtract(actualGross);
        return diff.compareTo(BigDecimal.ZERO) > 0 ? diff : BigDecimal.ZERO;
    }

    private static boolean showInlineVatBreakdown(FolioPdfRequest request, State state) {
        FolioLayoutConfig.VatBreakdownTableConfig cfg = state.requestLayout == null ? null : state.requestLayout.getVatBreakdownTable();
        boolean visible = cfg == null || cfg.isVisible();
        return visible && !vatRows(request.getServices()).isEmpty();
    }

    private static String inlineVatBreakdownValue(FolioPdfRequest request, String locale) {
        List<VatRow> rows = vatRows(request.getServices());
        List<String> parts = new ArrayList<>();
        for (VatRow row : rows) {
            parts.add(vatRate(row.bucket, locale) + ": " + vatMoney(row.vat));
        }
        return String.join("; ", parts);
    }

    private enum VatBucket { VAT_22, VAT_9_5, VAT_0, NO_VAT }
    private record VatRow(VatBucket bucket, BigDecimal net, BigDecimal vat) { }

    private static List<VatRow> vatRows(List<FolioPdfRequest.ServiceLine> lines) {
        Map<VatBucket, BigDecimal> net = new EnumMap<>(VatBucket.class);
        Map<VatBucket, BigDecimal> vat = new EnumMap<>(VatBucket.class);
        if (lines != null) {
            for (FolioPdfRequest.ServiceLine line : lines) {
                VatBucket bucket = vatBucket(line.getTaxPercent());
                net.put(bucket, net.getOrDefault(bucket, BigDecimal.ZERO).add(lineNet(line)));
                vat.put(bucket, vat.getOrDefault(bucket, BigDecimal.ZERO).add(lineVat(line)));
            }
        }
        List<VatRow> rows = new ArrayList<>();
        for (VatBucket bucket : List.of(VatBucket.VAT_22, VatBucket.VAT_9_5, VatBucket.VAT_0)) {
            BigDecimal n = net.getOrDefault(bucket, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            BigDecimal v = vat.getOrDefault(bucket, BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            if (n.compareTo(BigDecimal.ZERO) != 0 || v.compareTo(BigDecimal.ZERO) != 0) rows.add(new VatRow(bucket, n, v));
        }
        return rows;
    }

    private static VatBucket vatBucket(String raw) {
        String value = safe(raw).toUpperCase(Locale.ROOT);
        if (value.isBlank() || value.contains("NO VAT") || value.contains("BREZ DDV") || value.contains("NEOBDAV")) return VatBucket.NO_VAT;
        if (value.contains("22")) return VatBucket.VAT_22;
        if (value.contains("9.5") || value.contains("9,5")) return VatBucket.VAT_9_5;
        return VatBucket.VAT_0;
    }

    private static boolean allServicesExplicitlyNoVat(List<FolioPdfRequest.ServiceLine> lines) {
        if (lines == null || lines.isEmpty()) return false;
        for (FolioPdfRequest.ServiceLine line : lines) {
            if (line == null || !isExplicitNoVat(line.getTaxPercent())) return false;
        }
        return true;
    }

    private static boolean isExplicitNoVat(String raw) {
        String value = safe(raw).trim().toUpperCase(Locale.ROOT);
        return !value.isBlank()
                && (value.contains("NO VAT") || value.contains("BREZ DDV") || value.contains("NEOBDAV"));
    }

    private static String displayTax(String raw) {
        VatBucket bucket = vatBucket(raw);
        if (bucket == VatBucket.NO_VAT) return "";
        return switch (bucket) {
            case VAT_22 -> "22 %";
            case VAT_9_5 -> "9,5 %";
            case VAT_0 -> "0 %";
            case NO_VAT -> "";
        };
    }

    private static String vatRowLabel(VatBucket bucket, String locale) {
        return switch (bucket) {
            case VAT_22 -> "sl".equals(locale) ? "DDV 22%" : "VAT 22%";
            case VAT_9_5 -> "sl".equals(locale) ? "DDV 9,5%" : "VAT 9.5%";
            case VAT_0, NO_VAT -> "sl".equals(locale) ? "DDV 0%" : "VAT 0%";
        };
    }

    private static String vatRate(VatBucket bucket, String locale) {
        return switch (bucket) {
            case VAT_22 -> "22%";
            case VAT_9_5 -> "sl".equals(locale) ? "9,5%" : "9.5%";
            case VAT_0, NO_VAT -> "0%";
        };
    }

    private static String[] vatHeaders(String locale) {
        return "sl".equals(locale)
                ? new String[]{"Opis DDV", "Stopnja DDV", "Osnova DDV", "Vrednost DDV"}
                : new String[]{"VAT description", "VAT rate", "VAT basis", "VAT amount"};
    }

    private static String vatMoney(BigDecimal value) {
        return "EUR " + nvl(value).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String money(BigDecimal value, String locale) {
        String number = nvl(value).setScale(2, RoundingMode.HALF_UP).toPlainString();
        if ("sl".equals(locale) || "sr".equals(locale)) return number.replace('.', ',') + " €";
        return "EUR " + number;
    }

    private static BigDecimal nvl(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static String documentTitle(FolioPdfRequest request, String locale) {
        String label = safe(request.getFolioNumberLabel()).replace(":", "").trim();
        if (label.isBlank()) label = "en".equals(locale) ? "Invoice" : "Račun";
        return label.toUpperCase(Locale.ROOT);
    }

    private static String dateOnly(String raw) {
        LocalDate parsed = parseDate(raw);
        return parsed == null ? safe(raw) : parsed.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"));
    }

    private static String issueTimePlace(FolioPdfRequest request) {
        LocalDateTime parsed = parseDateTime(request.getFolioDate());
        String city = firstNonBlank(request.getIssueCity(), request.getCompanyCity());
        if (parsed == null) return city;
        String time = parsed.format(DateTimeFormatter.ofPattern("HH:mm"));
        return city.isBlank() ? time : time + ", " + city;
    }

    private static LocalDate parseDate(String raw) {
        String value = safe(raw);
        if (value.isBlank()) return null;
        try { return OffsetDateTime.parse(value).toLocalDate(); } catch (DateTimeParseException ignored) { }
        try { return ZonedDateTime.parse(value).toLocalDate(); } catch (DateTimeParseException ignored) { }
        try { return LocalDateTime.parse(value, DateTimeFormatter.ISO_LOCAL_DATE_TIME).toLocalDate(); } catch (DateTimeParseException ignored) { }
        try { return Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDate(); } catch (DateTimeParseException ignored) { }
        for (DateTimeFormatter formatter : List.of(
                DateTimeFormatter.ISO_LOCAL_DATE,
                DateTimeFormatter.ofPattern("dd.MM.yyyy"),
                DateTimeFormatter.ofPattern("dd-MM-yyyy"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
                DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")
        )) {
            try {
                if (formatter.toString().contains("HourOfDay")) return LocalDateTime.parse(value, formatter).toLocalDate();
                return LocalDate.parse(value, formatter);
            } catch (DateTimeParseException ignored) { }
        }
        return null;
    }

    private static LocalDateTime parseDateTime(String raw) {
        String value = safe(raw);
        if (value.isBlank()) return null;
        try { return OffsetDateTime.parse(value).toLocalDateTime(); } catch (DateTimeParseException ignored) { }
        try { return ZonedDateTime.parse(value).toLocalDateTime(); } catch (DateTimeParseException ignored) { }
        try { return LocalDateTime.parse(value, DateTimeFormatter.ISO_LOCAL_DATE_TIME); } catch (DateTimeParseException ignored) { }
        try { return Instant.parse(value).atZone(ZoneId.systemDefault()).toLocalDateTime(); } catch (DateTimeParseException ignored) { }
        for (DateTimeFormatter formatter : List.of(
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
                DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"),
                DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm")
        )) {
            try { return LocalDateTime.parse(value, formatter); } catch (DateTimeParseException ignored) { }
        }
        return null;
    }

    private static Fonts loadFonts(PDDocument document) throws IOException {
        try (
                var regularStream = ModernA4InvoicePdfRenderer.class.getResourceAsStream(FONT_REGULAR_CLASSPATH);
                var boldStream = ModernA4InvoicePdfRenderer.class.getResourceAsStream(FONT_BOLD_CLASSPATH)
        ) {
            if (regularStream == null || boldStream == null) throw new IOException("Missing invoice font resources");
            return new Fonts(
                    PDType0Font.load(document, regularStream, true),
                    PDType0Font.load(document, boldStream, true)
            );
        }
    }

    private byte[] createQrPng(String payload, int width, int height) throws IOException {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.MARGIN, 0);
            hints.put(EncodeHintType.CHARACTER_SET, "ISO-8859-2");
            hints.put(EncodeHintType.ERROR_CORRECTION, com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M);
            BitMatrix matrix = new MultiFormatWriter().encode(payload, BarcodeFormat.QR_CODE, width, height, hints);
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            for (int px = 0; px < width; px++) {
                for (int py = 0; py < height; py++) image.setRGB(px, py, matrix.get(px, py) ? Color.BLACK.getRGB() : Color.WHITE.getRGB());
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "PNG", out);
            return out.toByteArray();
        } catch (WriterException e) {
            throw new IOException("Unable to render QR", e);
        }
    }

    private static List<String> wrap(PDFont font, float size, float maxWidth, String raw) throws IOException {
        List<String> result = new ArrayList<>();
        String value = safe(raw);
        if (value.isBlank()) return result;
        String[] words = value.split("\\s+");
        StringBuilder line = new StringBuilder();
        for (String word : words) {
            String candidate = line.length() == 0 ? word : line + " " + word;
            if (textWidth(font, size, candidate) <= maxWidth || line.length() == 0) {
                line.setLength(0);
                line.append(candidate);
            } else {
                result.add(line.toString());
                line.setLength(0);
                line.append(word);
            }
        }
        if (line.length() > 0) result.add(line.toString());
        return result;
    }

    private static String fitText(PDFont font, float size, float width, String raw) throws IOException {
        String text = safe(raw);
        if (textWidth(font, size, text) <= width) return text;
        String ellipsis = "…";
        while (text.length() > 1 && textWidth(font, size, text + ellipsis) > width) text = text.substring(0, text.length() - 1);
        return text + ellipsis;
    }

    private static float fitFontSize(PDFont font, float preferredSize, float minimumSize, float width, String raw) throws IOException {
        String text = safe(raw);
        if (text.isBlank() || width <= 0f) return preferredSize;
        float size = preferredSize;
        while (size > minimumSize && textWidth(font, size, text) > width) {
            size = Math.max(minimumSize, size - 0.25f);
        }
        return size;
    }

    private static float textWidth(PDFont font, float size, String text) throws IOException {
        return font.getStringWidth(safe(text)) / 1000f * size;
    }

    private static Color tint(Color base, float whiteRatio) {
        float ratio = Math.max(0f, Math.min(1f, whiteRatio));
        int r = Math.round(base.getRed() * (1f - ratio) + 255f * ratio);
        int g = Math.round(base.getGreen() * (1f - ratio) + 255f * ratio);
        int b = Math.round(base.getBlue() * (1f - ratio) + 255f * ratio);
        return new Color(r, g, b);
    }

    private static String joinPostalCity(String postal, String city) {
        String p = safe(postal);
        String c = safe(city);
        if (p.isBlank()) return c;
        if (c.isBlank()) return p;
        return p + " " + c;
    }

    private static String firstNonBlank(String first, String second) {
        String a = safe(first);
        return a.isBlank() ? safe(second) : a;
    }

    private static String safe(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        StringBuilder clean = new StringBuilder(trimmed.length());
        for (int i = 0; i < trimmed.length(); i++) {
            char ch = trimmed.charAt(i);
            if (ch == '\r') continue;
            if (ch == '\n' || ch == '\t' || !Character.isISOControl(ch)) clean.append(ch);
        }
        return clean.toString();
    }

    private void drawCompanyClassic(State state, FolioPdfRequest request, FolioLayoutConfig layout, byte[] logoBytes, float x, float y, float width, float height) throws IOException {
        float pad = 10f;
        float leftW = width * 0.34f;
        float rightW = width * 0.34f;
        float centerX = x + leftW;
        float rightX = x + width - rightW;
        float baseline = y + 18f;
        state.text(state.fonts.bold, state.theme.base + 1.3f, x + pad, baseline, safe(request.getCompanyName()), TEXT);
        baseline += state.theme.line + 2f;
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, safe(request.getCompanyAddress()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, joinPostalCity(request.getCompanyPostalCode(), request.getCompanyCity()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, safe(request.getCompanyTaxId()), TEXT);
        if (!safe(request.getIban()).isBlank()) {
            baseline += state.theme.line;
            state.text(state.fonts.regular, state.theme.base, x + pad, baseline, ("sl".equals(state.locale) || "sr".equals(state.locale) ? "TRR: " : "IBAN: ") + safe(request.getIban()), TEXT);
        }
        drawCenteredLogo(state, layout, logoBytes, centerX, y + 12f, rightX - centerX, 58f);
        state.text(state.fonts.bold, state.theme.title + 1f, rightX + 6f, y + 24f, documentTitle(request, state.locale), state.theme.accent);
        state.textRight(state.fonts.bold, state.theme.title, x + width - pad, y + 24f, safe(request.getFolioNumber()), state.theme.accent);
        state.line(x, y + height - 3f, x + width, y + height - 3f, state.theme.accent, 0.9f);
    }

    private void drawCompanyCompact(State state, FolioPdfRequest request, FolioLayoutConfig layout, byte[] logoBytes, float x, float y, float width, float height) throws IOException {
        float pad = 10f;
        float leftW = width * 0.32f;
        float rightW = width * 0.32f;
        float centerX = x + leftW;
        float rightX = x + width - rightW;
        float baseline = y + 17f;
        state.text(state.fonts.bold, state.theme.base + 1.2f, x + pad, baseline, safe(request.getCompanyName()), TEXT);
        baseline += state.theme.line + 1f;
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, safe(request.getCompanyAddress()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, joinPostalCity(request.getCompanyPostalCode(), request.getCompanyCity()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, x + pad, baseline, safe(request.getCompanyTaxId()), TEXT);
        if (!safe(request.getIban()).isBlank()) {
            baseline += state.theme.line;
            state.text(state.fonts.regular, state.theme.base, x + pad, baseline, ("sl".equals(state.locale) || "sr".equals(state.locale) ? "TRR: " : "IBAN: ") + safe(request.getIban()), TEXT);
        }
        state.line(centerX, y + 8f, centerX, y + height - 10f, BORDER, 0.55f);
        state.line(rightX, y + 8f, rightX, y + height - 10f, BORDER, 0.55f);
        drawCenteredLogo(state, layout, logoBytes, centerX, y + 12f, rightX - centerX, 58f);
        state.textCentered(state.fonts.bold, state.theme.title + 0.6f, rightX, rightW, y + 20f, documentTitle(request, state.locale), state.theme.accent);
        state.textCentered(state.fonts.bold, state.theme.title + 2f, rightX, rightW, y + 48f, safe(request.getFolioNumber()), TEXT);
    }

    private void drawCenteredLogo(State state, FolioLayoutConfig layout, byte[] logoBytes, float x, float y, float width, float maxHeight) throws IOException {
        if (layout.getLogo() == null || !layout.getLogo().isVisible() || logoBytes == null || logoBytes.length == 0) return;
        try {
            PDImageXObject image = PDImageXObject.createFromByteArray(state.document, logoBytes, "a4-logo");
            float logoW = Math.min(135f, width - 24f);
            float logoH = Math.min(maxHeight, 48f);
            state.drawImage(image, x + (width - logoW) / 2f, y, logoW, logoH);
        } catch (IOException ignored) {
            // Company data and document details remain usable without the logo.
        }
    }

    private void drawDocumentClassic(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        drawDocumentRows(state, request, x, y, width, height, true);
    }

    private void drawDocumentCompact(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        drawDocumentRows(state, request, x, y, width, height, false);
    }

    private void drawDocumentRows(State state, FolioPdfRequest request, float x, float y, float width, float height, boolean cardStyle) throws IOException {
        float pad = state.theme.pad;
        float rowH = (height - 2 * pad) / 4f;
        String[][] rows = new String[][] {
                {issuedLabel(state.locale), dateOnly(request.getFolioDate())},
                {issuePlaceLabel(state.locale), issueTimePlace(request)},
                {serviceDateLabel(state.locale), dateOnly(request.getDateOfService())},
                {dueDateLabel(state.locale), dateOnly(request.getDueDate())}
        };
        for (int i = 0; i < rows.length; i++) {
            float rowTop = y + pad + i * rowH;
            float baseline = rowTop + (rowH + state.theme.base) / 2f;
            state.text(state.fonts.regular, state.theme.base, x + pad, baseline, rows[i][0], cardStyle ? MUTED : TEXT);
            Color valueColor = i == 3 && cardStyle ? state.theme.accent : TEXT;
            state.textRight(state.fonts.bold, state.theme.base, x + width - pad, baseline, fitText(state.fonts.bold, state.theme.base, width * 0.48f, rows[i][1]), valueColor);
            if (i < rows.length - 1) state.line(x + pad, rowTop + rowH, x + width - pad, rowTop + rowH, BORDER, 0.45f);
        }
    }

    private void drawCompanyMinimal(State state, FolioPdfRequest request, FolioLayoutConfig layout, byte[] logoBytes, float x, float y, float width, float height) throws IOException {
        float leftX = x + 2f;
        float baseline = y + 10f + state.theme.base + 2f;
        state.text(state.fonts.bold, state.theme.base + 1.4f, leftX, baseline, safe(request.getCompanyName()), TEXT);
        baseline += state.theme.line + 2f;
        state.text(state.fonts.regular, state.theme.base, leftX, baseline, safe(request.getCompanyAddress()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, leftX, baseline, joinPostalCity(request.getCompanyPostalCode(), request.getCompanyCity()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, leftX, baseline, safe(request.getCompanyTaxId()), TEXT);
        if (!safe(request.getIban()).isBlank()) {
            baseline += state.theme.line;
            state.text(state.fonts.regular, state.theme.base, leftX, baseline, ("sl".equals(state.locale) || "sr".equals(state.locale) ? "TRR: " : "IBAN: ") + safe(request.getIban()), TEXT);
        }
        if (layout.getLogo() != null && layout.getLogo().isVisible() && logoBytes != null && logoBytes.length > 0) {
            try {
                PDImageXObject image = PDImageXObject.createFromByteArray(state.document, logoBytes, "a4-logo");
                float logoW = Math.min(140f, width * 0.30f);
                float logoH = 48f;
                float logoX = x + (width - logoW) / 2f;
                float logoY = y + 8f;
                state.drawImage(image, logoX, logoY, logoW, logoH);
            } catch (IOException ignored) {
                // Keep company text even if the logo cannot be rendered.
            }
        }
    }

    private void drawDocumentMinimal(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        float titleY = y + 8f + state.theme.title;
        state.text(state.fonts.bold, state.theme.title + 0.5f, x + pad, titleY, documentTitle(request, state.locale), state.theme.accent);
        state.textRight(state.fonts.bold, state.theme.title - 0.2f, x + width - pad, titleY, safe(request.getFolioNumber()), TEXT);
        float rowY = titleY + 22f;
        String[][] rows = new String[][] {
                {issuedLabel(state.locale), dateOnly(request.getFolioDate())},
                {issuePlaceLabel(state.locale), issueTimePlace(request)},
                {serviceDateLabel(state.locale), dateOnly(request.getDateOfService())},
                {dueDateLabel(state.locale), dateOnly(request.getDueDate())}
        };
        for (String[] row : rows) {
            state.text(state.fonts.regular, state.theme.base, x + pad, rowY, row[0], MUTED);
            state.textRight(state.fonts.bold, state.theme.base, x + width - pad, rowY, fitText(state.fonts.bold, state.theme.base, width * 0.48f, row[1]), TEXT);
            rowY += state.theme.line + 5f;
        }
    }

    private static boolean isPresetTemplate(FolioLayoutConfig layout) {
        String template = safe(layout == null ? null : layout.getTemplateId()).toUpperCase(Locale.ROOT);
        return Set.of("MINIMAL", "CLASSIC", "COMPACT").contains(template);
    }

    private static boolean isMinimal(FolioLayoutConfig layout) {
        return "MINIMAL".equals(safe(layout.getTemplateId()).toUpperCase(Locale.ROOT));
    }

    private static String normalizeLocale(String locale) {
        String value = safe(locale).toLowerCase(Locale.ROOT);
        if (value.startsWith("sl")) return "sl";
        if (value.startsWith("sr")) return "sr";
        return "en";
    }

    private static String issuedLabel(String locale) { return "sl".equals(locale) ? "Izdano" : "sr".equals(locale) ? "Izdato" : "Issued"; }
    private static String issuePlaceLabel(String locale) { return "sl".equals(locale) ? "Ura in kraj izdaje" : "sr".equals(locale) ? "Vreme i mesto izdavanja" : "Issue time and place"; }
    private static String serviceDateLabel(String locale) { return "sl".equals(locale) ? "Datum opravljene storitve" : "sr".equals(locale) ? "Datum usluge" : "Service date"; }
    private static String dueDateLabel(String locale) { return "sl".equals(locale) ? "Rok plačila" : "sr".equals(locale) ? "Rok plaćanja" : "Due date"; }
    private static String recipientLabel(String locale) { return "sl".equals(locale) ? "Prejemnik" : "sr".equals(locale) ? "Primalac" : "Recipient"; }
    private static String advancesLabel(String locale) { return "sl".equals(locale) ? "Predplačila" : "sr".equals(locale) ? "Avansi" : "Advance payments"; }
    private static String advancesSingularLabel(String locale) { return "sl".equals(locale) ? "Predplačilo" : "sr".equals(locale) ? "Avans" : "Advance payment"; }
    private static String vatBreakdownLabel(String locale) { return "sl".equals(locale) ? "Razčlenitev DDV" : "sr".equals(locale) ? "Pregled PDV-a" : "VAT breakdown"; }
    private static String subtotalLabel(String locale) { return "sl".equals(locale) ? "Skupaj brez DDV" : "sr".equals(locale) ? "Ukupno bez PDV-a" : "Subtotal excl. VAT"; }
    private static String discountLabel(String locale) { return "en".equals(locale) ? "Discount" : "Popust"; }
    private static String totalLabel(String locale) { return "sl".equals(locale) ? "Skupaj" : "sr".equals(locale) ? "Ukupno" : "Total"; }
    private static String payableLabel(String locale) { return "sl".equals(locale) ? "Za plačilo" : "sr".equals(locale) ? "Za uplatu" : "Amount due"; }
    private static String referenceLabel(String locale) { return "sl".equals(locale) ? "Referenca" : "sr".equals(locale) ? "Referenca" : "Reference"; }
    private static String fiscalLabel(String locale) { return "sl".equals(locale) ? "Fiskalni podatki" : "sr".equals(locale) ? "Fiskalni podaci" : "Fiscal details"; }
    private static String issuedByLabel(String locale) { return "sl".equals(locale) ? "Izdal" : "sr".equals(locale) ? "Izdao" : "Issued by"; }
    private static String signatureLabel(String locale) { return "sl".equals(locale) ? "Podpis" : "sr".equals(locale) ? "Potpis" : "Signature"; }
    private static String itemsLabel(String locale) { return "sl".equals(locale) ? "Postavke" : "sr".equals(locale) ? "Stavke" : "Items"; }
    private static String descriptionLabel(String locale) { return "en".equals(locale) ? "Description" : "Opis"; }
    private static String quantityLabel(String locale) { return "sl".equals(locale) ? "Količina" : "sr".equals(locale) ? "Količina" : "Quantity"; }
    private static String priceExVatLabel(String locale) { return "sl".equals(locale) ? "Cena brez DDV" : "sr".equals(locale) ? "Cena bez PDV-a" : "Price excl. VAT"; }
    private static String amountExVatLabel(String locale) { return "sl".equals(locale) ? "Znesek brez DDV" : "sr".equals(locale) ? "Iznos bez PDV-a" : "Amount excl. VAT"; }
    private static String discountColumnLabel(String locale) { return "sl".equals(locale) ? "Popust" : "sr".equals(locale) ? "Popust" : "Discount"; }
    private static String grossTotalColumnLabel(String locale) { return "sl".equals(locale) ? "Skupaj z DDV" : "sr".equals(locale) ? "Ukupno sa PDV-om" : "Total incl. VAT"; }
    private static String scanPayLabel(String locale) { return "sl".equals(locale) ? "Skeniraj in plačaj" : "sr".equals(locale) ? "Skeniraj i plati" : "Scan and pay"; }


    private static final class GridRow {
        String left;
        String right;
        String full;

        static GridRow half(String section) {
            GridRow row = new GridRow();
            row.left = section;
            return row;
        }

        static GridRow full(String section) {
            GridRow row = new GridRow();
            row.full = section;
            return row;
        }
    }

    private record Fonts(PDFont regular, PDFont bold) { }

    private record Theme(
            String template,
            Color accent,
            float base,
            float small,
            float sectionTitle,
            float title,
            float line,
            float pad,
            float gap,
            boolean minimal
    ) {
        static Theme from(FolioLayoutConfig layout) {
            String template = safe(layout.getTemplateId()).toUpperCase(Locale.ROOT);
            if (!Set.of("COMPACT", "CLASSIC", "MINIMAL").contains(template)) template = "CLASSIC";
            Color accent;
            try { accent = Color.decode(safe(layout.getAccentColor())); } catch (Exception ignored) { accent = new Color(22, 119, 255); }
            String font = safe(layout.getFontSizePreset()).toUpperCase(Locale.ROOT);
            float base = switch (font) { case "COMPACT" -> 7.2f; case "LARGE" -> 9.2f; default -> 8.2f; };
            float pad = "COMPACT".equals(template) ? 7f : "MINIMAL".equals(template) ? 4f : 9f;
            float gap = "COMPACT".equals(template) ? 6f : "CLASSIC".equals(template) ? 10f : 9f;
            return new Theme(template, accent, base, Math.max(6f, base - 1.2f), Math.max(6.2f, base - 0.7f), base + 6.5f, base + 4f, pad, gap, "MINIMAL".equals(template));
        }
    }

    private static final class State {
        final PDDocument document;
        final Fonts fonts;
        final Theme theme;
        final String locale;
        final FolioPdfRequest request;
        final FolioLayoutConfig requestLayout;
        PDPageContentStream stream;
        float y;
        int pageNumber;

        State(PDDocument document, Fonts fonts, Theme theme, String locale, FolioPdfRequest request, FolioLayoutConfig requestLayout) {
            this.document = document;
            this.fonts = fonts;
            this.theme = theme;
            this.locale = locale;
            this.request = request;
            this.requestLayout = requestLayout;
        }

        void newPage(boolean continuation) throws IOException {
            if (stream != null) stream.close();
            document.addPage(new PDPage(PDRectangle.A4));
            stream = new PDPageContentStream(document, document.getPage(document.getNumberOfPages() - 1));
            pageNumber++;
            y = TOP;
            if ("COMPACT".equals(theme.template)) {
                rect(10f, 10f, PAGE_W - 20f, PAGE_H - 20f, tint(theme.accent, 0.72f), 0.45f);
            }
            if (continuation) {
                text(fonts.bold, theme.base, MARGIN_X, y + theme.base, safe(request.getCompanyName()), TEXT);
                textRight(fonts.bold, theme.base, PAGE_W - MARGIN_X, y + theme.base, documentTitle(request, locale) + " " + safe(request.getFolioNumber()), TEXT);
                y += 14f;
                line(MARGIN_X, y, PAGE_W - MARGIN_X, y, BORDER, 0.6f);
                y += 14f;
            }
        }

        void ensureSpace(float height) throws IOException {
            if (y + height > PAGE_H - BOTTOM) newPage(true);
        }

        void close() throws IOException {
            if (stream != null) stream.close();
        }

        void text(PDFont font, float size, float x, float baselineFromTop, String value, Color color) throws IOException {
            String safeValue = safe(value);
            if (safeValue.isBlank()) return;
            stream.setNonStrokingColor(color);
            stream.beginText();
            stream.setFont(font, size);
            stream.newLineAtOffset(x, PAGE_H - baselineFromTop);
            stream.showText(safeValue);
            stream.endText();
        }

        void textRight(PDFont font, float size, float right, float baselineFromTop, String value, Color color) throws IOException {
            text(font, size, right - textWidth(font, size, value), baselineFromTop, value, color);
        }

        void textCentered(PDFont font, float size, float x, float width, float baselineFromTop, String value, Color color) throws IOException {
            text(font, size, x + (width - textWidth(font, size, value)) / 2f, baselineFromTop, value, color);
        }

        void line(float x1, float y1, float x2, float y2, Color color, float lineWidth) throws IOException {
            stream.setStrokingColor(color);
            stream.setLineWidth(lineWidth);
            stream.moveTo(x1, PAGE_H - y1);
            stream.lineTo(x2, PAGE_H - y2);
            stream.stroke();
        }

        void rect(float x, float y, float width, float height, Color color, float lineWidth) throws IOException {
            stream.setStrokingColor(color);
            stream.setLineWidth(lineWidth);
            stream.addRect(x, PAGE_H - y - height, width, height);
            stream.stroke();
        }

        void fillRect(float x, float y, float width, float height, Color color) throws IOException {
            stream.setNonStrokingColor(color);
            stream.addRect(x, PAGE_H - y - height, width, height);
            stream.fill();
        }

        void drawImage(PDImageXObject image, float x, float y, float width, float height) throws IOException {
            stream.drawImage(image, x, PAGE_H - y - height, width, height);
        }
    }
}
