package com.example.app.billing;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.LinkedHashMap;
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

/** Generates a flow-based, dynamically sized invoice PDF for 58 mm thermal printers. */
@Service
public class ReceiptPdfService {
    public static final float PAPER_WIDTH_PT = mmToPt(58f);
    public static final float SAFE_CONTENT_WIDTH_PT = mmToPt(48f);
    public static final float SIDE_MARGIN_PT = (PAPER_WIDTH_PT - SAFE_CONTENT_WIDTH_PT) / 2f;
    private static final float TOP_MARGIN_PT = mmToPt(4f);
    private static final float BOTTOM_MARGIN_PT = mmToPt(6f);
    private static final float MIN_PAGE_HEIGHT_PT = mmToPt(80f);
    private static final float MAX_PAGE_HEIGHT_PT = 14_000f;
    private static final float FISCAL_QR_SIZE_PT = mmToPt(25f);
    private static final float PAYMENT_QR_SIZE_PT = mmToPt(31f);
    private static final String FONT_REGULAR_CLASSPATH = "/fonts/NotoSans-Regular.ttf";
    private static final String FONT_BOLD_CLASSPATH = "/fonts/NotoSans-Bold.ttf";

    private enum Align { LEFT, CENTER, RIGHT }
    private enum VatBucket { VAT_22, VAT_9_5, VAT_0, NO_VAT }

    private record FontSet(PDFont regular, PDFont bold) {}
    private record Typography(float body, float small, float title, float total, float lineHeight, float smallLineHeight) {}
    private record Totals(BigDecimal net, BigDecimal gross) {}
    private record VatRow(VatBucket bucket, BigDecimal net, BigDecimal vat) {}

    private interface Block {
        float height();
        void draw(RenderContext context, float top) throws IOException;
    }

    private static final class RenderContext {
        private final PDDocument document;
        private final PDPageContentStream stream;
        private final FontSet fonts;
        private final float pageHeight;
        private final float left;
        private final float width;

        private RenderContext(PDDocument document, PDPageContentStream stream, FontSet fonts, float pageHeight) {
            this.document = document;
            this.stream = stream;
            this.fonts = fonts;
            this.pageHeight = pageHeight;
            this.left = SIDE_MARGIN_PT;
            this.width = SAFE_CONTENT_WIDTH_PT;
        }

        private float pdfY(float top, float fontSize) {
            return pageHeight - top - fontSize;
        }
    }

    private static final class GapBlock implements Block {
        private final float height;
        private GapBlock(float height) { this.height = Math.max(0, height); }
        @Override public float height() { return height; }
        @Override public void draw(RenderContext context, float top) { }
    }

    private static final class RuleBlock implements Block {
        private final float before;
        private final float after;
        private RuleBlock(float before, float after) { this.before = before; this.after = after; }
        @Override public float height() { return before + 1f + after; }
        @Override public void draw(RenderContext context, float top) throws IOException {
            float y = context.pageHeight - top - before;
            context.stream.setLineWidth(0.55f);
            context.stream.moveTo(context.left, y);
            context.stream.lineTo(context.left + context.width, y);
            context.stream.stroke();
        }
    }

    private static final class TextBlock implements Block {
        private final List<String> lines;
        private final float fontSize;
        private final float lineHeight;
        private final boolean bold;
        private final Align align;

        private TextBlock(List<String> lines, float fontSize, float lineHeight, boolean bold, Align align) {
            this.lines = lines == null ? List.of() : lines;
            this.fontSize = fontSize;
            this.lineHeight = lineHeight;
            this.bold = bold;
            this.align = align;
        }

        @Override public float height() { return lines.size() * lineHeight; }

        @Override public void draw(RenderContext context, float top) throws IOException {
            PDFont font = bold ? context.fonts.bold() : context.fonts.regular();
            for (int index = 0; index < lines.size(); index++) {
                String line = safe(lines.get(index));
                float textWidth = stringWidth(font, fontSize, line);
                float x = switch (align) {
                    case CENTER -> context.left + Math.max(0, (context.width - textWidth) / 2f);
                    case RIGHT -> context.left + Math.max(0, context.width - textWidth);
                    default -> context.left;
                };
                drawText(context.stream, font, fontSize, x, context.pdfY(top + index * lineHeight, fontSize), line);
            }
        }
    }

    private static final class PairBlock implements Block {
        private final List<String> leftLines;
        private final String right;
        private final float fontSize;
        private final float lineHeight;
        private final boolean bold;

        private PairBlock(List<String> leftLines, String right, float fontSize, float lineHeight, boolean bold) {
            this.leftLines = leftLines == null || leftLines.isEmpty() ? List.of("") : leftLines;
            this.right = safe(right);
            this.fontSize = fontSize;
            this.lineHeight = lineHeight;
            this.bold = bold;
        }

        @Override public float height() { return leftLines.size() * lineHeight; }

