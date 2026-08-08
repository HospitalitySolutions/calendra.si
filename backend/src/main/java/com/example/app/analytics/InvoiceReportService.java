package com.example.app.analytics;

import com.example.app.billing.Bill;
import com.example.app.billing.BillItem;
import com.example.app.billing.BillPayment;
import com.example.app.billing.BillRepository;
import com.example.app.billing.PaymentMethod;
import com.example.app.billing.TaxRate;
import com.example.app.location.LocationRepository;
import com.example.app.settings.BillingModuleAccessService;
import com.example.app.user.User;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.awt.Color;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class InvoiceReportService {
    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
    private static final DateTimeFormatter FILE_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private final BillRepository billRepository;
    private final BillingModuleAccessService billingAccess;
    private final LocationRepository locationRepository;
    private final ZoneId zone;

    public InvoiceReportService(
            BillRepository billRepository,
            BillingModuleAccessService billingAccess,
            LocationRepository locationRepository,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String timezoneId
    ) {
        this.billRepository = billRepository;
        this.billingAccess = billingAccess;
        this.locationRepository = locationRepository;
        this.zone = ZoneId.of(timezoneId == null || timezoneId.isBlank() ? "Europe/Ljubljana" : timezoneId);
    }

    public record Filters(
            LocalDate from,
            LocalDate to,
            Long paymentMethodId,
            String customer,
            String taxRate,
            String paymentStatus,
            String billType,
            String invoiceNumber,
            Long locationId
    ) {}

    public record Row(
            String invoiceNumber,
            LocalDateTime issuedAt,
            String paymentMethods,
            BigDecimal netBasis,
            BigDecimal vat95,
            BigDecimal vat22,
            BigDecimal total,
            String customer
    ) {}

    public record Totals(BigDecimal netBasis, BigDecimal vat95, BigDecimal vat22, BigDecimal total) {}

    public record Report(LocalDate from, LocalDate to, List<Row> rows, Totals totals, String issuerName, String issuerDetails, String selectedLocation) {}

    @Transactional(readOnly = true)
    public Report build(User me, Filters requested) {
        if (me == null || me.getCompany() == null || me.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing tenant context.");
        }
        billingAccess.assertBillingEnabled(me);
        LocalDate today = LocalDate.now(zone);
        LocalDate from = requested != null && requested.from() != null ? requested.from() : today.withDayOfMonth(1);
        LocalDate to = requested != null && requested.to() != null ? requested.to() : today;
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid report date range.");
        }

        Long paymentMethodId = requested == null ? null : requested.paymentMethodId();
        String customerNeedle = normalize(requested == null ? null : requested.customer());
        String invoiceNeedle = normalize(requested == null ? null : requested.invoiceNumber());
        TaxRate taxFilter = parseTaxRate(requested == null ? null : requested.taxRate());
        String paymentStatus = normalizeUpper(requested == null ? null : requested.paymentStatus());
        String billType = normalizeBillType(requested == null ? null : requested.billType());
        Long locationId = requested == null ? null : requested.locationId();
        String selectedLocation = locationId == null ? "" : locationRepository.findByIdAndCompanyId(locationId, me.getCompany().getId())
                .map(location -> safe(location.getName(), "#" + locationId))
                .orElse("#" + locationId);

        List<Bill> bills = billRepository.findAnalyticsByCompanyIdAndIssueDateRange(
                me.getCompany().getId(), from, to, null);

        List<Row> rows = new ArrayList<>();
        String issuerName = me.getCompany().getName();
        String issuerDetails = "";

        for (Bill bill : bills) {
            if (bill == null) continue;
            if (locationId != null && (bill.getLocation() == null || !locationId.equals(bill.getLocation().getId()))) continue;
            if (!matchesBillType(bill, billType)) continue;
            if (!matchesPaymentStatus(bill, paymentStatus)) continue;
            if (!invoiceNeedle.isBlank() && !normalize(bill.getBillNumber()).contains(invoiceNeedle)) continue;
            if (!customerNeedle.isBlank() && !customerSearchText(bill).contains(customerNeedle)) continue;

            BigDecimal paymentShare = paymentShare(bill, paymentMethodId);
            if (paymentMethodId != null && paymentShare.compareTo(BigDecimal.ZERO) <= 0) continue;

            Amounts amounts = invoiceAmounts(bill, taxFilter);
            if (taxFilter != null && amounts.total.compareTo(BigDecimal.ZERO) == 0) continue;
            if (paymentMethodId != null) amounts = amounts.multiply(paymentShare);

            rows.add(new Row(
                    safe(bill.getBillNumber(), "—"),
                    issuedAt(bill),
                    paymentMethodsLabel(bill),
                    money(amounts.netBasis),
                    money(amounts.vat95),
                    money(amounts.vat22),
                    money(amounts.total),
                    customerLabel(bill)
            ));

            if ((issuerDetails == null || issuerDetails.isBlank()) && bill.getIssuerNameSnapshot() != null) {
                issuerName = safe(bill.getIssuerNameSnapshot(), issuerName);
                issuerDetails = issuerDetails(bill);
            }
        }

        rows.sort(Comparator.comparing(Row::issuedAt).thenComparing(Row::invoiceNumber));
        Totals totals = new Totals(
                money(rows.stream().map(Row::netBasis).reduce(BigDecimal.ZERO, BigDecimal::add)),
                money(rows.stream().map(Row::vat95).reduce(BigDecimal.ZERO, BigDecimal::add)),
                money(rows.stream().map(Row::vat22).reduce(BigDecimal.ZERO, BigDecimal::add)),
                money(rows.stream().map(Row::total).reduce(BigDecimal.ZERO, BigDecimal::add))
        );
        return new Report(from, to, List.copyOf(rows), totals, safe(issuerName, "Calendra"), issuerDetails == null ? "" : issuerDetails, selectedLocation);
    }

    public String fileBaseName(Report report) {
        return "izpis-racunov-" + FILE_DATE.format(report.from()) + "-" + FILE_DATE.format(report.to());
    }

    public byte[] toPdf(Report report, Filters filters) {
        try (PDDocument document = new PDDocument()) {
            PDFont regular = loadFont(document, "/fonts/NotoSans-Regular.ttf");
            PDFont bold = loadFont(document, "/fonts/NotoSans-Bold.ttf");
            PDImageXObject logo = loadLogo(document);
            int rowsPerPage = 20;
            int pages = Math.max(1, (report.rows().size() + rowsPerPage - 1) / rowsPerPage);
            for (int pageIndex = 0; pageIndex < pages; pageIndex++) {
                PDPage page = new PDPage(PDRectangle.A4.rotate());
                document.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    float y = 555;
                    drawText(cs, bold, 19, 34, y, "Izpis računov");
                    if (logo != null) cs.drawImage(logo, 720, y - 7, 88, 26);
                    drawText(cs, bold, 10, 34, y - 20, report.issuerName());
                    if (!report.issuerDetails().isBlank()) drawText(cs, regular, 7.5f, 34, y - 34, report.issuerDetails());
                    drawTextRight(cs, regular, 8, 808, y, "Generirano: " + DATE_TIME.format(LocalDateTime.now(zone)));

                    float filterY = y - 62;
                    drawText(cs, bold, 8, 34, filterY, "Filtri:");
                    drawText(cs, regular, 8, 74, filterY, filtersLabel(report, filters));

                    float tableY = filterY - 28;
                    drawTableHeader(cs, bold, tableY);
                    float rowY = tableY - 18;
                    int from = pageIndex * rowsPerPage;
                    int to = Math.min(report.rows().size(), from + rowsPerPage);
                    for (int i = from; i < to; i++) {
                        drawRow(cs, regular, report.rows().get(i), rowY);
                        rowY -= 18;
                    }
                    if (pageIndex == pages - 1) {
                        drawTotals(cs, bold, report.totals(), rowY - 3);
                    }
                    drawText(cs, regular, 7, 34, 18, "Stran " + (pageIndex + 1) + " od " + pages);
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to generate invoice report PDF.", ex);
        }
    }

    public byte[] toXlsx(Report report, Filters filters) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream(); ZipOutputStream zip = new ZipOutputStream(out)) {
            put(zip, "[Content_Types].xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                      <Default Extension="xml" ContentType="application/xml"/>
                      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
                    </Types>
                    """);
            put(zip, "_rels/.rels", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                    </Relationships>
                    """);
            put(zip, "xl/workbook.xml", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                      <sheets><sheet name="Izpis računov" sheetId="1" r:id="rId1"/></sheets>
                    </workbook>
                    """);
            put(zip, "xl/_rels/workbook.xml.rels", """
                    <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
                    </Relationships>
                    """);
            put(zip, "xl/styles.xml", stylesXml());
            put(zip, "xl/worksheets/sheet1.xml", sheetXml(report, filters));
            zip.finish();
            return out.toByteArray();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to generate invoice report Excel file.", ex);
        }
    }

    private Amounts invoiceAmounts(Bill bill, TaxRate taxFilter) {
        BigDecimal net = BigDecimal.ZERO;
        BigDecimal vat95 = BigDecimal.ZERO;
        BigDecimal vat22 = BigDecimal.ZERO;
        BigDecimal gross = BigDecimal.ZERO;
        if (bill.getItems() != null && !bill.getItems().isEmpty()) {
            for (BillItem item : bill.getItems()) {
                if (item == null) continue;
                TaxRate rate = item.getTransactionService() == null || item.getTransactionService().getTaxRate() == null
                        ? TaxRate.NO_VAT : item.getTransactionService().getTaxRate();
                if (taxFilter != null && rate != taxFilter) continue;
                int qty = item.getQuantity() == null || item.getQuantity() <= 0 ? 1 : item.getQuantity();
                BigDecimal lineNet = item.getNetPrice() == null ? BigDecimal.ZERO : item.getNetPrice().multiply(BigDecimal.valueOf(qty));
                BigDecimal lineGross = item.getGrossPrice() == null ? BigDecimal.ZERO : item.getGrossPrice();
                BigDecimal vat = lineGross.subtract(lineNet);
                net = net.add(lineNet);
                gross = gross.add(lineGross);
                if (rate == TaxRate.VAT_9_5) vat95 = vat95.add(vat);
                if (rate == TaxRate.VAT_22) vat22 = vat22.add(vat);
            }
        } else if (taxFilter == null) {
            net = value(bill.getTotalNet());
            gross = value(bill.getTotalGross());
        }
        return new Amounts(net, vat95, vat22, gross);
    }

    /**
     * A payment-method filter may target only one part of a split-paid invoice. The invoice tax/basis values
     * are therefore allocated proportionally to that selected payment amount so report totals remain reconcilable.
     */
    private BigDecimal paymentShare(Bill bill, Long paymentMethodId) {
        if (paymentMethodId == null) return BigDecimal.ONE;
        BigDecimal total = value(bill.getTotalGross()).abs();
        if (total.compareTo(BigDecimal.ZERO) == 0) return BigDecimal.ZERO;
        BigDecimal matching = BigDecimal.ZERO;
        List<BillPayment> splits = bill.getPaymentSplits() == null ? List.of() : bill.getPaymentSplits();
        if (!splits.isEmpty()) {
            for (BillPayment split : splits) {
                if (split == null || split.getPaymentMethod() == null) continue;
                if (paymentMethodId.equals(split.getPaymentMethod().getId())) {
                    matching = matching.add(value(split.getAmountGross()).abs());
                }
            }
        } else if (bill.getPaymentMethod() != null && paymentMethodId.equals(bill.getPaymentMethod().getId())) {
            matching = total;
        }
        if (matching.compareTo(BigDecimal.ZERO) <= 0) return BigDecimal.ZERO;
        BigDecimal ratio = matching.divide(total, 10, RoundingMode.HALF_UP);
        return ratio.min(BigDecimal.ONE);
    }

    private LocalDateTime issuedAt(Bill bill) {
        LocalDate date = bill.getIssueDate() == null ? LocalDate.now(zone) : bill.getIssueDate();
        Instant created = bill.getCreatedAt();
        LocalTime time = created == null ? LocalTime.MIDNIGHT : created.atZone(zone).toLocalTime().withSecond(0).withNano(0);
        return LocalDateTime.of(date, time);
    }

    private String paymentMethodsLabel(Bill bill) {
        Set<String> names = new LinkedHashSet<>();
        if (bill.getPaymentSplits() != null) {
            bill.getPaymentSplits().stream()
                    .filter(split -> split != null && split.getPaymentMethod() != null)
                    .sorted(Comparator.comparing(BillPayment::getSortOrder, Comparator.nullsLast(Integer::compareTo)))
                    .map(BillPayment::getPaymentMethod)
                    .map(PaymentMethod::getName)
                    .filter(name -> name != null && !name.isBlank())
                    .forEach(names::add);
        }
        if (names.isEmpty() && bill.getPaymentMethod() != null && bill.getPaymentMethod().getName() != null) {
            names.add(bill.getPaymentMethod().getName());
        }
        return names.isEmpty() ? "—" : String.join(", ", names);
    }

    private String customerLabel(Bill bill) {
        String company = safe(bill.getRecipientCompanyNameSnapshot(), "").trim();
        if (!company.isBlank()) return company;
        String person = (safe(bill.getClientFirstNameSnapshot(), "") + " " + safe(bill.getClientLastNameSnapshot(), "")).trim();
        return person.isBlank() ? "—" : person;
    }

    private String customerSearchText(Bill bill) {
        return normalize(String.join(" ",
                safe(bill.getClientFirstNameSnapshot(), ""),
                safe(bill.getClientLastNameSnapshot(), ""),
                safe(bill.getRecipientCompanyNameSnapshot(), ""),
                safe(bill.getRecipientCompanyVatIdSnapshot(), ""),
                safe(bill.getRecipientCompanyEmailSnapshot(), "")
        ));
    }

    private String issuerDetails(Bill bill) {
        List<String> parts = new ArrayList<>();
        String address = String.join(" ", safe(bill.getIssuerAddressSnapshot(), ""), safe(bill.getIssuerPostalCodeSnapshot(), ""), safe(bill.getIssuerCitySnapshot(), "")).trim();
        if (!address.isBlank()) parts.add(address);
        if (bill.getIssuerTaxNumberSnapshot() != null && !bill.getIssuerTaxNumberSnapshot().isBlank()) parts.add("Davčna št.: " + bill.getIssuerTaxNumberSnapshot());
        return String.join(" · ", parts);
    }

    private String filtersLabel(Report report, Filters filters) {
        List<String> parts = new ArrayList<>();
        parts.add("Obdobje " + report.from().format(DateTimeFormatter.ofPattern("dd.MM.yyyy")) + "–" + report.to().format(DateTimeFormatter.ofPattern("dd.MM.yyyy")));
        if (filters != null && filters.paymentMethodId() != null) parts.add("izbran način plačila");
        if (filters != null && filters.customer() != null && !filters.customer().isBlank()) parts.add("kupec: " + filters.customer().trim());
        if (filters != null && filters.taxRate() != null && !filters.taxRate().isBlank() && !"ALL".equalsIgnoreCase(filters.taxRate())) parts.add("DDV: " + taxLabel(filters.taxRate()));
        if (filters != null && filters.billType() != null && !filters.billType().isBlank() && !"ALL".equalsIgnoreCase(filters.billType())) parts.add("vrsta: " + filters.billType());
        if (filters != null && filters.paymentStatus() != null && !filters.paymentStatus().isBlank() && !"ALL".equalsIgnoreCase(filters.paymentStatus())) parts.add("status: " + filters.paymentStatus());
        if (filters != null && filters.invoiceNumber() != null && !filters.invoiceNumber().isBlank()) parts.add("št.: " + filters.invoiceNumber().trim());
        if (filters != null && filters.locationId() != null) parts.add("poslovna enota: " + safe(report.selectedLocation(), "#" + filters.locationId()));
        return String.join(" · ", parts);
    }

    private static String taxLabel(String raw) {
        String value = normalizeUpper(raw);
        if ("VAT_22".equals(value)) return "22%";
        if ("VAT_9_5".equals(value)) return "9,5%";
        if ("VAT_0".equals(value)) return "0%";
        return raw;
    }


    private boolean matchesPaymentStatus(Bill bill, String requested) {
        if (requested == null || requested.isBlank() || "ALL".equals(requested)) return true;
        String actual = normalizeUpper(bill == null ? null : bill.getPaymentStatus());
        if ("OPEN".equals(requested)) return "OPEN".equals(actual) || "PAYMENT_PENDING".equals(actual);
        return requested.equals(actual);
    }
    private static TaxRate parseTaxRate(String raw) {
        String value = normalizeUpper(raw);
        if (value.isBlank() || "ALL".equals(value)) return null;
        try { return TaxRate.valueOf(value); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid tax rate filter."); }
    }

    private static String normalizeBillType(String raw) {
        String value = normalizeUpper(raw);
        if (value.isBlank()) return "ALL";
        return switch (value) {
            case "ALL", "INVOICE", "ADVANCE", "REFUND" -> value;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid bill type filter.");
        };
    }

    private boolean matchesBillType(Bill bill, String requested) {
        if (requested == null || requested.isBlank() || "ALL".equals(requested)) return true;
        boolean refund = bill != null && (bill.getRefundOfBillId() != null
                || (bill.getRefundReference() != null && !bill.getRefundReference().isBlank())
                || value(bill.getTotalGross()).signum() < 0);
        if ("REFUND".equals(requested)) return refund;
        if (refund) return false;
        String actual = bill == null || bill.getBillType() == null ? "INVOICE" : bill.getBillType().name();
        return requested.equals(actual);
    }

    private static BigDecimal value(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    private static BigDecimal money(BigDecimal value) { return value(value).setScale(2, RoundingMode.HALF_UP); }
    private static String safe(String value, String fallback) { return value == null || value.isBlank() ? fallback : value; }
    private static String normalize(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }
    private static String normalizeUpper(String value) { return value == null ? "" : value.trim().toUpperCase(Locale.ROOT); }

    private record Amounts(BigDecimal netBasis, BigDecimal vat95, BigDecimal vat22, BigDecimal total) {
        Amounts multiply(BigDecimal factor) {
            return new Amounts(netBasis.multiply(factor), vat95.multiply(factor), vat22.multiply(factor), total.multiply(factor));
        }
    }


    private PDImageXObject loadLogo(PDDocument document) throws IOException {
        try (InputStream in = InvoiceReportService.class.getResourceAsStream("/static/widget/calendra-transparent-logo.png")) {
            if (in == null) return null;
            return PDImageXObject.createFromByteArray(document, in.readAllBytes(), "calendra-logo");
        }
    }
    private PDFont loadFont(PDDocument document, String resource) throws IOException {
        try (InputStream in = InvoiceReportService.class.getResourceAsStream(resource)) {
            if (in == null) throw new IOException("Missing font resource " + resource);
            return PDType0Font.load(document, in, true);
        }
    }

    private void drawTableHeader(PDPageContentStream cs, PDFont bold, float y) throws IOException {
        String[] labels = {"Št. računa", "Datum / čas izdaje", "Način(i) plačila", "Osnova", "DDV 9,5%", "DDV 22%", "Skupaj", "Kupec"};
        float[] xs = {34, 122, 224, 334, 412, 478, 544, 622};
        for (int i = 0; i < labels.length; i++) drawText(cs, bold, 7.3f, xs[i], y, labels[i]);
        cs.moveTo(34, y - 5); cs.lineTo(808, y - 5); cs.stroke();
    }

    private void drawRow(PDPageContentStream cs, PDFont regular, Row row, float y) throws IOException {
        drawText(cs, regular, 7.2f, 34, y, fit(regular, 7.2f, row.invoiceNumber(), 82));
        drawText(cs, regular, 7.2f, 122, y, DATE_TIME.format(row.issuedAt()));
        drawText(cs, regular, 7.2f, 224, y, fit(regular, 7.2f, row.paymentMethods(), 104));
        drawMoneyRight(cs, regular, 7.2f, 402, y, row.netBasis());
        drawMoneyRight(cs, regular, 7.2f, 468, y, row.vat95());
        drawMoneyRight(cs, regular, 7.2f, 534, y, row.vat22());
        drawMoneyRight(cs, regular, 7.2f, 612, y, row.total());
        drawText(cs, regular, 7.2f, 622, y, fit(regular, 7.2f, row.customer(), 184));
        cs.setStrokingColor(new Color(220, 225, 232)); cs.moveTo(34, y - 5); cs.lineTo(808, y - 5); cs.stroke(); cs.setStrokingColor(Color.BLACK);
    }

    private void drawTotals(PDPageContentStream cs, PDFont bold, Totals totals, float y) throws IOException {
        cs.setStrokingColor(new Color(120, 130, 145)); cs.moveTo(34, y + 8); cs.lineTo(808, y + 8); cs.stroke(); cs.setStrokingColor(Color.BLACK);
        drawText(cs, bold, 8, 34, y, "SKUPAJ");
        drawMoneyRight(cs, bold, 8, 402, y, totals.netBasis());
        drawMoneyRight(cs, bold, 8, 468, y, totals.vat95());
        drawMoneyRight(cs, bold, 8, 534, y, totals.vat22());
        drawMoneyRight(cs, bold, 8, 612, y, totals.total());
    }

    private void drawMoneyRight(PDPageContentStream cs, PDFont font, float size, float right, float y, BigDecimal amount) throws IOException {
        String text = String.format(Locale.forLanguageTag("sl-SI"), "%,.2f €", money(amount));
        drawTextRight(cs, font, size, right, y, text);
    }

    private void drawText(PDPageContentStream cs, PDFont font, float size, float x, float y, String text) throws IOException {
        cs.beginText(); cs.setFont(font, size); cs.newLineAtOffset(x, y); cs.showText(text == null ? "" : text); cs.endText();
    }

    private void drawTextRight(PDPageContentStream cs, PDFont font, float size, float right, float y, String text) throws IOException {
        float width = font.getStringWidth(text == null ? "" : text) / 1000f * size;
        drawText(cs, font, size, right - width, y, text);
    }

    private String fit(PDFont font, float size, String raw, float maxWidth) throws IOException {
        String text = raw == null ? "" : raw;
        if (font.getStringWidth(text) / 1000f * size <= maxWidth) return text;
        String suffix = "…";
        while (!text.isEmpty() && font.getStringWidth(text + suffix) / 1000f * size > maxWidth) text = text.substring(0, text.length() - 1);
        return text + suffix;
    }

    private String stylesXml() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 [$€-sl-SI]"/></numFmts>
                  <fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
                  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill></fills>
                  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
                  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
                  <cellXfs count="4">
                    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
                    <xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFill="1" applyFont="1"/>
                    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
                    <xf numFmtId="164" fontId="1" fillId="1" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1"/>
                  </cellXfs>
                </styleSheet>
                """;
    }

    private String sheetXml(Report report, Filters filters) {
        StringBuilder xml = new StringBuilder();
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>")
                .append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">")
                .append("<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"5\" topLeftCell=\"A6\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>")
                .append("<cols><col min=\"1\" max=\"1\" width=\"18\" customWidth=\"1\"/><col min=\"2\" max=\"2\" width=\"21\" customWidth=\"1\"/><col min=\"3\" max=\"3\" width=\"24\" customWidth=\"1\"/><col min=\"4\" max=\"7\" width=\"15\" customWidth=\"1\"/><col min=\"8\" max=\"8\" width=\"34\" customWidth=\"1\"/></cols>")
                .append("<sheetData>");
        int row = 1;
        xml.append(rowXml(row++, List.of(textCell("A", "Izpis računov", 1))));
        xml.append(rowXml(row++, List.of(textCell("A", report.issuerName(), 1))));
        xml.append(rowXml(row++, List.of(textCell("A", filtersLabel(report, filters), 0))));
        row++;
        String[] headers = {"Št. računa", "Datum / čas izdaje", "Način(i) plačila", "Osnova (brez DDV)", "DDV 9,5%", "DDV 22%", "Skupaj", "Kupec"};
        List<String> headerCells = new ArrayList<>();
        for (int i = 0; i < headers.length; i++) headerCells.add(textCell(column(i + 1), headers[i], 1));
        xml.append(rowXml(row++, headerCells));
        for (Row item : report.rows()) {
            xml.append(rowXml(row++, List.of(
                    textCell("A", item.invoiceNumber(), 0), textCell("B", DATE_TIME.format(item.issuedAt()), 0), textCell("C", item.paymentMethods(), 0),
                    numberCell("D", item.netBasis(), 2), numberCell("E", item.vat95(), 2), numberCell("F", item.vat22(), 2), numberCell("G", item.total(), 2), textCell("H", item.customer(), 0)
            )));
        }
        xml.append(rowXml(row, List.of(textCell("A", "SKUPAJ", 1), numberCell("D", report.totals().netBasis(), 3), numberCell("E", report.totals().vat95(), 3), numberCell("F", report.totals().vat22(), 3), numberCell("G", report.totals().total(), 3))));
        xml.append("</sheetData><autoFilter ref=\"A5:H").append(Math.max(5, row - 1)).append("\"/></worksheet>");
        return xml.toString();
    }

    private String rowXml(int row, List<String> cells) {
        StringBuilder sb = new StringBuilder("<row r=\"").append(row).append("\">");
        for (String cell : cells) sb.append(cell.replace("{ROW}", String.valueOf(row)));
        return sb.append("</row>").toString();
    }

    private String textCell(String col, String value, int style) {
        return "<c r=\"" + col + "{ROW}\" t=\"inlineStr\" s=\"" + style + "\"><is><t>" + xml(value) + "</t></is></c>";
    }

    private String numberCell(String col, BigDecimal value, int style) {
        return "<c r=\"" + col + "{ROW}\" s=\"" + style + "\"><v>" + money(value).toPlainString() + "</v></c>";
    }

    private String column(int index) { return String.valueOf((char) ('A' + index - 1)); }

    private void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static String xml(String raw) {
        return (raw == null ? "" : raw).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
