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
            State state = new State(document, fonts, theme, selectedLocale, request);
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
        if (isMinimal(layout)) {
            return buildMinimalGrid(layout, request);
        }
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

    private List<GridRow> buildMinimalGrid(FolioLayoutConfig layout, FolioPdfRequest request) {
        List<GridRow> rows = new ArrayList<>();
        addMinimalFull(rows, layout, request, "company");
        addMinimalPair(rows, layout, request, "recipient", "document");
        addMinimalFull(rows, layout, request, "items");
        addMinimalPair(rows, layout, request, isRenderable("taxClauses", request, layout) ? "taxClauses" : null, isRenderable("totals", request, layout) ? "totals" : null);
        addMinimalPair(rows, layout, request, isRenderable("fiscal", request, layout) ? "fiscal" : null, isRenderable("reference", request, layout) ? "reference" : null);
        addMinimalPair(rows, layout, request, isRenderable("issuedBy", request, layout) ? "issuedBy" : null, isRenderable("signature", request, layout) ? "signature" : null);
        return rows;
    }

    private void addMinimalFull(List<GridRow> rows, FolioLayoutConfig layout, FolioPdfRequest request, String section) {
        if (isRenderable(section, request, layout)) rows.add(GridRow.full(section));
    }

    private void addMinimalPair(List<GridRow> rows, FolioLayoutConfig layout, FolioPdfRequest request, String left, String right) {
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
        drawSectionFrame(state, x, y, width, height, "totals".equals(section));
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
            return;
        }
        float pad = state.theme.pad;
        float contentX = x + pad;
        float contentY = y + pad;
        if (layout.getLogo() != null && layout.getLogo().isVisible() && logoBytes != null && logoBytes.length > 0) {
            try {
                PDImageXObject image = PDImageXObject.createFromByteArray(state.document, logoBytes, "a4-logo");
                float logoW = Math.min(58f, width * 0.28f);
                float logoH = 36f;
                state.drawImage(image, contentX, contentY, logoW, logoH);
                contentX += logoW + 9f;
            } catch (IOException ignored) {
                // A broken logo must never prevent invoice generation.
            }
        }
        float baseline = contentY + state.theme.base;
        state.text(state.fonts.bold, state.theme.base + 0.5f, contentX, baseline, safe(request.getCompanyName()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, contentX, baseline, safe(request.getCompanyAddress()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, contentX, baseline, joinPostalCity(request.getCompanyPostalCode(), request.getCompanyCity()), TEXT);
        baseline += state.theme.line;
        state.text(state.fonts.regular, state.theme.base, contentX, baseline, safe(request.getCompanyTaxId()), TEXT);
        if (!safe(request.getIban()).isBlank()) {
            baseline += state.theme.line;
            state.text(state.fonts.regular, state.theme.base, contentX, baseline, ("sl".equals(state.locale) || "sr".equals(state.locale) ? "TRR: " : "IBAN: ") + safe(request.getIban()), TEXT);
        }
    }

    private void drawDocument(State state, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        if (state.theme.minimal) {
            drawDocumentMinimal(state, request, x, y, width, height);
            return;
        }
        float pad = state.theme.pad;
        float top = y + pad;
        String title = documentTitle(request, state.locale);
        state.text(state.fonts.bold, state.theme.title, x + pad, top + state.theme.title, title, state.theme.accent);
        state.textRight(state.fonts.bold, state.theme.base + 1.5f, x + width - pad, top + state.theme.base + 1f, safe(request.getFolioNumber()), TEXT);

        float metaTop = top + state.theme.title + 12f;
        float metaGap = 8f;
        float metaW = (width - 2 * pad - metaGap) / 2f;
        drawMeta(state, x + pad, metaTop, metaW, issuedLabel(state.locale), dateOnly(request.getFolioDate()));
        drawMeta(state, x + pad + metaW + metaGap, metaTop, metaW, issuePlaceLabel(state.locale), issueTimePlace(request));
        drawMeta(state, x + pad, metaTop + 26f, metaW, serviceDateLabel(state.locale), dateOnly(request.getDateOfService()));
        drawMeta(state, x + pad + metaW + metaGap, metaTop + 26f, metaW, dueDateLabel(state.locale), dateOnly(request.getDueDate()));
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
        BigDecimal payable = request.getToBePaidGross() == null ? total.subtract(nvl(request.getUsedAdvancePaymentsGross())).max(BigDecimal.ZERO) : request.getToBePaidGross().max(BigDecimal.ZERO);

        float baseline = y + pad + state.theme.base;
        drawTotalRow(state, x, width, pad, baseline, subtotalLabel(state.locale), money(net, state.locale), false);
        baseline += state.theme.line + 2f;
        if (discount.compareTo(BigDecimal.ZERO) != 0) {
            drawTotalRow(state, x, width, pad, baseline, discountLabel(state.locale), "-" + money(discount.abs(), state.locale), false);
            baseline += state.theme.line + 2f;
        }
        drawTotalRow(state, x, width, pad, baseline, totalLabel(state.locale), money(total, state.locale), true);
        baseline += state.theme.line + 8f;
        state.line(x + pad, baseline - state.theme.base - 4f, x + width - pad, baseline - state.theme.base - 4f, state.theme.accent, 0.7f);
        drawTotalRow(state, x, width, pad, baseline, payableLabel(state.locale), money(payable, state.locale), true);
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
            for (int i = 0; i < lines.size(); i++) {
                String line = state.theme.minimal ? lines.get(i) : (i == 0 ? "• " : "  ") + lines.get(i);
                state.text(state.fonts.regular, state.theme.base, x + pad, baseline, line, TEXT);
                baseline += state.theme.line;
            }
            baseline += 2f;
        }
    }

    private void drawReference(State state, FolioLayoutConfig layout, FolioPdfRequest request, float x, float y, float width, float height) throws IOException {
        float pad = state.theme.pad;
        float baseline = state.theme.minimal ? y + pad + state.theme.base : sectionTitle(state, referenceLabel(state.locale), x, y, width);
        String reference = referenceText(layout, request, state.locale);
        for (String line : wrap(state.fonts.regular, state.theme.base, width - 2 * pad, reference)) {
            state.text(state.fonts.regular, state.theme.base, x + pad, baseline, line, TEXT);
            baseline += state.theme.line;
        }
        if (state.theme.minimal && layout.getPaymentQr() != null && layout.getPaymentQr().isVisible() && !safe(request.getPaymentQrPayload()).isBlank()) {
            byte[] png = createQrPng(request.getPaymentQrPayload(), 180, 180);
            PDImageXObject qr = PDImageXObject.createFromByteArray(state.document, png, "upn-qr");
            float size = Math.min(64f, Math.max(48f, height - (baseline - y) - pad - 16f));
            float qrY = Math.min(y + height - pad - size - state.theme.small - 6f, baseline + 4f);
            state.drawImage(qr, x + pad, qrY, size, size);
            state.text(state.fonts.regular, state.theme.small, x + pad, qrY + size + state.theme.small + 2f, scanPayLabel(state.locale), MUTED);
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
        float baseline;
        float textWidth = width - 2 * pad;
        if (state.theme.minimal) {
            baseline = y + pad;
            if (!safe(request.getFiscalQr()).isBlank()) {
                byte[] png = createQrPng(request.getFiscalQr(), 160, 160);
                PDImageXObject qr = PDImageXObject.createFromByteArray(state.document, png, "fiscal-qr");
                float size = Math.min(62f, height * 0.54f);
                state.drawImage(qr, x + pad, baseline, size, size);
                baseline += size + 10f;
            } else {
                baseline += state.theme.base;
            }
        } else {
            baseline = sectionTitle(state, fiscalLabel(state.locale), x, y, width);
        }
        if (!safe(request.getFiscalZoi()).isBlank()) {
            for (String line : wrap(state.fonts.regular, state.theme.base, textWidth, "ZOI: " + safe(request.getFiscalZoi()))) {
                state.text(state.fonts.regular, state.theme.base, x + pad, baseline, line, TEXT);
                baseline += state.theme.line;
            }
        }
        if (!safe(request.getFiscalEor()).isBlank()) {
            for (String line : wrap(state.fonts.regular, state.theme.base, textWidth, "EOR: " + safe(request.getFiscalEor()))) {
                state.text(state.fonts.regular, state.theme.base, x + pad, baseline, line, TEXT);
                baseline += state.theme.line;
            }
        }
        if (!state.theme.minimal && !safe(request.getFiscalQr()).isBlank()) {
            byte[] png = createQrPng(request.getFiscalQr(), 160, 160);
            PDImageXObject qr = PDImageXObject.createFromByteArray(state.document, png, "fiscal-qr");
            float size = Math.min(58f, height - (baseline - y) - pad);
            if (size >= 35f) state.drawImage(qr, x + pad, baseline + 3f, size, size);
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
            float segmentY = state.y;
            float titleH = 20f;
            float headerH = 20f;
            float minimum = titleH + headerH + 24f + 2 * state.theme.pad;
            state.ensureSpace(minimum);
            segmentY = state.y;
            float cursor = segmentY + state.theme.pad;
            state.text(state.fonts.bold, state.theme.sectionTitle, MARGIN_X + state.theme.pad, cursor + state.theme.sectionTitle, itemsLabel(state.locale).toUpperCase(Locale.ROOT), state.theme.accent);
            cursor += titleH;
            drawItemsHeader(state, MARGIN_X + state.theme.pad, cursor, CONTENT_W - 2 * state.theme.pad, headerH, showQty);
            cursor += headerH;

            int segmentStartIndex = index;
            while (index < lines.size()) {
                FolioPdfRequest.ServiceLine line = lines.get(index);
                float rowH = itemRowHeight(state, line, showQty);
                if (cursor + rowH + state.theme.pad > PAGE_H - BOTTOM) break;
                drawItemRow(state, line, index + 1, MARGIN_X + state.theme.pad, cursor, CONTENT_W - 2 * state.theme.pad, rowH, showQty);
                cursor += rowH;
                index++;
            }
            if (segmentStartIndex == index && index < lines.size()) {
                // A single unusually long description must still make progress.
                FolioPdfRequest.ServiceLine line = lines.get(index);
                float forcedH = Math.max(24f, PAGE_H - BOTTOM - state.theme.pad - cursor);
                drawItemRow(state, line, index + 1, MARGIN_X + state.theme.pad, cursor, CONTENT_W - 2 * state.theme.pad, forcedH, showQty);
                cursor += forcedH;
                index++;
            }
            if (lines.isEmpty()) cursor += 20f;
            float segmentHeight = cursor - segmentY + state.theme.pad;
            drawItemsFrame(state, MARGIN_X, segmentY, CONTENT_W, segmentHeight);
            state.y = segmentY + segmentHeight + state.theme.gap;

            if (index < lines.size()) {
                state.newPage(true);
            }
        }
    }

    private void drawItemsHeader(State state, float x, float y, float width, float height, boolean showQty) throws IOException {
        state.fillRect(x, y, width, height, tint(state.theme.accent, 0.92f));
        float[] widths = itemColumnWidths(width, showQty);
        String[] headers = showQty
                ? new String[]{"#", descriptionLabel(state.locale), quantityLabel(state.locale), priceExVatLabel(state.locale), "DDV (%)", amountExVatLabel(state.locale)}
                : new String[]{"#", descriptionLabel(state.locale), priceExVatLabel(state.locale), "DDV (%)", amountExVatLabel(state.locale)};
        float currentX = x;
        float baseline = y + (height + state.theme.small) / 2f;
        for (int i = 0; i < headers.length; i++) {
            float cellW = widths[i];
            if (i >= 2) state.textRight(state.fonts.bold, state.theme.small, currentX + cellW - 3f, baseline, fitText(state.fonts.bold, state.theme.small, cellW - 6f, headers[i]), MUTED);
            else state.text(state.fonts.bold, state.theme.small, currentX + 3f, baseline, fitText(state.fonts.bold, state.theme.small, cellW - 6f, headers[i]), MUTED);
            currentX += cellW;
        }
        state.line(x, y + height, x + width, y + height, TABLE_BORDER, 0.5f);
    }

    private void drawItemRow(State state, FolioPdfRequest.ServiceLine line, int number, float x, float y, float width, float height, boolean showQty) throws IOException {
        float[] widths = itemColumnWidths(width, showQty);
        String[] values = showQty
                ? new String[]{String.valueOf(number), safe(line.getDescription()), String.valueOf(line.getQty()), money(line.getNettPrice(), state.locale), displayTax(line.getTaxPercent()), money(lineNet(line), state.locale)}
                : new String[]{String.valueOf(number), safe(line.getDescription()), money(line.getNettPrice(), state.locale), displayTax(line.getTaxPercent()), money(lineNet(line), state.locale)};
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
            return new float[]{22f, width * 0.34f, width * 0.09f, width * 0.18f, width * 0.13f, width - 22f - width * 0.34f - width * 0.09f - width * 0.18f - width * 0.13f};
        }
        return new float[]{22f, width * 0.48f, width * 0.19f, width * 0.13f, width - 22f - width * 0.48f - width * 0.19f - width * 0.13f};
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
                case "vat" -> 34f + Math.max(1, vatRows(request.getServices()).size()) * (state.theme.line + 2f) + 2 * p;
                case "totals" -> 88f + (nvl(request.getDiscountAmountGross()).compareTo(BigDecimal.ZERO) != 0 ? state.theme.line + 2f : 0f);
                case "taxClauses" -> Math.max(44f, estimateTaxClauses(state, layout, request, width));
                case "reference" -> 108f;
                case "paymentQr", "fiscal" -> 118f;
                case "issuedBy", "signature" -> 64f;
                case "footer" -> 0f;
                default -> 50f;
            };
        }
        return switch (section) {
            case "company", "document" -> 86f;
            case "recipient" -> 70f + (!safe(request.getRecipientVatId()).isBlank() ? state.theme.line : 0f);
            case "advancePayments" -> 34f + Math.max(1, advanceCount(request)) * (state.theme.line + 3f) + 2 * p;
            case "vat" -> 34f + Math.max(1, vatRows(request.getServices()).size()) * (state.theme.line + 2f) + 2 * p;
            case "totals" -> 84f + (nvl(request.getDiscountAmountGross()).compareTo(BigDecimal.ZERO) != 0 ? state.theme.line + 2f : 0f);
            case "taxClauses" -> estimateTaxClauses(state, layout, request, width);
            case "reference" -> 30f + wrap(state.fonts.regular, state.theme.base, width - 2 * p, referenceText(layout, request, state.locale)).size() * state.theme.line + 2 * p;
            case "paymentQr", "fiscal" -> 116f;
            case "issuedBy", "signature" -> 56f;
            case "footer" -> 34f;
            default -> 50f;
        };
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
        } else {
            // Draw the frame after table rows without a fill so the frame cannot cover text.
            state.rect(x, y, width, height, BORDER, 0.65f);
        }
    }

    private void drawSectionFrame(State state, float x, float y, float width, float height, boolean totals) throws IOException {
        if (state.theme.minimal) {
            return;
        }
        if (totals && "CLASSIC".equals(state.theme.template)) {
            state.fillRect(x, y, width, height, tint(state.theme.accent, 0.93f));
        } else if ("COMPACT".equals(state.theme.template)) {
            state.fillRect(x, y, width, height, new Color(251, 253, 255));
        }
        state.rect(x, y, width, height, BORDER, 0.65f);
    }

    private boolean isRenderable(String section, FolioPdfRequest request, FolioLayoutConfig layout) {
        if (layout.getHiddenSections() != null && layout.getHiddenSections().contains(section)) return false;
        boolean minimal = isMinimal(layout);
        return switch (section) {
            case "company", "document", "items", "totals" -> true;
            case "recipient" -> recipientVisible(layout) && !safe(request.getRecipientName()).isBlank();
            case "advancePayments" -> !minimal && (advanceCount(request) > 0 || nvl(request.getUsedAdvancePaymentsGross()).compareTo(BigDecimal.ZERO) > 0);
            case "vat" -> layout.getVatBreakdownTable() != null && layout.getVatBreakdownTable().isVisible() && !vatRows(request.getServices()).isEmpty();
            case "taxClauses" -> !effectiveTaxClauses(layout, request).isEmpty();
            case "reference" -> footerVisible(layout, "notes", true) && !safe(request.getNotes()).isBlank();
            case "paymentQr" -> !minimal && layout.getPaymentQr() != null && layout.getPaymentQr().isVisible() && !safe(request.getPaymentQrPayload()).isBlank();
            case "fiscal" -> fiscalVisible(layout) && (!safe(request.getFiscalQr()).isBlank() || !safe(request.getFiscalZoi()).isBlank() || !safe(request.getFiscalEor()).isBlank());
            case "issuedBy" -> footerVisible(layout, "issuedBy", true) && !safe(request.getIssuedBy()).isBlank();
            case "signature" -> layout.getSignature() != null && layout.getSignature().isVisible();
            case "footer" -> !minimal && !footerText(layout, normalizeLocale(request.getLocale())).isBlank();
            default -> false;
        };
    }

    private static boolean isFullWidth(String section, FolioLayoutConfig layout) {
        if (isMinimal(layout)) return "company".equals(section) || "items".equals(section) || "vat".equals(section) || "footer".equals(section);
        return "items".equals(section) || "taxClauses".equals(section) || "footer".equals(section);
    }

    private static List<String> effectiveSectionOrder(FolioLayoutConfig layout) {
        List<String> defaults = isMinimal(layout)
                ? List.of("company", "recipient", "document", "items", "vat", "taxClauses", "totals", "fiscal", "reference", "issuedBy", "signature", "footer")
                : List.of("company", "document", "recipient", "advancePayments", "items", "vat", "totals", "taxClauses", "reference", "paymentQr", "fiscal", "issuedBy", "signature", "footer");
        if (isMinimal(layout)) return new ArrayList<>(defaults);
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
            float gap = "COMPACT".equals(template) ? 7f : 9f;
            return new Theme(template, accent, base, Math.max(6f, base - 1.2f), Math.max(6.2f, base - 0.7f), base + 6.5f, base + 4f, pad, gap, "MINIMAL".equals(template));
        }
    }

    private static final class State {
        final PDDocument document;
        final Fonts fonts;
        final Theme theme;
        final String locale;
        final FolioPdfRequest request;
        PDPageContentStream stream;
        float y;
        int pageNumber;

        State(PDDocument document, Fonts fonts, Theme theme, String locale, FolioPdfRequest request) {
            this.document = document;
            this.fonts = fonts;
            this.theme = theme;
            this.locale = locale;
            this.request = request;
        }

        void newPage(boolean continuation) throws IOException {
            if (stream != null) stream.close();
            document.addPage(new PDPage(PDRectangle.A4));
            stream = new PDPageContentStream(document, document.getPage(document.getNumberOfPages() - 1));
            pageNumber++;
            y = TOP;
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
