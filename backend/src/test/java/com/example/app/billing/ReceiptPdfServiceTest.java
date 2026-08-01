package com.example.app.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class ReceiptPdfServiceTest {
    private final ReceiptPdfService service = new ReceiptPdfService();

    @Test
    void generate_uses58MillimetrePaperAndExtractableInvoiceContent() throws Exception {
        FolioPdfRequest request = sampleRequest(2);
        request.setPaymentQrPayload("https://calendra.si/placilo/2026-42");
        request.setFiscalZoi("12345678901234567890123456789012");
        request.setFiscalEor("EOR-2026-42");
        request.setFiscalQr("1234567890123456789012345678901234567890");

        byte[] pdf = service.generate(request, PosReceiptLayoutConfig.defaultLayout(), null);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            assertThat(document.getNumberOfPages()).isEqualTo(1);
            assertThat(document.getPage(0).getMediaBox().getWidth())
                    .isCloseTo(ReceiptPdfService.PAPER_WIDTH_PT, within(0.05f));
            assertThat(document.getPage(0).getMediaBox().getHeight()).isGreaterThan(200f);
            String text = new PDFTextStripper().getText(document);
            // PDFBox preserves visual line wraps in extracted text. Normalize whitespace so
            // assertions verify the receipt content rather than a specific 58 mm wrap point.
            String normalizedText = text.replaceAll("\\s+", " ").trim();
            assertThat(normalizedText).contains(
                    "Calendra Studio",
                    "TRR: SI56 1910 0001 2345 678",
                    "RAC-2026-00042",
                    "31.07.2026",
                    "Ura in kraj izdaje 12:45, Maribor",
                    "Masaža hrbta",
                    "100.00 EUR",
                    "Popust",
                    "Prosimo, da se pri plačilu sklicujete na št.: SI00 123",
                    "EOR-2026-42",
                    "Izdal"
            );
            assertThat(normalizedText).doesNotContain("Bančno nakazilo");
            assertThat(normalizedText).doesNotContain("Fiskalna koda");
        }
    }

    @Test
    void generate_expandsPaperHeightForLongInvoices() throws Exception {
        byte[] shortPdf = service.generate(sampleRequest(1), PosReceiptLayoutConfig.defaultLayout(), null);
        byte[] longPdf = service.generate(sampleRequest(35), PosReceiptLayoutConfig.defaultLayout(), null);

        try (PDDocument shortDocument = Loader.loadPDF(shortPdf);
             PDDocument longDocument = Loader.loadPDF(longPdf)) {
            float shortHeight = shortDocument.getPage(0).getMediaBox().getHeight();
            float longHeight = longDocument.getPage(0).getMediaBox().getHeight();
            assertThat(longHeight).isGreaterThan(shortHeight + 500f);
            assertThat(new PDFTextStripper().getText(longDocument)).contains("Storitev številka 35");
        }
    }

    @Test
    void generate_ignoresInvalidOptionalLogoData() {
        byte[] pdf = service.generate(sampleRequest(1), PosReceiptLayoutConfig.defaultLayout(), new byte[] { 1, 2, 3, 4 });
        assertThat(pdf).isNotEmpty();
    }

    @Test
    void generate_showsPreDiscountSubtotalAndPrintsTaxClausesWithoutSectionHeading() throws Exception {
        FolioPdfRequest request = sampleRequest(1);
        request.setToBePaidGross(new BigDecimal("90.00"));
        request.setSubtotalBeforeDiscountGross(new BigDecimal("100.00"));
        PosReceiptLayoutConfig layout = PosReceiptLayoutConfig.defaultLayout();
        layout.setTaxClauses(List.of("DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1."));

        byte[] pdf = service.generate(request, layout, null);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String normalizedText = new PDFTextStripper().getText(document).replaceAll("\\s+", " ").trim();
            assertThat(normalizedText)
                    .contains("Skupaj 100.00 EUR", "Popust - 10.00 EUR", "Za plačilo 90.00 EUR")
                    .contains("DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1.")
                    .doesNotContain("Davčne klavzule");
        }
    }


    @Test
    void generate_automaticallyPrintsSmallTaxpayerClauseOnlyWhenEveryServiceIsExplicitlyNoVat() throws Exception {
        FolioPdfRequest allNoVat = sampleRequest(2);
        for (FolioPdfRequest.ServiceLine line : allNoVat.getServices()) {
            line.setTaxPercent("NO VAT");
            line.setNettPrice(line.getGrossPrice());
            line.setTaxAmount(BigDecimal.ZERO);
        }

        byte[] allNoVatPdf = service.generate(allNoVat, PosReceiptLayoutConfig.defaultLayout(), null);
        try (PDDocument document = Loader.loadPDF(allNoVatPdf)) {
            String normalizedText = new PDFTextStripper().getText(document).replaceAll("\\s+", " ").trim();
            assertThat(normalizedText)
                    .contains("DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1.")
                    .doesNotContain("Davčne klavzule");
        }

        FolioPdfRequest mixedVat = sampleRequest(2);
        mixedVat.getServices().get(0).setTaxPercent("NO VAT");
        mixedVat.getServices().get(0).setTaxAmount(BigDecimal.ZERO);
        byte[] mixedVatPdf = service.generate(mixedVat, PosReceiptLayoutConfig.defaultLayout(), null);
        try (PDDocument document = Loader.loadPDF(mixedVatPdf)) {
            String normalizedText = new PDFTextStripper().getText(document).replaceAll("\\s+", " ").trim();
            assertThat(normalizedText)
                    .doesNotContain("DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1.");
        }
    }

    private FolioPdfRequest sampleRequest(int lineCount) {
        FolioPdfRequest request = new FolioPdfRequest();
        request.setLocale("sl");
        request.setCompanyName("Calendra Studio");
        request.setCompanyAddress("Glavna ulica 12");
        request.setCompanyPostalCode("2000");
        request.setCompanyCity("Maribor");
        request.setCompanyTaxId("SI12345678");
        request.setFolioNumberLabel("Račun:");
        request.setFolioNumber("RAC-2026-00042");
        request.setFolioDate("2026-07-31 12:45");
        request.setIssueCity("Maribor");
        request.setDateOfService("2026-07-31");
        request.setDueDate("2026-08-07");
        request.setRecipientName("Ana Novak");
        request.setRecipientAddress("Cesta 5");
        request.setRecipientPostalCode("1000");
        request.setRecipientCity("Ljubljana");
        request.setPaymentMethods(List.of(new FolioPdfRequest.PaymentLine("Bančno nakazilo", new BigDecimal("100.00"))));
        request.setPaymentMethod("Bančno nakazilo");
        request.setIban("SI56 1910 0001 2345 678");
        request.setIssuedBy("David Mirc");
        request.setToBePaidGross(new BigDecimal("100.00"));
        request.setDiscountAmountGross(new BigDecimal("10.00"));
        request.setNotes("SI00 123");

        List<FolioPdfRequest.ServiceLine> services = new ArrayList<>();
        for (int index = 1; index <= lineCount; index++) {
            String description = index == 1
                    ? "Masaža hrbta in vratu z daljšim opisom storitve"
                    : "Storitev številka " + index + " z daljšim opisom za preverjanje preloma vrstice";
            FolioPdfRequest.ServiceLine line = new FolioPdfRequest.ServiceLine(
                    description,
                    1,
                    new BigDecimal("81.97"),
                    new BigDecimal("100.00")
            );
            line.setTaxPercent("22%");
            line.setTaxAmount(new BigDecimal("18.03"));
            line.setTotalPrice(new BigDecimal("100.00"));
            services.add(line);
        }
        request.setServices(services);
        return request;
    }

    private static org.assertj.core.data.Offset<Float> within(float value) {
        return org.assertj.core.data.Offset.offset(value);
    }
}