        @Override public void draw(RenderContext context, float top) throws IOException {
            PDFont font = bold ? context.fonts.bold() : context.fonts.regular();
            for (int index = 0; index < leftLines.size(); index++) {
                drawText(context.stream, font, fontSize, context.left,
                        context.pdfY(top + index * lineHeight, fontSize), safe(leftLines.get(index)));
            }
            float rightWidth = stringWidth(font, fontSize, right);
            drawText(context.stream, font, fontSize, context.left + context.width - rightWidth,
                    context.pdfY(top, fontSize), right);
        }
    }

    private static final class LogoBlock implements Block {
        private final byte[] imageBytes;
        private final float height;
        private LogoBlock(byte[] imageBytes, float height) { this.imageBytes = imageBytes; this.height = height; }
        @Override public float height() { return height; }
        @Override public void draw(RenderContext context, float top) throws IOException {
            if (imageBytes == null || imageBytes.length == 0) return;
            PDImageXObject image;
            try {
                image = PDImageXObject.createFromByteArray(context.document, imageBytes, "receipt-logo");
            } catch (IOException | RuntimeException ignored) {
                // Invalid or unsupported logo data must never prevent receipt generation.
                return;
            }
            float naturalRatio = image.getWidth() <= 0 || image.getHeight() <= 0 ? 2f : (float) image.getWidth() / image.getHeight();
            float drawHeight = Math.max(12f, height - 3f);
            float drawWidth = Math.min(context.width * 0.72f, drawHeight * naturalRatio);
            if (drawWidth <= 0) return;
            float x = context.left + (context.width - drawWidth) / 2f;
            float y = context.pageHeight - top - drawHeight;
            context.stream.drawImage(image, x, y, drawWidth, drawHeight);
        }
    }

    private final class QrBlock implements Block {
        private final String payload;
        private final float size;
        private final String caption;
        private final float captionFontSize;
        private final boolean upn;

        private QrBlock(String payload, float size, String caption, float captionFontSize, boolean upn) {
            this.payload = safe(payload).replace("\r", "");
            this.size = size;
            this.caption = safe(caption);
            this.captionFontSize = captionFontSize;
            this.upn = upn;
        }

        @Override public float height() { return size + (caption.isBlank() ? 0 : captionFontSize + 7f); }

        @Override public void draw(RenderContext context, float top) throws IOException {
            if (payload.isBlank()) return;
            byte[] png = createQrPng(payload, Math.max(180, Math.round(size * 3)), upn);
            PDImageXObject image = PDImageXObject.createFromByteArray(context.document, png, upn ? "payment-qr" : "fiscal-qr");
            float x = context.left + (context.width - size) / 2f;
            float y = context.pageHeight - top - size;
            context.stream.drawImage(image, x, y, size, size);
            if (!caption.isBlank()) {
                float textWidth = stringWidth(context.fonts.regular(), captionFontSize, caption);
                drawText(context.stream, context.fonts.regular(), captionFontSize,
                        context.left + (context.width - textWidth) / 2f,
                        context.pdfY(top + size + 3f, captionFontSize), caption);
            }
        }
    }

