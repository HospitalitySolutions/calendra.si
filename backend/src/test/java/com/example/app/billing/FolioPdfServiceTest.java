package com.example.app.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class FolioPdfServiceTest {

    @Test
    void generate_keepsSlovenianSpecialCharacters() throws Exception {
        FolioPdfService service = new FolioPdfService();
        FolioPdfRequest request = new FolioPdfRequest();
        request.setCompanyName("Čudež d.o.o.");
        request.setRecipientName("Špela Žagar");
        request.setNotes("Opomba čšž");
        request.setFolioNumber("RAC-1");
        request.setFolioDate("2026-05-08");
        request.setDateOfService("2026-05-08");
        request.setDueDate("2026-05-15");
        request.setLocale("sl");
        request.setServices(List.of(serviceLine("Masaža čšž", "61.00")));

        byte[] pdf = service.generate(request);

        assertThat(pdf).isNotEmpty();

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertThat(text).contains("Čudež d.o.o.");
            assertThat(text).contains("Špela Žagar");
            assertThat(text).contains("Masaža čšž");
            assertThat(text).contains("Opomba čšž");
        }
    }

    @Test
    void generate_stripsControlCharactersButKeepsUnicode() throws Exception {
        FolioPdfService service = new FolioPdfService();
        FolioPdfRequest request = new FolioPdfRequest();
        request.setCompanyName("Test\u0000 čšž");
        request.setRecipientName("A\u0007B");
        request.setFolioNumber("RAC-2");
        request.setFolioDate("2026-05-08");
        request.setDateOfService("2026-05-08");
        request.setDueDate("2026-05-15");
        request.setLocale("sl");
        request.setServices(List.of(serviceLine("Storitev č\u0001", "12.20")));

        byte[] pdf = service.generate(request);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertThat(text).contains("Test čšž");
            assertThat(text).doesNotContain("\u0000");
            assertThat(text).doesNotContain("\u0007");
            assertThat(text).doesNotContain("\u0001");
        }
    }

    @Test
    void generate_includesVatBreakdownTableByRate() throws Exception {
        FolioPdfService service = new FolioPdfService();
        FolioPdfRequest request = new FolioPdfRequest();
        request.setCompanyName("Test d.o.o.");
        request.setRecipientName("Prejemnik");
        request.setFolioNumber("RAC-3");
        request.setFolioDate("2026-05-08");
        request.setDateOfService("2026-05-08");
        request.setDueDate("2026-05-15");
        request.setLocale("sl");
        request.setServices(List.of(
                serviceLine("Storitev 22", "10.00", "12.20", "22%", "2.20"),
                serviceLine("Storitev 9,5", "10.00", "10.95", "9.5%", "0.95"),
                serviceLine("Storitev brez DDV", "8.00", "8.00", "NO VAT", "0.00")
        ));

        byte[] pdf = service.generate(request);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            assertThat(text).contains("Skupaj brez DDV 28,00 €");
            assertThat(text).contains("Razčlenitev DDV 22%: 2,20 €; 9,5%: 0,95 €");
            assertThat(text).contains("Skupaj 31,15 €");
            assertThat(text).contains("Za plačilo 31,15 €");
            assertThat(text).doesNotContain("Opis DDV");
            assertThat(text).doesNotContain("Stopnja DDV");
            assertThat(text).doesNotContain("Osnova DDV");
            assertThat(text).doesNotContain("Vrednost DDV");
            assertThat(text).doesNotContain("DDV 0%");
            assertThat(text).doesNotContain("NO VAT");
            assertThat(text).doesNotContain("DDV ni obračunan na podlagi točke prvega odstavka 94. člena ZDDV-1.");
        }
    }

    @Test
    void generate_hidesVatBreakdownWhenOnlyNoVatLines() throws Exception {
        FolioPdfService service = new FolioPdfService();
        FolioPdfRequest request = new FolioPdfRequest();
        request.setCompanyName("Test d.o.o.");
        request.setRecipientName("Prejemnik");
        request.setFolioNumber("RAC-4");
        request.setFolioDate("2026-05-08");
        request.setDateOfService("2026-05-08");
        request.setDueDate("2026-05-15");
        request.setLocale("sl");
        request.setServices(List.of(
                serviceLine("Pro Package - Monthly", "34.90", "34.90", "NO VAT", "0.00"),
                serviceLine("Additional user / month", "9.90", "29.70", "NO VAT", "0.00")
        ));

        byte[] pdf = service.generate(request);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document);
            String normalizedText = text.replaceAll("\\s+", " ").trim();
            assertThat(text).doesNotContain("Opis DDV");
            assertThat(text).doesNotContain("DDV 0%");
            assertThat(text).doesNotContain("NO VAT");
            assertThat(normalizedText)
                    .contains("DDV ni obračunan na podlagi točke prvega odstavka 94. člena ZDDV-1.")
                    .doesNotContain("Davčne klavzule");
        }
    }

    @Test
    void generate_ignoresManuallyConfiguredAutomaticNoVatClauseForVatLines() throws Exception {
        FolioPdfService service = new FolioPdfService();
        FolioPdfRequest request = new FolioPdfRequest();
        request.setCompanyName("Test d.o.o.");
        request.setRecipientName("Prejemnik");
        request.setFolioNumber("RAC-5");
        request.setFolioDate("2026-05-08");
        request.setDateOfService("2026-05-08");
        request.setDueDate("2026-05-15");
        request.setLocale("sl");
        request.setServices(List.of(serviceLine("Storitev", "12.20")));
        FolioLayoutConfig layout = FolioLayoutConfig.defaultLayout();
        layout.setTaxClauses(List.of("DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1."));

        byte[] pdf = service.generate(request, layout);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document).replaceAll("\s+", " ").trim();
            assertThat(text)
                    .doesNotContain("DDV ni obračunan na podlagi točke prvega odstavka 94. člena ZDDV-1.")
                    .doesNotContain("Davčne klavzule");
        }
    }

    @Test
    void generate_doesNotTreatMissingVatLevelAsExplicitNoVat() throws Exception {
        FolioPdfService service = new FolioPdfService();
        FolioPdfRequest request = new FolioPdfRequest();
        request.setCompanyName("Test d.o.o.");
        request.setRecipientName("Prejemnik");
        request.setFolioNumber("RAC-5B");
        request.setFolioDate("2026-05-08");
        request.setDateOfService("2026-05-08");
        request.setDueDate("2026-05-15");
        request.setLocale("sl");
        FolioPdfRequest.ServiceLine line = serviceLine("Storitev", "12.20");
        line.setTaxPercent(null);
        request.setServices(List.of(line));

        byte[] pdf = service.generate(request, FolioLayoutConfig.defaultLayout());

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document).replaceAll("\s+", " ").trim();
            assertThat(text).doesNotContain("DDV ni obračunan na podlagi točke prvega odstavka 94. člena ZDDV-1.");
        }
    }


    @Test
    void generate_minimalTemplateUsesConfiguredReferenceAndEuropeanDates() throws Exception {
        FolioPdfService service = new FolioPdfService();
        FolioPdfRequest request = new FolioPdfRequest();
        request.setCompanyName("Test d.o.o.");
        request.setCompanyCity("Ljubljana");
        request.setIssueCity("Maribor");
        request.setRecipientName("Prejemnik");
        request.setFolioNumber("44");
        request.setFolioDate("2026-08-02T23:08:00+02:00");
        request.setDateOfService("2026-08-02");
        request.setDueDate("2026-08-17");
        request.setNotes("REF-2026-001");
        request.setToBePaidGross(new BigDecimal("12.20"));
        request.setLocale("sl");
        request.setServices(List.of(serviceLine("Svetovanje", "12.20")));

        FolioLayoutConfig layout = FolioLayoutConfig.defaultLayout();
        layout.setTemplateId("MINIMAL");
        layout.setFontSizePreset("LARGE");
        layout.setReferenceText("Prosimo, da se pri plačilu sklicujete na št.: {reference-number}");

        byte[] pdf = service.generate(request, layout);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document).replaceAll("\\s+", " ").trim();
            assertThat(text)
                    .contains("02.08.2026")
                    .contains("17.08.2026")
                    .contains("23:08, Maribor")
                    .contains("Prosimo, da se pri plačilu sklicujete na št.: REF-2026-001")
                    .doesNotContain("2026-08-17");
        }
    }

    @Test
    void generate_usesUpdatedA4ItemColumnsCompanyDetailsAndDiscountedLineValues() throws Exception {
        FolioPdfService service = new FolioPdfService();
        FolioPdfRequest request = new FolioPdfRequest();
        request.setCompanyName("Test d.o.o.");
        request.setCompanyTaxId("SI12345678");
        request.setIban("SI455465454225424XX");
        request.setRecipientName("Prejemnik");
        request.setFolioNumber("RAC-6");
        request.setFolioDate("2026-08-05 13:51");
        request.setDateOfService("2026-08-05");
        request.setDueDate("2026-08-12");
        request.setIssuedBy("David Mirc");
        request.setLocale("sl");

        FolioPdfRequest.ServiceLine line = new FolioPdfRequest.ServiceLine(
                "Svetovanje",
                2,
                new BigDecimal("40.98"),
                new BigDecimal("50.00")
        );
        line.setTaxPercent("22%");
        line.setTotalNettPrice(new BigDecimal("73.77"));
        line.setTaxAmount(new BigDecimal("16.23"));
        line.setTotalPrice(new BigDecimal("90.00"));
        request.setServices(List.of(line));
        request.setSubtotalBeforeDiscountGross(new BigDecimal("100.00"));
        request.setDiscountAmountGross(new BigDecimal("10.00"));
        request.setToBePaidGross(new BigDecimal("90.00"));

        byte[] pdf = service.generate(request);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String text = new PDFTextStripper().getText(document).replaceAll("\\s+", " ").trim();
            assertThat(text)
                    .contains("Cena z DDV")
                    .contains("Skupaj")
                    .contains("50,00 €")
                    .contains("10,00 €")
                    .contains("90,00 €")
                    .contains("ID št. za DDV: SI12345678")
                    .contains("TRR: SI45 5465 4542 2542 4XX")
                    .contains("ODGOVORNA OSEBA")
                    .doesNotContain("Skupaj z DDV");
        }
    }

    private static FolioPdfRequest.ServiceLine serviceLine(String description, String totalGross) {
        return serviceLine(description, "10.00", totalGross, "22%", "2.20");
    }

    private static FolioPdfRequest.ServiceLine serviceLine(
            String description,
            String nett,
            String totalGross,
            String taxPercent,
            String taxAmount
    ) {
        FolioPdfRequest.ServiceLine line = new FolioPdfRequest.ServiceLine();
        line.setDate("2026-05-08");
        line.setDescription(description);
        line.setQty(1);
        line.setNettPrice(new BigDecimal(nett));
        line.setGrossPrice(new BigDecimal(totalGross));
        line.setTaxPercent(taxPercent);
        line.setTaxAmount(new BigDecimal(taxAmount));
        line.setTotalPrice(new BigDecimal(totalGross));
        return line;
    }
}
