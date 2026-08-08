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
                    "ID št. za DDV: SI12345678",
                    "TRR: SI56 1910 0001 2345 678",
                    "RAC-2026-00042",
                    "31.07.2026",
                    "Izdano Maribor, 31.07.2026 12:45",
                    "Masaža hrbta",
                    "Skupaj EUR 200.00",
                    "Za plačilo EUR 100.00",
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
    void generate_showsDiscountedInvoiceTotalAndSuppressesNoVatClauseForTaxedLines() throws Exception {
        FolioPdfRequest request = sampleRequest(1);
        request.setToBePaidGross(new BigDecimal("90.00"));
        request.setSubtotalBeforeDiscountGross(new BigDecimal("100.00"));
        PosReceiptLayoutConfig layout = PosReceiptLayoutConfig.defaultLayout();
        layout.setTaxClauses(List.of("DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1."));

        byte[] pdf = service.generate(request, layout, null);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String normalizedText = new PDFTextStripper().getText(document).replaceAll("\\s+", " ").trim();
            assertThat(normalizedText)
                    .contains("Skupaj EUR 90.00", "Popust - 10.00", "Za plačilo EUR 90.00")
                    .doesNotContain("DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.")
                    .doesNotContain("DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1.")
                    .doesNotContain("100.00 EUR", "90.00 EUR", "10.00 EUR")
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
                    .contains("DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.")
                    .doesNotContain("Davčne klavzule");
        }

        FolioPdfRequest mixedVat = sampleRequest(2);
        mixedVat.getServices().get(0).setTaxPercent("NO VAT");
        mixedVat.getServices().get(0).setTaxAmount(BigDecimal.ZERO);
        byte[] mixedVatPdf = service.generate(mixedVat, PosReceiptLayoutConfig.defaultLayout(), null);
        try (PDDocument document = Loader.loadPDF(mixedVatPdf)) {
            String normalizedText = new PDFTextStripper().getText(document).replaceAll("\\s+", " ").trim();
            assertThat(normalizedText)
                    .doesNotContain("DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.");
        }
    }


    @Test
    void generate_movesTaxClausesAfterTotalsHidesNoVatBreakdownAndKeepsFiscalCodesTogether() throws Exception {
        FolioPdfRequest request = new FolioPdfRequest();
        request.setLocale("sl");
        request.setCompanyName("Calendra Studio");
        request.setCompanyAddress("Glavna ulica 12");
        request.setCompanyPostalCode("2000");
        request.setCompanyCity("Maribor");
        request.setFolioNumberLabel("Predplačilo:");
        request.setFolioNumber("33");
        request.setFolioDate("2026-08-01 22:17");
        request.setIssueCity("Maribor");
        request.setDateOfService("2026-08-01");
        request.setDueDate("2026-08-16");
        request.setRecipientName("Andre");
        request.setRecipientAddress("Cesta v duplek");
        request.setRecipientPostalCode("2000");
        request.setRecipientCity("Maribor");
        request.setRecipientVatId("SI10234224");
        request.setToBePaidGross(new BigDecimal("39.60"));
        request.setDiscountAmountGross(new BigDecimal("4.40"));
        request.setSubtotalBeforeDiscountGross(new BigDecimal("44.00"));
        request.setIssuedBy("David Mirc");
        request.setFiscalZoi("e42bdfd7b3f10d69ed0eadb9add8d92c");
        request.setFiscalEor("9999cf00-089a-46e6-a3d8-bcbb0da779c7");
        request.setFiscalQr("1234567890123456789012345678901234567890");

        FolioPdfRequest.ServiceLine line = new FolioPdfRequest.ServiceLine("Avans", 1, new BigDecimal("39.60"), new BigDecimal("39.60"));
        line.setDate("2026-08-01");
        line.setTaxPercent("NO VAT");
        line.setTaxAmount(BigDecimal.ZERO);
        line.setTotalPrice(new BigDecimal("39.60"));
        request.setServices(List.of(line));

        byte[] pdf = service.generate(request, PosReceiptLayoutConfig.defaultLayout(), null);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String normalizedText = new PDFTextStripper().getText(document).replaceAll("\\s+", " ").trim();
            assertThat(normalizedText)
                    .contains("Skupaj brez DDV 44.00")
                    .contains("Popust - 4.40")
                    .contains("Skupaj EUR 39.60")
                    .contains("Za plačilo EUR 39.60")
                    .contains("EOR: 9999cf00-089a-46e6-a3d8-bcbb0da779c7")
                    .contains("ZOI: e42bdfd7b3f10d69ed0eadb9add8d92c")
                    .contains("DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.")
                    .doesNotContain("Davčne klavzule")
                    .doesNotContain("Brez DDV · osnova");
            assertThat(normalizedText.indexOf("Za plačilo EUR 39.60")).isLessThan(normalizedText.indexOf("DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1."));
        }
    }

    @Test
    void generate_placesUsedAdvancesAtEndOfPaymentMethodsAndShowsPaidAndNegativeAdvanceVat() throws Exception {
        FolioPdfRequest request = sampleRequest(1);
        request.setSubtotalBeforeDiscountGross(new BigDecimal("100.00"));
        request.setDiscountAmountGross(new BigDecimal("10.00"));
        request.setToBePaidGross(BigDecimal.ZERO);
        request.setPaymentMethods(List.of(
                new FolioPdfRequest.PaymentLine("Kartica", new BigDecimal("40.00")),
                new FolioPdfRequest.PaymentLine("Gotovina", new BigDecimal("45.00"))
        ));
        request.setPaymentMethod("Kartica, Gotovina");
        request.setUsedAdvancePaymentsGross(new BigDecimal("5.00"));

        FolioPdfRequest.AdvancePaymentLine advance = new FolioPdfRequest.AdvancePaymentLine();
        advance.setAdvanceNumber("REC123-1-67");
        advance.setDate("2026-08-05");
        advance.setTaxPercent("22%");
        advance.setNetBasis(new BigDecimal("50.60"));
        advance.setTaxAmount(new BigDecimal("4.40"));
        advance.setTotalGross(new BigDecimal("55.00"));
        advance.setUsedGross(new BigDecimal("5.00"));
        request.setAdvancePayments(List.of(advance));

        PosReceiptLayoutConfig layout = PosReceiptLayoutConfig.defaultLayout();
        layout.setShowPaymentDetails(true);

        byte[] pdf = service.generate(request, layout, null);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String normalizedText = new PDFTextStripper().getText(document).replaceAll("\\s+", " ").trim();
            assertThat(normalizedText)
                    .contains("Popust - 10.00")
                    .contains("Skupaj brez DDV 81.97")
                    .contains("DDV 22% · osnova 81.97 18.03")
                    .contains("DDV 22% (porabljeno predplačilo) - 0.40")
                    .contains("Skupaj EUR 90.00")
                    .contains("Porabljeno predplačilo - 5.00")
                    .contains("Plačano EUR 85.00")
                    .contains("Za plačilo EUR 0.00")
                    .contains("Načini plačila")
                    .contains("Kartica 40.00")
                    .contains("Gotovina 45.00")
                    .contains("Porabljena predplačila")
                    .contains("REC123-1-67 05.08.2026 - 5.00")
                    .doesNotContain("Razčlenitev DDV")
                    .containsOnlyOnce("DDV 22% (porabljeno predplačilo)");

            assertThat(normalizedText.indexOf("Popust - 10.00"))
                    .isLessThan(normalizedText.indexOf("Skupaj brez DDV 81.97"));
            assertThat(normalizedText.indexOf("Skupaj brez DDV 81.97"))
                    .isLessThan(normalizedText.indexOf("DDV 22% · osnova 81.97 18.03"));
            assertThat(normalizedText.indexOf("DDV 22% (porabljeno predplačilo) - 0.40"))
                    .isLessThan(normalizedText.indexOf("Skupaj EUR 90.00"));
            assertThat(normalizedText.indexOf("Skupaj EUR 90.00"))
                    .isLessThan(normalizedText.indexOf("Porabljeno predplačilo - 5.00"));
            assertThat(normalizedText.indexOf("Porabljeno predplačilo - 5.00"))
                    .isLessThan(normalizedText.indexOf("Plačano EUR 85.00"));
            assertThat(normalizedText.indexOf("Plačano EUR 85.00"))
                    .isLessThan(normalizedText.indexOf("Za plačilo EUR 0.00"));
            assertThat(normalizedText.indexOf("Kartica 40.00"))
                    .isLessThan(normalizedText.indexOf("Porabljena predplačila"));
            assertThat(normalizedText.indexOf("Porabljena predplačila"))
                    .isLessThan(normalizedText.indexOf("REC123-1-67 05.08.2026 - 5.00"));
        }
    }

    @Test
    void generate_canShowPaymentTypeWhenEnabledInLayout() throws Exception {
        FolioPdfRequest request = sampleRequest(1);
        PosReceiptLayoutConfig layout = PosReceiptLayoutConfig.defaultLayout();
        layout.setShowPaymentDetails(true);

        byte[] pdf = service.generate(request, layout, null);

        try (PDDocument document = Loader.loadPDF(pdf)) {
            String pdfText = new PDFTextStripper().getText(document)
                    .replace("\r\n", "\n")
                    .replace('\r', '\n');

            assertThat(pdfText)
                    .contains("Bančno nakazilo 100.00")
                    .doesNotContain("Način plačila:");
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
        request.setIban("SI56191000012345678");
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
