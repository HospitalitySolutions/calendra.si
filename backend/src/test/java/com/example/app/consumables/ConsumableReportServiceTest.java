package com.example.app.consumables;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.Test;

class ConsumableReportServiceTest {

    private final ConsumableReportService service = new ConsumableReportService(null, null, null, null, null, null);

    @Test
    void csvExportUsesUtf8BomSemicolonDelimiterAndEscapesValues() {
        var report = sampleReport();

        byte[] bytes = service.toCsv(report);
        String csv = new String(bytes, StandardCharsets.UTF_8);

        assertTrue(csv.startsWith("\uFEFF\"Artikel\";\"Vrednost\""));
        assertTrue(csv.contains("\"Olje \"\"Premium\"\"\";\"12,5\""));
        assertTrue(csv.contains("\"Skupaj\""));
    }

    @Test
    void xlsxExportIsAValidZipWithWorkbookAndWorksheetParts() throws Exception {
        byte[] bytes = service.toXlsx(sampleReport());
        assertEquals((byte) 'P', bytes[0]);
        assertEquals((byte) 'K', bytes[1]);

        try (ZipInputStream zip = new ZipInputStream(new java.io.ByteArrayInputStream(bytes))) {
            java.util.Set<String> entries = new java.util.HashSet<>();
            for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) entries.add(entry.getName());
            assertTrue(entries.contains("xl/workbook.xml"));
            assertTrue(entries.contains("xl/worksheets/sheet1.xml"));
            assertTrue(entries.contains("xl/styles.xml"));
        }
    }

    private ConsumableReportService.ReportResponse sampleReport() {
        List<ConsumableReportService.Column> columns = List.of(
                new ConsumableReportService.Column("article", "Artikel", "TEXT"),
                new ConsumableReportService.Column("value", "Vrednost", "CURRENCY")
        );
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("article", "Olje \"Premium\"");
        row.put("value", new BigDecimal("12.5000"));
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        totals.put("value", new BigDecimal("12.5000"));
        return new ConsumableReportService.ReportResponse(
                ConsumableReportService.ReportType.STOCK_VALUATION,
                columns,
                List.of(row),
                totals,
                List.of(),
                List.of()
        );
    }
}