    public byte[] generate(FolioPdfRequest request, PosReceiptLayoutConfig rawLayout, byte[] logoBytes) {
        if (request == null) throw new IllegalArgumentException("FolioPdfRequest is required");
        PosReceiptLayoutConfig layout = PosReceiptLayoutConfig.normalize(rawLayout);
        String locale = normalizeLocale(request.getLocale());
        Typography typography = typography(layout.getFontSize());

        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            FontSet fonts = loadFonts(document);
            List<Block> blocks = buildBlocks(request, layout, logoBytes, fonts, typography, locale);
            float contentHeight = blocks.stream().map(Block::height).reduce(0f, Float::sum);
            float pageHeight = Math.max(MIN_PAGE_HEIGHT_PT, TOP_MARGIN_PT + contentHeight + BOTTOM_MARGIN_PT);
            if (pageHeight > MAX_PAGE_HEIGHT_PT) {
                throw new IllegalArgumentException("Receipt content is too long to fit on a single thermal-paper PDF page.");
            }

            PDPage page = new PDPage(new PDRectangle(PAPER_WIDTH_PT, pageHeight));
            document.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                RenderContext context = new RenderContext(document, stream, fonts, pageHeight);
                float cursor = TOP_MARGIN_PT;
                for (Block block : blocks) {
                    block.draw(context, cursor);
                    cursor += block.height();
                }
            }
            document.save(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new RuntimeException("Unable to generate 58 mm receipt PDF", exception);
        }
    }

    private List<Block> buildBlocks(
            FolioPdfRequest request,
            PosReceiptLayoutConfig layout,
            byte[] logoBytes,
            FontSet fonts,
            Typography typography,
            String locale
    ) {
        List<Block> result = new ArrayList<>();
        Map<String, List<Block>> sections = new LinkedHashMap<>();
        sections.put("company", companyBlocks(request, layout, logoBytes, fonts, typography));
        sections.put("document", documentBlocks(request, fonts, typography, locale));
        sections.put("recipient", recipientBlocks(request, layout, fonts, typography, locale));
        sections.put("items", itemBlocks(request, layout, fonts, typography, locale));
        sections.put("advancePayments", advancePaymentBlocks(request, fonts, typography, locale));
        sections.put("totals", totalBlocks(request, fonts, typography, locale));
        sections.put("vat", vatBlocks(request, layout, fonts, typography, locale));
        sections.put("payment", paymentBlocks(request, layout, fonts, typography, locale));
        sections.put("paymentQr", paymentQrBlocks(request, layout, typography, locale));
        sections.put("fiscal", fiscalBlocks(request, layout, fonts, typography, locale));
        sections.put("taxClauses", taxClauseBlocks(layout, fonts, typography, locale));
        sections.put("notes", notesBlocks(request, layout, fonts, typography, locale));
        sections.put("footer", footerBlocks(layout, fonts, typography));

        boolean hasContent = false;
        for (String section : layout.getSectionOrder()) {
            List<Block> sectionBlocks = sections.getOrDefault(section, List.of());
            if (sectionBlocks.isEmpty()) continue;
            if (hasContent) result.add(new GapBlock(typography.smallLineHeight() * 0.55f));
            result.addAll(sectionBlocks);
            hasContent = true;
        }
        return result;
    }

    private List<Block> companyBlocks(FolioPdfRequest request, PosReceiptLayoutConfig layout, byte[] logoBytes, FontSet fonts, Typography type) {
        List<Block> blocks = new ArrayList<>();
        if (layout.isShowLogo() && logoBytes != null && logoBytes.length > 0) {
            blocks.add(new LogoBlock(logoBytes, mmToPt(14f)));
            blocks.add(new GapBlock(2f));
        }
        addWrapped(blocks, request.getCompanyName(), fonts.bold(), type.title(), type.lineHeight() + 1f, true, Align.CENTER, SAFE_CONTENT_WIDTH_PT);
        addWrapped(blocks, request.getCompanyAddress(), fonts.regular(), type.small(), type.smallLineHeight(), false, Align.CENTER, SAFE_CONTENT_WIDTH_PT);
        addWrapped(blocks, joinPostalCity(request.getCompanyPostalCode(), request.getCompanyCity()), fonts.regular(), type.small(), type.smallLineHeight(), false, Align.CENTER, SAFE_CONTENT_WIDTH_PT);
        if (!blank(request.getCompanyTaxId())) {
            addWrapped(blocks, request.getCompanyTaxId(), fonts.regular(), type.small(), type.smallLineHeight(), false, Align.CENTER, SAFE_CONTENT_WIDTH_PT);
        }
        return blocks;
    }

    private List<Block> documentBlocks(FolioPdfRequest request, FontSet fonts, Typography type, String locale) {
        List<Block> blocks = new ArrayList<>();
        blocks.add(new RuleBlock(1f, 5f));
        String label = firstNonBlank(request.getFolioNumberLabel(), word(locale, "Račun", "Račun", "Invoice"));
        String number = safe(request.getFolioNumber());
        addWrapped(blocks, (label + " " + number).trim(), fonts.bold(), type.title(), type.lineHeight() + 1f, true, Align.CENTER, SAFE_CONTENT_WIDTH_PT);
        String[] issueParts = splitIssueDateAndTime(request.getFolioDate());
        addPair(blocks, word(locale, "Izdano", "Izdato", "Issued"), issueParts[0], fonts, type, false);
        addPair(blocks, word(locale, "Ura izdaje", "Vreme izdavanja", "Issue time"), issueParts[1], fonts, type, false);
        addPair(blocks, word(locale, "Datum opravljene storitve", "Datum izvršene usluge", "Service date"), request.getDateOfService(), fonts, type, false);
        addPair(blocks, word(locale, "Rok plačila", "Rok plaćanja", "Due date"), request.getDueDate(), fonts, type, false);
        blocks.add(new RuleBlock(4f, 1f));
        return blocks;
    }

    private List<Block> recipientBlocks(FolioPdfRequest request, PosReceiptLayoutConfig layout, FontSet fonts, Typography type, String locale) {
        if (!layout.isShowRecipient()) return List.of();
        String recipient = joinNonBlank(Arrays.asList(
                request.getRecipientName(),
                request.getRecipientAddress(),
                joinPostalCity(request.getRecipientPostalCode(), request.getRecipientCity()),
                request.getRecipientVatId()
        ), "\n");
        if (recipient.isBlank()) return List.of();
        List<Block> blocks = new ArrayList<>();
        blocks.add(textBlock(word(locale, "Prejemnik", "Primalac", "Recipient"), fonts.bold(), type.body(), type.lineHeight(), true, Align.LEFT, SAFE_CONTENT_WIDTH_PT));
        for (String line : recipient.split("\n")) {
            addWrapped(blocks, line, fonts.regular(), type.body(), type.lineHeight(), false, Align.LEFT, SAFE_CONTENT_WIDTH_PT);
        }
        return blocks;
    }

    private List<Block> itemBlocks(FolioPdfRequest request, PosReceiptLayoutConfig layout, FontSet fonts, Typography type, String locale) {
        List<FolioPdfRequest.ServiceLine> services = request.getServices() == null ? List.of() : request.getServices();
        if (services.isEmpty()) return List.of();
        List<Block> blocks = new ArrayList<>();
        blocks.add(textBlock(word(locale, "Postavke", "Stavke", "Items"), fonts.bold(), type.body(), type.lineHeight(), true, Align.LEFT, SAFE_CONTENT_WIDTH_PT));
        blocks.add(new RuleBlock(1f, 4f));
        for (int index = 0; index < services.size(); index++) {
            FolioPdfRequest.ServiceLine service = services.get(index);
            addWrapped(blocks, firstNonBlank(service.getDescription(), "—"), fonts.bold(), type.body(), type.lineHeight(), true, Align.LEFT, SAFE_CONTENT_WIDTH_PT);
            if (!blank(service.getDate())) {
                addWrapped(blocks, service.getDate(), fonts.regular(), type.small(), type.smallLineHeight(), false, Align.LEFT, SAFE_CONTENT_WIDTH_PT);
            }
            BigDecimal total = lineGross(service);
            if (layout.isShowUnitPriceAndQuantity()) {
                int qty = Math.max(1, service.getQty());
                BigDecimal unit = service.getGrossPrice() == null
                        ? total.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP)
                        : service.getGrossPrice();
                String left = qty + " × " + money(unit);
                String tax = displayTaxRate(service.getTaxPercent());
                if (!tax.isBlank()) left += "  " + tax;
                blocks.add(pairBlock(left, money(total), fonts.regular(), type.small(), type.smallLineHeight(), false));
            } else {
                blocks.add(pairBlock("", money(total), fonts.bold(), type.body(), type.lineHeight(), true));
            }
            if (index < services.size() - 1) blocks.add(new GapBlock(type.smallLineHeight() * 0.55f));
        }
        blocks.add(new RuleBlock(4f, 1f));
        return blocks;
    }

    private List<Block> advancePaymentBlocks(FolioPdfRequest request, FontSet fonts, Typography type, String locale) {
        List<FolioPdfRequest.AdvancePaymentLine> rows = request.getAdvancePayments() == null ? List.of() : request.getAdvancePayments();
        if (rows.isEmpty()) return List.of();
        List<Block> blocks = new ArrayList<>();
        blocks.add(textBlock(word(locale, "Porabljena predplačila", "Iskorišćene avansne uplate", "Used advances"), fonts.bold(), type.body(), type.lineHeight(), true, Align.LEFT, SAFE_CONTENT_WIDTH_PT));
        for (FolioPdfRequest.AdvancePaymentLine row : rows) {
            String left = joinNonBlank(Arrays.asList(row.getAdvanceNumber(), row.getDate()), " · ");
            blocks.add(pairBlock(left, "- " + money(abs(row.getUsedGross())), fonts.regular(), type.small(), type.smallLineHeight(), false));
        }
        return blocks;
    }

    private List<Block> totalBlocks(FolioPdfRequest request, FontSet fonts, Typography type, String locale) {
        Totals totals = totals(request.getServices());
        BigDecimal discount = positive(request.getDiscountAmountGross());
        BigDecimal subtotal = totals.gross().add(discount);
        List<Block> blocks = new ArrayList<>();
        if (discount.compareTo(BigDecimal.ZERO) > 0) {
            blocks.add(pairBlock(word(locale, "Vmesni seštevek", "Međuzbir", "Subtotal"), money(subtotal), fonts.regular(), type.body(), type.lineHeight(), false));
            blocks.add(pairBlock(word(locale, "Popust", "Popust", "Discount"), "- " + money(discount), fonts.regular(), type.body(), type.lineHeight(), false));
        }
        blocks.add(pairBlock(word(locale, "Skupaj", "Ukupno", "Total"), money(totals.gross()), fonts.bold(), type.total(), type.lineHeight() + 2f, true));
        BigDecimal usedAdvance = positive(request.getUsedAdvancePaymentsGross());
        if (usedAdvance.compareTo(BigDecimal.ZERO) > 0) {
            blocks.add(pairBlock(word(locale, "Porabljeno predplačilo", "Iskorišćen avans", "Advance used"), "- " + money(usedAdvance), fonts.regular(), type.body(), type.lineHeight(), false));
        }
        BigDecimal toBePaid = positive(request.getToBePaidGross());
        if (toBePaid.compareTo(BigDecimal.ZERO) > 0) {
            blocks.add(pairBlock(word(locale, "Za plačilo", "Za plaćanje", "Amount due"), money(toBePaid), fonts.bold(), type.total(), type.lineHeight() + 2f, true));
        }
        return blocks;
    }

    private List<Block> vatBlocks(FolioPdfRequest request, PosReceiptLayoutConfig layout, FontSet fonts, Typography type, String locale) {
        if (!layout.isShowVatBreakdown()) return List.of();
        List<VatRow> rows = vatRows(request.getServices());
        if (rows.isEmpty()) return List.of();
        List<Block> blocks = new ArrayList<>();
        blocks.add(textBlock(word(locale, "DDV", "PDV", "VAT"), fonts.bold(), type.body(), type.lineHeight(), true, Align.LEFT, SAFE_CONTENT_WIDTH_PT));
        for (VatRow row : rows) {
            String left = vatLabel(row.bucket(), locale) + " · " + word(locale, "osnova", "osnovica", "basis") + " " + money(row.net());
            blocks.add(pairBlock(left, money(row.vat()), fonts.regular(), type.small(), type.smallLineHeight(), false));
        }
        return blocks;
    }

    private List<Block> paymentBlocks(FolioPdfRequest request, PosReceiptLayoutConfig layout, FontSet fonts, Typography type, String locale) {
        if (!layout.isShowPaymentDetails()) return List.of();
        boolean hasPayment = (request.getPaymentMethods() != null && !request.getPaymentMethods().isEmpty())
                || !blank(request.getPaymentMethod()) || !blank(request.getIban()) || (layout.isShowIssuedBy() && !blank(request.getIssuedBy()));
        if (!hasPayment) return List.of();
        List<Block> blocks = new ArrayList<>();
        blocks.add(textBlock(word(locale, "Plačilo", "Plaćanje", "Payment"), fonts.bold(), type.body(), type.lineHeight(), true, Align.LEFT, SAFE_CONTENT_WIDTH_PT));
        if (request.getPaymentMethods() != null && !request.getPaymentMethods().isEmpty()) {
            for (FolioPdfRequest.PaymentLine line : request.getPaymentMethods()) {
                blocks.add(pairBlock(firstNonBlank(line.getName(), word(locale, "Način plačila", "Način plaćanja", "Payment method")), money(line.getAmountGross()), fonts.regular(), type.small(), type.smallLineHeight(), false));
            }
        } else if (!blank(request.getPaymentMethod())) {
            addWrapped(blocks, request.getPaymentMethod(), fonts.regular(), type.body(), type.lineHeight(), false, Align.LEFT, SAFE_CONTENT_WIDTH_PT);
        }
        if (!blank(request.getIban()) && positive(request.getToBePaidGross()).compareTo(BigDecimal.ZERO) > 0) {
            addPair(blocks, "IBAN", request.getIban(), fonts, type, false);
        }
        if (layout.isShowIssuedBy() && !blank(request.getIssuedBy())) {
            addPair(blocks, word(locale, "Izdal", "Izdao", "Issued by"), request.getIssuedBy(), fonts, type, false);
        }
        return blocks;
    }

    private List<Block> paymentQrBlocks(FolioPdfRequest request, PosReceiptLayoutConfig layout, Typography type, String locale) {
        if (!layout.isShowPaymentQr() || blank(request.getPaymentQrPayload())) return List.of();
        return List.of(new QrBlock(request.getPaymentQrPayload(), PAYMENT_QR_SIZE_PT,
                word(locale, "Skeniraj in plačaj", "Skeniraj i plati", "Scan and pay"), type.small(), true));
    }

    private List<Block> fiscalBlocks(FolioPdfRequest request, PosReceiptLayoutConfig layout, FontSet fonts, Typography type, String locale) {
        boolean hasFiscalText = !blank(request.getFiscalZoi()) || !blank(request.getFiscalEor());
        boolean hasFiscalQr = layout.isShowFiscalQr() && !blank(request.getFiscalQr());
        if (!hasFiscalText && !hasFiscalQr) return List.of();
        List<Block> blocks = new ArrayList<>();
        if (!blank(request.getFiscalZoi())) {
            addWrapped(blocks, "ZOI: " + request.getFiscalZoi(), fonts.regular(), type.small(), type.smallLineHeight(), false, Align.LEFT, SAFE_CONTENT_WIDTH_PT);
        }
        if (!blank(request.getFiscalEor())) {
            addWrapped(blocks, "EOR: " + request.getFiscalEor(), fonts.regular(), type.small(), type.smallLineHeight(), false, Align.LEFT, SAFE_CONTENT_WIDTH_PT);
        }
        if (hasFiscalQr) {
            blocks.add(new GapBlock(2f));
            blocks.add(new QrBlock(request.getFiscalQr(), FISCAL_QR_SIZE_PT,
                    word(locale, "Fiskalna koda", "Fiskalni kod", "Fiscal code"), type.small(), false));
        }
        return blocks;
    }

    private List<Block> taxClauseBlocks(PosReceiptLayoutConfig layout, FontSet fonts, Typography type, String locale) {
        List<String> clauses = normalizedTaxClauses(layout);
        if (clauses.isEmpty()) return List.of();
        List<Block> blocks = new ArrayList<>();
        blocks.add(textBlock(word(locale, "Davčne klavzule", "Poreske klauzule", "Tax clauses"), fonts.bold(), type.body(), type.lineHeight(), true, Align.LEFT, SAFE_CONTENT_WIDTH_PT));
        for (String clause : clauses) {
            addWrapped(blocks, "• " + clause, fonts.regular(), type.small(), type.smallLineHeight(), false, Align.LEFT, SAFE_CONTENT_WIDTH_PT);
        }
        return blocks;
    }

    private List<Block> notesBlocks(FolioPdfRequest request, PosReceiptLayoutConfig layout, FontSet fonts, Typography type, String locale) {
        if (!layout.isShowNotes() || blank(request.getNotes())) return List.of();
        List<Block> blocks = new ArrayList<>();
        blocks.add(textBlock(word(locale, "Referenca", "Referenca", "Reference"), fonts.bold(), type.body(), type.lineHeight(), true, Align.LEFT, SAFE_CONTENT_WIDTH_PT));
        addWrapped(blocks, request.getNotes(), fonts.regular(), type.small(), type.smallLineHeight(), false, Align.LEFT, SAFE_CONTENT_WIDTH_PT);
        return blocks;
    }

    private List<Block> footerBlocks(PosReceiptLayoutConfig layout, FontSet fonts, Typography type) {
        if (blank(layout.getFooterText())) return List.of();
        List<Block> blocks = new ArrayList<>();
        blocks.add(new RuleBlock(1f, 5f));
        addWrapped(blocks, layout.getFooterText(), fonts.regular(), type.small(), type.smallLineHeight(), false, Align.CENTER, SAFE_CONTENT_WIDTH_PT);
        return blocks;
    }

    private List<String> normalizedTaxClauses(PosReceiptLayoutConfig layout) {
        List<String> clauses = new ArrayList<>();
        if (layout == null || layout.getTaxClauses() == null) return clauses;
        for (String clause : layout.getTaxClauses()) {
            if (clause == null) continue;
            String trimmed = clause.trim();
            if (!trimmed.isBlank() && !clauses.contains(trimmed)) clauses.add(trimmed);
        }
        return clauses;
    }

    private String[] splitIssueDateAndTime(String value) {
        String raw = safe(value).trim();
        if (raw.isBlank()) return new String[] {"", ""};
        String normalized = raw.replace('T', ' ');
        int lastSpace = normalized.lastIndexOf(' ');
        if (lastSpace > 0 && lastSpace < normalized.length() - 1) {
            String timeCandidate = normalized.substring(lastSpace + 1).trim();
            if (timeCandidate.matches("\\d{1,2}:\\d{2}(:\\d{2})?")) {
                return new String[] { normalized.substring(0, lastSpace).trim(), timeCandidate };
            }
        }
        return new String[] { raw, "" };
    }

    private void addPair(List<Block> blocks, String label, String value, FontSet fonts, Typography type, boolean bold) {
        if (blank(value)) return;
        String left = safe(label);
        String right = safe(value);
        float rightWidth = stringWidth(bold ? fonts.bold() : fonts.regular(), type.small(), right);
        float leftWidth = Math.max(36f, SAFE_CONTENT_WIDTH_PT - rightWidth - 6f);
        List<String> wrapped = wrap(left, bold ? fonts.bold() : fonts.regular(), type.small(), leftWidth);
        blocks.add(new PairBlock(wrapped, right, type.small(), type.smallLineHeight(), bold));
    }

    private Block pairBlock(String left, String right, PDFont font, float fontSize, float lineHeight, boolean bold) {
        float rightWidth = stringWidth(font, fontSize, right);
        float leftWidth = Math.max(30f, SAFE_CONTENT_WIDTH_PT - rightWidth - 6f);
        return new PairBlock(wrap(left, font, fontSize, leftWidth), right, fontSize, lineHeight, bold);
    }

    private Block textBlock(String text, PDFont font, float fontSize, float lineHeight, boolean bold, Align align, float width) {
        return new TextBlock(wrap(text, font, fontSize, width), fontSize, lineHeight, bold, align);
    }

    private void addWrapped(List<Block> blocks, String text, PDFont font, float fontSize, float lineHeight, boolean bold, Align align, float width) {
        if (blank(text)) return;
        blocks.add(textBlock(text, font, fontSize, lineHeight, bold, align, width));
    }

    private FontSet loadFonts(PDDocument document) throws IOException {
        try (var regularStream = ReceiptPdfService.class.getResourceAsStream(FONT_REGULAR_CLASSPATH);
             var boldStream = ReceiptPdfService.class.getResourceAsStream(FONT_BOLD_CLASSPATH)) {
            if (regularStream == null || boldStream == null) throw new IOException("Receipt font resources are missing.");
            return new FontSet(PDType0Font.load(document, regularStream, true), PDType0Font.load(document, boldStream, true));
        }
    }

    private List<String> wrap(String raw, PDFont font, float fontSize, float maxWidth) {
        String text = safe(raw).replace("\r", "");
        if (text.isBlank()) return List.of("");
        List<String> lines = new ArrayList<>();
        for (String paragraph : text.split("\n", -1)) {
            if (paragraph.isBlank()) {
                lines.add("");
                continue;
            }
            StringBuilder current = new StringBuilder();
            for (String word : paragraph.trim().split("\\s+")) {
                String candidate = current.isEmpty() ? word : current + " " + word;
                if (stringWidth(font, fontSize, candidate) <= maxWidth) {
                    current.setLength(0);
                    current.append(candidate);
                    continue;
                }
                if (!current.isEmpty()) {
                    lines.add(current.toString());
                    current.setLength(0);
                }
                if (stringWidth(font, fontSize, word) <= maxWidth) {
                    current.append(word);
                } else {
                    StringBuilder fragment = new StringBuilder();
                    for (int offset = 0; offset < word.length();) {
                        int codePoint = word.codePointAt(offset);
                        String glyph = new String(Character.toChars(codePoint));
                        String fragmentCandidate = fragment + glyph;
                        if (!fragment.isEmpty() && stringWidth(font, fontSize, fragmentCandidate) > maxWidth) {
                            lines.add(fragment.toString());
                            fragment.setLength(0);
                        }
                        fragment.append(glyph);
                        offset += Character.charCount(codePoint);
                    }
                    current.append(fragment);
                }
            }
            if (!current.isEmpty()) lines.add(current.toString());
        }
        return lines.isEmpty() ? List.of("") : lines;
    }

    private byte[] createQrPng(String payload, int pixels, boolean upn) throws IOException {
        try {
            Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
            hints.put(EncodeHintType.MARGIN, 2);
            hints.put(EncodeHintType.CHARACTER_SET, "ISO-8859-2");
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
            if (upn) hints.put(EncodeHintType.QR_VERSION, 15);
            BitMatrix matrix = new MultiFormatWriter().encode(payload, BarcodeFormat.QR_CODE, pixels, pixels, hints);
            BufferedImage image = new BufferedImage(pixels, pixels, BufferedImage.TYPE_BYTE_BINARY);
            for (int x = 0; x < pixels; x++) {
                for (int y = 0; y < pixels; y++) {
                    image.setRGB(x, y, matrix.get(x, y) ? Color.BLACK.getRGB() : Color.WHITE.getRGB());
                }
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(image, "PNG", output);
            return output.toByteArray();
        } catch (WriterException exception) {
            throw new IOException("Unable to render receipt QR code", exception);
        }
    }

    private static Typography typography(String fontSize) {
        return switch (fontSize == null ? "STANDARD" : fontSize.toUpperCase(Locale.ROOT)) {
            case "COMPACT" -> new Typography(6.5f, 5.7f, 9.2f, 9.7f, 8.4f, 7.2f);
            case "LARGE" -> new Typography(8.4f, 7.1f, 11.7f, 12.5f, 10.8f, 9.1f);
            default -> new Typography(7.4f, 6.3f, 10.4f, 11.2f, 9.5f, 8.0f);
        };
    }

    private static Totals totals(List<FolioPdfRequest.ServiceLine> lines) {
        BigDecimal net = BigDecimal.ZERO;
        BigDecimal gross = BigDecimal.ZERO;
        if (lines != null) {
            for (FolioPdfRequest.ServiceLine line : lines) {
                net = net.add(lineNet(line));
                gross = gross.add(lineGross(line));
            }
        }
        return new Totals(scale(net), scale(gross));
    }

    private static List<VatRow> vatRows(List<FolioPdfRequest.ServiceLine> lines) {
        Map<VatBucket, BigDecimal> net = new EnumMap<>(VatBucket.class);
        Map<VatBucket, BigDecimal> vat = new EnumMap<>(VatBucket.class);
        if (lines != null) {
            for (FolioPdfRequest.ServiceLine line : lines) {
                VatBucket bucket = vatBucket(line == null ? null : line.getTaxPercent());
                BigDecimal lineNet = lineNet(line);
                BigDecimal lineVat = line == null || line.getTaxAmount() == null
                        ? lineGross(line).subtract(lineNet)
                        : line.getTaxAmount();
                net.merge(bucket, lineNet, BigDecimal::add);
                vat.merge(bucket, lineVat, BigDecimal::add);
            }
        }
        List<VatRow> rows = new ArrayList<>();
        for (VatBucket bucket : List.of(VatBucket.VAT_22, VatBucket.VAT_9_5, VatBucket.VAT_0, VatBucket.NO_VAT)) {
            BigDecimal basis = scale(net.getOrDefault(bucket, BigDecimal.ZERO));
            BigDecimal tax = scale(vat.getOrDefault(bucket, BigDecimal.ZERO));
            if (basis.compareTo(BigDecimal.ZERO) != 0 || tax.compareTo(BigDecimal.ZERO) != 0) {
                rows.add(new VatRow(bucket, basis, tax));
            }
        }
        return rows;
    }

    private static VatBucket vatBucket(String raw) {
        String value = safe(raw).toUpperCase(Locale.ROOT);
        if (value.contains("22")) return VatBucket.VAT_22;
        if (value.contains("9.5") || value.contains("9,5")) return VatBucket.VAT_9_5;
        if (value.isBlank() || value.contains("NO VAT") || value.contains("BREZ DDV") || value.contains("NEOBDAV")) return VatBucket.NO_VAT;
        return VatBucket.VAT_0;
    }

    private static String vatLabel(VatBucket bucket, String locale) {
        return switch (bucket) {
            case VAT_22 -> word(locale, "DDV 22%", "PDV 22%", "VAT 22%");
            case VAT_9_5 -> word(locale, "DDV 9,5%", "PDV 9,5%", "VAT 9.5%");
            case VAT_0 -> word(locale, "DDV 0%", "PDV 0%", "VAT 0%");
            case NO_VAT -> word(locale, "Brez DDV", "Bez PDV-a", "No VAT");
        };
    }

    private static BigDecimal lineNet(FolioPdfRequest.ServiceLine line) {
        if (line == null) return BigDecimal.ZERO;
        BigDecimal unit = line.getNettPrice() == null ? BigDecimal.ZERO : line.getNettPrice();
        return scale(unit.multiply(BigDecimal.valueOf(Math.max(1, line.getQty()))));
    }

    private static BigDecimal lineGross(FolioPdfRequest.ServiceLine line) {
        if (line == null) return BigDecimal.ZERO;
        if (line.getTotalPrice() != null) return scale(line.getTotalPrice());
        BigDecimal unit = line.getGrossPrice() == null ? BigDecimal.ZERO : line.getGrossPrice();
        return scale(unit.multiply(BigDecimal.valueOf(Math.max(1, line.getQty()))));
    }

    private static String displayTaxRate(String raw) {
        String value = safe(raw).trim();
        String upper = value.toUpperCase(Locale.ROOT);
        if (upper.isBlank() || upper.contains("NO VAT") || upper.contains("BREZ DDV") || upper.contains("NEOBDAV")) return "";
        return value;
    }

    private static void drawText(PDPageContentStream stream, PDFont font, float size, float x, float y, String text) throws IOException {
        stream.beginText();
        stream.setFont(font, size);
        stream.newLineAtOffset(x, y);
        stream.showText(safe(text));
        stream.endText();
    }

    private static float stringWidth(PDFont font, float size, String value) {
        try {
            return font.getStringWidth(safe(value)) / 1000f * size;
        } catch (IOException | IllegalArgumentException exception) {
            return safe(value).length() * size * 0.55f;
        }
    }

    private static String money(BigDecimal value) {
        return scale(value).toPlainString() + " EUR";
    }

    private static BigDecimal positive(BigDecimal value) {
        BigDecimal normalized = scale(value);
        return normalized.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO.setScale(2) : normalized;
    }

    private static BigDecimal abs(BigDecimal value) {
        return scale(value).abs();
    }

    private static BigDecimal scale(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static String joinPostalCity(String postalCode, String city) {
        return joinNonBlank(Arrays.asList(postalCode, city), " ");
    }

    private static String joinNonBlank(List<String> values, String separator) {
        return values.stream().filter(value -> !blank(value)).map(String::strip).reduce((a, b) -> a + separator + b).orElse("");
    }

    private static String firstNonBlank(String first, String fallback) {
        return blank(first) ? safe(fallback) : first.strip();
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String normalizeLocale(String raw) {
        String value = safe(raw).toLowerCase(Locale.ROOT);
        if (value.startsWith("sl")) return "sl";
        if (value.startsWith("sr")) return "sr";
        return "en";
    }

    private static String word(String locale, String sl, String sr, String en) {
        return switch (normalizeLocale(locale)) {
            case "sl" -> sl;
            case "sr" -> sr;
            default -> en;
        };
    }

    private static float mmToPt(float millimetres) {
        return millimetres * 72f / 25.4f;
    }
}
