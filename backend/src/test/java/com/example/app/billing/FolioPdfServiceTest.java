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
            assertThat(text).contains("Opis DDV");
            assertThat(text).contains("Stopnja DDV");
            assertThat(text).contains("Osnova DDV");
            assertThat(text).contains("Vrednost DDV");
            assertThat(text).contains("DDV 22%");
            assertThat(text).contains("EUR 10.00");
            assertThat(text).contains("EUR 2.20");
            assertThat(text).contains("DDV 9,5%");
            assertThat(text).contains("EUR 0.95");
            assertThat(text).contains("DDV 0%");
            assertThat(text).contains("EUR 8.00");
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
