package com.example.app.consumables;

import com.example.app.billing.TaxRate;
import com.example.app.consumables.ConsumableEnums.StockMovementSourceType;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionType;
import com.example.app.user.User;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ConsumableReportService {
    public enum ReportType {
        STOCK_VALUATION,
        CONSUMPTION,
        PURCHASES,
        INVENTORY,
        TRANSFERS
    }

    public record Filters(
            LocalDate from,
            LocalDate to,
            Long locationId,
            Long serviceTypeId,
            Long employeeId
    ) {}

    public record Column(String key, String label, String type) {}
    public record Option(Long id, String label) {}
    public record ReportResponse(
            ReportType type,
            List<Column> columns,
            List<Map<String, Object>> rows,
            Map<String, BigDecimal> totals,
            List<Option> serviceOptions,
            List<Option> employeeOptions
    ) {}

    private static final ZoneId ZONE = ZoneId.systemDefault();
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm", Locale.ROOT);
    private static final DateTimeFormatter FILE_DATE = DateTimeFormatter.BASIC_ISO_DATE;

    private final ConsumableLocationStockRepository stocks;
    private final ConsumableStockMovementRepository movements;
    private final SessionConsumableRepository sessionConsumables;
    private final ConsumablePurchaseOrderReceiptLineRepository receiptLines;
    private final ConsumableInventoryLineRepository inventoryLines;
    private final ConsumableStockTransferRepository transfers;

    public ConsumableReportService(
            ConsumableLocationStockRepository stocks,
            ConsumableStockMovementRepository movements,
            SessionConsumableRepository sessionConsumables,
            ConsumablePurchaseOrderReceiptLineRepository receiptLines,
            ConsumableInventoryLineRepository inventoryLines,
            ConsumableStockTransferRepository transfers
    ) {
        this.stocks = stocks;
        this.movements = movements;
        this.sessionConsumables = sessionConsumables;
        this.receiptLines = receiptLines;
        this.inventoryLines = inventoryLines;
        this.transfers = transfers;
    }

    @Transactional(readOnly = true)
    public ReportResponse build(User me, ReportType type, Filters filters) {
        if (me == null || me.getCompany() == null || me.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tenant is required.");
        }
        Long companyId = me.getCompany().getId();
        Filters safe = normalize(filters);
        return switch (type == null ? ReportType.STOCK_VALUATION : type) {
            case STOCK_VALUATION -> stockValuation(companyId, safe);
            case CONSUMPTION -> consumption(companyId, safe);
            case PURCHASES -> purchases(companyId, safe);
            case INVENTORY -> inventory(companyId, safe);
            case TRANSFERS -> transferReport(companyId, safe);
        };
    }

    public String fileBaseName(ReportResponse report) {
        String slug = switch (report.type()) {
            case STOCK_VALUATION -> "vrednost-zaloge";
            case CONSUMPTION -> "poraba";
            case PURCHASES -> "nabava";
            case INVENTORY -> "inventurne-razlike";
            case TRANSFERS -> "prenosi-zaloge";
        };
        return "porabni-material-" + slug + "-" + LocalDate.now(ZONE).format(FILE_DATE);
    }

    private ReportResponse stockValuation(Long companyId, Filters filters) {
        List<Column> columns = List.of(
                col("article", "Artikel", "TEXT"), col("category", "Kategorija", "TEXT"), col("location", "Poslovalnica", "TEXT"),
                col("quantity", "Zaloga", "NUMBER"), col("unit", "Enota", "TEXT"), col("minimum", "Minimum", "NUMBER"),
                col("unitCost", "Nabavna cena", "CURRENCY"), col("value", "Vrednost zaloge", "CURRENCY"), col("status", "Status", "TEXT")
        );
        List<Map<String, Object>> rows = new ArrayList<>();
        BigDecimal totalValue = BigDecimal.ZERO;
        for (ConsumableLocationStock stock : stocks.findAllForCompany(companyId)) {
            if (stock.getLocation() == null || (filters.locationId() != null && !Objects.equals(filters.locationId(), stock.getLocation().getId()))) continue;
            Consumable item = stock.getConsumable();
            BigDecimal quantity = nz(stock.getCurrentStock());
            BigDecimal unitCost = nz(stock.getCostPrice());
            BigDecimal value = money(quantity.multiply(unitCost));
            totalValue = totalValue.add(value);
            boolean low = item != null && item.isTrackStock() && quantity.compareTo(nz(stock.getMinimumStock())) < 0;
            rows.add(row(
                    "article", item == null ? "" : item.getName(),
                    "category", item == null || item.getCategory() == null ? "" : item.getCategory().getName(),
                    "location", stock.getLocation().getName(),
                    "quantity", quantity,
                    "unit", item == null ? "" : item.getUnit(),
                    "minimum", nz(stock.getMinimumStock()),
                    "unitCost", unitCost,
                    "value", value,
                    "status", low ? "Nizka zaloga" : "OK"
            ));
        }
        return report(ReportType.STOCK_VALUATION, columns, rows, totals("value", totalValue), List.of(), List.of());
    }

    private ReportResponse consumption(Long companyId, Filters filters) {
        List<Column> columns = List.of(
                col("date", "Datum", "TEXT"), col("article", "Artikel", "TEXT"), col("category", "Kategorija", "TEXT"),
                col("location", "Poslovalnica", "TEXT"), col("service", "Storitev", "TEXT"), col("employee", "Izvajalec", "TEXT"),
                col("quantity", "Porabljena količina", "NUMBER"), col("unit", "Enota", "TEXT"), col("unitCost", "Nabavna cena", "CURRENCY"),
                col("value", "Strošek", "CURRENCY"), col("movement", "Vrsta", "TEXT")
        );
        List<ConsumableStockMovement> candidates = movements.findAllForCompany(companyId, filters.locationId()).stream()
                .filter(m -> m.getSourceType() == StockMovementSourceType.SESSION)
                .filter(m -> m.getMovementType() == StockMovementType.SESSION_USAGE || m.getMovementType() == StockMovementType.RETURN)
                .filter(m -> inRange(m.getCreatedAt(), filters))
                .toList();
        Set<Long> sourceIds = candidates.stream().map(ConsumableStockMovement::getSourceId).filter(Objects::nonNull).collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, SessionConsumable> scById = sourceIds.isEmpty() ? Map.of() : sessionConsumables.findForReportByIds(companyId, sourceIds).stream()
                .collect(Collectors.toMap(SessionConsumable::getId, Function.identity(), (a, b) -> a));

        Map<Long, String> serviceLabels = new LinkedHashMap<>();
        Map<Long, String> employeeLabels = new LinkedHashMap<>();
        for (SessionConsumable sc : scById.values()) {
            SessionBooking booking = sc.getSessionBooking();
            SessionType type = sc.getServiceType() != null ? sc.getServiceType() : booking == null ? null : booking.getType();
            if (type != null && type.getId() != null) serviceLabels.put(type.getId(), type.getDescription() == null ? "Storitev #" + type.getId() : type.getDescription());
            User employee = booking == null ? null : booking.getConsultant();
            if (employee != null && employee.getId() != null) employeeLabels.put(employee.getId(), userName(employee));
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        BigDecimal totalQuantity = BigDecimal.ZERO;
        BigDecimal totalValue = BigDecimal.ZERO;
        for (ConsumableStockMovement movement : candidates) {
            SessionConsumable sc = movement.getSourceId() == null ? null : scById.get(movement.getSourceId());
            SessionBooking booking = sc == null ? null : sc.getSessionBooking();
            SessionType serviceType = sc != null && sc.getServiceType() != null ? sc.getServiceType() : booking == null ? null : booking.getType();
            User employee = booking == null ? null : booking.getConsultant();
            if (filters.serviceTypeId() != null && (serviceType == null || !Objects.equals(filters.serviceTypeId(), serviceType.getId()))) continue;
            if (filters.employeeId() != null && (employee == null || !Objects.equals(filters.employeeId(), employee.getId()))) continue;

            BigDecimal quantity = nz(movement.getQuantityDelta()).negate();
            BigDecimal unitCost = nz(movement.getUnitCostSnapshot());
            BigDecimal value = money(quantity.multiply(unitCost));
            totalQuantity = totalQuantity.add(quantity);
            totalValue = totalValue.add(value);
            Consumable item = movement.getConsumable();
            rows.add(row(
                    "date", dateTime(movement.getCreatedAt()),
                    "article", item == null ? "" : item.getName(),
                    "category", item == null || item.getCategory() == null ? "" : item.getCategory().getName(),
                    "location", movement.getLocation() == null ? "" : movement.getLocation().getName(),
                    "service", serviceType == null ? "" : serviceLabels.getOrDefault(serviceType.getId(), safe(serviceType.getDescription())),
                    "employee", employee == null ? "" : userName(employee),
                    "quantity", quantity,
                    "unit", item == null ? "" : item.getUnit(),
                    "unitCost", unitCost,
                    "value", value,
                    "movement", movement.getMovementType() == StockMovementType.RETURN ? "Vračilo" : "Poraba"
            ));
        }
        List<Option> services = serviceLabels.entrySet().stream().map(e -> new Option(e.getKey(), e.getValue())).sorted(Comparator.comparing(Option::label)).toList();
        List<Option> employees = employeeLabels.entrySet().stream().map(e -> new Option(e.getKey(), e.getValue())).sorted(Comparator.comparing(Option::label)).toList();
        return report(ReportType.CONSUMPTION, columns, rows, totals("quantity", totalQuantity, "value", totalValue), services, employees);
    }

    private ReportResponse purchases(Long companyId, Filters filters) {
        List<Column> columns = List.of(
                col("date", "Datum prejema", "TEXT"), col("orderNumber", "Naročilnica", "TEXT"), col("supplier", "Dobavitelj", "TEXT"),
                col("location", "Poslovalnica", "TEXT"), col("article", "Artikel", "TEXT"), col("quantity", "Količina", "NUMBER"),
                col("unit", "Enota", "TEXT"), col("unitPrice", "Cena/enoto", "CURRENCY"), col("vat", "DDV", "TEXT"),
                col("net", "Neto", "CURRENCY"), col("vatAmount", "DDV znesek", "CURRENCY"), col("gross", "Bruto", "CURRENCY")
        );
        List<Map<String, Object>> rows = new ArrayList<>();
        BigDecimal totalNet = BigDecimal.ZERO, totalVat = BigDecimal.ZERO, totalGross = BigDecimal.ZERO;
        for (ConsumablePurchaseOrderReceiptLine receiptLine : receiptLines.findAllForReport(companyId)) {
            ConsumablePurchaseOrderReceipt receipt = receiptLine.getReceipt();
            ConsumablePurchaseOrderLine line = receiptLine.getPurchaseOrderLine();
            ConsumablePurchaseOrder po = receipt == null ? null : receipt.getPurchaseOrder();
            if (receipt == null || line == null || po == null || !inRange(receipt.getReceivedAt(), filters)) continue;
            if (filters.locationId() != null && (po.getLocation() == null || !Objects.equals(filters.locationId(), po.getLocation().getId()))) continue;
            BigDecimal qty = nz(receiptLine.getQuantity());
            BigDecimal unitPrice = nz(line.getUnitPrice());
            BigDecimal net = money(qty.multiply(unitPrice));
            TaxRate rate = line.getVatRate() == null ? TaxRate.NO_VAT : line.getVatRate();
            BigDecimal vat = money(net.multiply(rate.multiplier));
            BigDecimal gross = money(net.add(vat));
            totalNet = totalNet.add(net); totalVat = totalVat.add(vat); totalGross = totalGross.add(gross);
            rows.add(row(
                    "date", dateTime(receipt.getReceivedAt()),
                    "orderNumber", po.getOrderNumber(),
                    "supplier", po.getSupplier() == null ? "" : po.getSupplier().getName(),
                    "location", po.getLocation() == null ? "" : po.getLocation().getName(),
                    "article", line.getItemNameSnapshot(),
                    "quantity", qty,
                    "unit", line.getUnitSnapshot(),
                    "unitPrice", unitPrice,
                    "vat", rate.label,
                    "net", net,
                    "vatAmount", vat,
                    "gross", gross
            ));
        }
        return report(ReportType.PURCHASES, columns, rows, totals("net", totalNet, "vat", totalVat, "gross", totalGross), List.of(), List.of());
    }

    private ReportResponse inventory(Long companyId, Filters filters) {
        List<Column> columns = List.of(
                col("date", "Zaključeno", "TEXT"), col("inventory", "Inventura", "TEXT"), col("location", "Poslovalnica", "TEXT"),
                col("article", "Artikel", "TEXT"), col("category", "Kategorija", "TEXT"), col("system", "Sistemska zaloga", "NUMBER"),
                col("counted", "Prešteta zaloga", "NUMBER"), col("difference", "Razlika", "NUMBER"), col("unit", "Enota", "TEXT"),
                col("unitCost", "Nabavna cena", "CURRENCY"), col("differenceValue", "Vrednost razlike", "CURRENCY"), col("completedBy", "Zaključil", "TEXT")
        );
        List<Map<String, Object>> rows = new ArrayList<>();
        BigDecimal totalDifference = BigDecimal.ZERO, totalValue = BigDecimal.ZERO;
        for (ConsumableInventoryLine line : inventoryLines.findCompletedForReport(companyId, ConsumableEnums.InventorySessionStatus.COMPLETED)) {
            ConsumableInventorySession session = line.getInventorySession();
            if (session == null || session.getCompletedAt() == null || !inRange(session.getCompletedAt(), filters)) continue;
            if (filters.locationId() != null && (session.getLocation() == null || !Objects.equals(filters.locationId(), session.getLocation().getId()))) continue;
            if (line.getCountedQuantity() == null) continue;
            BigDecimal diff = line.getCountedQuantity().subtract(nz(line.getSystemQuantity())).setScale(4, RoundingMode.HALF_UP);
            if (diff.compareTo(BigDecimal.ZERO) == 0) continue;
            BigDecimal value = money(diff.multiply(nz(line.getCostPriceSnapshot())));
            totalDifference = totalDifference.add(diff); totalValue = totalValue.add(value);
            rows.add(row(
                    "date", dateTime(session.getCompletedAt()),
                    "inventory", "#" + session.getId(),
                    "location", session.getLocation() == null ? "" : session.getLocation().getName(),
                    "article", line.getItemNameSnapshot(),
                    "category", safe(line.getCategoryNameSnapshot()),
                    "system", nz(line.getSystemQuantity()),
                    "counted", nz(line.getCountedQuantity()),
                    "difference", diff,
                    "unit", line.getUnitSnapshot(),
                    "unitCost", nz(line.getCostPriceSnapshot()),
                    "differenceValue", value,
                    "completedBy", userName(session.getCompletedBy())
            ));
        }
        return report(ReportType.INVENTORY, columns, rows, totals("difference", totalDifference, "value", totalValue), List.of(), List.of());
    }

    private ReportResponse transferReport(Long companyId, Filters filters) {
        List<Column> columns = List.of(
                col("date", "Datum", "TEXT"), col("article", "Artikel", "TEXT"), col("from", "Iz poslovalnice", "TEXT"),
                col("to", "V poslovalnico", "TEXT"), col("quantity", "Količina", "NUMBER"), col("unit", "Enota", "TEXT"),
                col("unitCost", "Nabavna cena", "CURRENCY"), col("value", "Vrednost", "CURRENCY"), col("user", "Uporabnik", "TEXT"), col("note", "Opomba", "TEXT")
        );
        List<Map<String, Object>> rows = new ArrayList<>();
        BigDecimal totalQuantity = BigDecimal.ZERO, totalValue = BigDecimal.ZERO;
        for (ConsumableStockTransfer transfer : transfers.findAllForCompany(companyId, filters.locationId())) {
            if (!inRange(transfer.getCreatedAt(), filters)) continue;
            BigDecimal quantity = nz(transfer.getQuantity());
            BigDecimal value = money(nz(transfer.getValueAmount()));
            totalQuantity = totalQuantity.add(quantity); totalValue = totalValue.add(value);
            rows.add(row(
                    "date", dateTime(transfer.getCreatedAt()),
                    "article", transfer.getItemNameSnapshot(),
                    "from", transfer.getFromLocation() == null ? "" : transfer.getFromLocation().getName(),
                    "to", transfer.getToLocation() == null ? "" : transfer.getToLocation().getName(),
                    "quantity", quantity,
                    "unit", transfer.getUnitSnapshot(),
                    "unitCost", nz(transfer.getUnitCostSnapshot()),
                    "value", value,
                    "user", userName(transfer.getCreatedBy()),
                    "note", safe(transfer.getNote())
            ));
        }
        return report(ReportType.TRANSFERS, columns, rows, totals("quantity", totalQuantity, "value", totalValue), List.of(), List.of());
    }

    public byte[] toCsv(ReportResponse report) {
        StringBuilder out = new StringBuilder("\uFEFF");
        appendCsvRow(out, report.columns().stream().map(Column::label).toList());
        for (Map<String, Object> row : report.rows()) {
            appendCsvRow(out, report.columns().stream().map(column -> formatForExport(row.get(column.key()), column.type())).toList());
        }
        if (!report.totals().isEmpty()) {
            out.append('\n');
            appendCsvRow(out, List.of("Skupaj"));
            report.totals().forEach((key, value) -> appendCsvRow(out, List.of(key, formatNumber(value))));
        }
        return out.toString().getBytes(StandardCharsets.UTF_8);
    }

    public byte[] toXlsx(ReportResponse report) {
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
                      <sheets><sheet name="Porabni material" sheetId="1" r:id="rId1"/></sheets>
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
            put(zip, "xl/worksheets/sheet1.xml", sheetXml(report));
            zip.finish();
            return out.toByteArray();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to generate consumables report Excel file.", ex);
        }
    }

    private String sheetXml(ReportResponse report) {
        StringBuilder xml = new StringBuilder(16_384);
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews><sheetData>");
        int rowIndex = 1;
        xml.append("<row r=\"1\">");
        for (int i = 0; i < report.columns().size(); i++) inlineCell(xml, cellRef(i, rowIndex), report.columns().get(i).label(), 1);
        xml.append("</row>");
        for (Map<String, Object> row : report.rows()) {
            rowIndex++;
            xml.append("<row r=\"").append(rowIndex).append("\">");
            for (int i = 0; i < report.columns().size(); i++) {
                Column column = report.columns().get(i);
                Object value = row.get(column.key());
                if (value instanceof Number number) numberCell(xml, cellRef(i, rowIndex), number.toString(), "CURRENCY".equals(column.type()) ? 2 : 0);
                else inlineCell(xml, cellRef(i, rowIndex), value == null ? "" : String.valueOf(value), 0);
            }
            xml.append("</row>");
        }
        if (!report.totals().isEmpty()) {
            rowIndex += 2;
            xml.append("<row r=\"").append(rowIndex).append("\">");
            inlineCell(xml, "A" + rowIndex, "Skupaj", 1);
            int col = 1;
            for (Map.Entry<String, BigDecimal> entry : report.totals().entrySet()) {
                inlineCell(xml, cellRef(col++, rowIndex), entry.getKey() + ": " + formatNumber(entry.getValue()), 1);
            }
            xml.append("</row>");
        }
        xml.append("</sheetData><autoFilter ref=\"A1:").append(columnName(Math.max(0, report.columns().size() - 1))).append(Math.max(1, report.rows().size() + 1)).append("\"/></worksheet>");
        return xml.toString();
    }

    private static String stylesXml() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
                  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
                  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
                  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
                  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
                </styleSheet>
                """;
    }

    private static void inlineCell(StringBuilder xml, String ref, String value, int style) {
        xml.append("<c r=\"").append(ref).append("\" t=\"inlineStr\" s=\"").append(style).append("\"><is><t xml:space=\"preserve\">").append(xml(value)).append("</t></is></c>");
    }

    private static void numberCell(StringBuilder xml, String ref, String value, int style) {
        xml.append("<c r=\"").append(ref).append("\" s=\"").append(style).append("\"><v>").append(xml(value)).append("</v></c>");
    }

    private static String cellRef(int zeroBasedColumn, int row) { return columnName(zeroBasedColumn) + row; }
    private static String columnName(int index) {
        StringBuilder out = new StringBuilder();
        int value = index + 1;
        while (value > 0) { int rem = (value - 1) % 26; out.insert(0, (char) ('A' + rem)); value = (value - 1) / 26; }
        return out.toString();
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static void appendCsvRow(StringBuilder out, List<String> values) {
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) out.append(';');
            String value = values.get(i) == null ? "" : values.get(i);
            out.append('"').append(value.replace("\"", "\"\"")).append('"');
        }
        out.append('\n');
    }

    private static String formatForExport(Object value, String type) {
        if (value == null) return "";
        if (value instanceof Number number) return formatNumber(new BigDecimal(number.toString()));
        return String.valueOf(value);
    }

    private static String formatNumber(BigDecimal value) {
        return value == null ? "" : value.stripTrailingZeros().toPlainString().replace('.', ',');
    }

    private static String xml(String value) {
        if (value == null) return "";
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;");
    }

    private static Filters normalize(Filters filters) {
        if (filters == null) return new Filters(null, null, null, null, null);
        LocalDate from = filters.from();
        LocalDate to = filters.to();
        if (from != null && to != null && from.isAfter(to)) {
            LocalDate swap = from; from = to; to = swap;
        }
        return new Filters(from, to, filters.locationId(), filters.serviceTypeId(), filters.employeeId());
    }

    private static boolean inRange(Instant instant, Filters filters) {
        if (instant == null) return false;
        LocalDate date = instant.atZone(ZONE).toLocalDate();
        if (filters.from() != null && date.isBefore(filters.from())) return false;
        return filters.to() == null || !date.isAfter(filters.to());
    }

    private static Column col(String key, String label, String type) { return new Column(key, label, type); }
    private static ReportResponse report(ReportType type, List<Column> columns, List<Map<String, Object>> rows, Map<String, BigDecimal> totals, List<Option> services, List<Option> employees) {
        return new ReportResponse(type, columns, rows, totals, services, employees);
    }

    private static LinkedHashMap<String, Object> row(Object... values) {
        LinkedHashMap<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i + 1 < values.length; i += 2) row.put(String.valueOf(values[i]), values[i + 1]);
        return row;
    }

    private static LinkedHashMap<String, BigDecimal> totals(Object... values) {
        LinkedHashMap<String, BigDecimal> totals = new LinkedHashMap<>();
        for (int i = 0; i + 1 < values.length; i += 2) totals.put(String.valueOf(values[i]), money((BigDecimal) values[i + 1]));
        return totals;
    }

    private static BigDecimal nz(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    private static BigDecimal money(BigDecimal value) { return nz(value).setScale(4, RoundingMode.HALF_UP); }
    private static String safe(String value) { return value == null ? "" : value; }
    private static String dateTime(Instant instant) { return instant == null ? "" : DATE_TIME.format(instant.atZone(ZONE)); }
    private static String userName(User user) {
        if (user == null) return "";
        String name = (safe(user.getFirstName()) + " " + safe(user.getLastName())).trim();
        return name.isBlank() ? safe(user.getEmail()) : name;
    }
}
