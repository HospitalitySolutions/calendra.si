package com.example.app.billing;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Structured configuration for the 58 mm thermal receipt layout.
 * Unlike the A4 editor this format is flow based, so sections automatically
 * collapse and move when optional information is not present.
 */
public class PosReceiptLayoutConfig {
    public static final String DEFAULT_REFERENCE_TEXT_SL = "Prosimo, da se pri plačilu sklicujete na št.: {reference-number}";
    public static final String DEFAULT_REFERENCE_TEXT_EN = "Please use the following reference when making the payment: {reference-number}";
    public static final String DEFAULT_REFERENCE_TEXT_SR = "Molimo vas da se prilikom plaćanja pozovete na broj: {reference-number}";

    public static final List<String> DEFAULT_SECTION_ORDER = List.of(
            "company",
            "document",
            "recipient",
            "items",
            "advancePayments",
            "vat",
            "totals",
            "taxClauses",
            "paymentQr",
            "fiscal",
            "issuedBy",
            "notes",
            "footer"
    );

    private boolean showLogo = true;
    private boolean showRecipient = true;
    private boolean showUnitPriceAndQuantity = true;
    private boolean showVatBreakdown = true;
    /** Retained only so older saved JSON can still be read. Payment details are no longer rendered. */
    private boolean showPaymentDetails = true;
    private boolean showPaymentQr = true;
    /** Controls the complete fiscal block: ZOI, EOR and the fiscal QR code. */
    private boolean showFiscalQr = true;
    private boolean showNotes = true;
    private boolean showIssuedBy = true;
    private String fontSize = "STANDARD";
    private String footerText = "";
    private List<String> taxClauses = new ArrayList<>();
    private Map<String, String> referenceTexts = defaultReferenceTexts();
    private List<String> sectionOrder = new ArrayList<>(DEFAULT_SECTION_ORDER);

    public static PosReceiptLayoutConfig defaultLayout() {
        return normalize(new PosReceiptLayoutConfig());
    }

    public static PosReceiptLayoutConfig normalize(PosReceiptLayoutConfig input) {
        PosReceiptLayoutConfig source = input == null ? new PosReceiptLayoutConfig() : input;
        PosReceiptLayoutConfig normalized = new PosReceiptLayoutConfig();
        normalized.showLogo = source.showLogo;
        normalized.showRecipient = source.showRecipient;
        normalized.showUnitPriceAndQuantity = source.showUnitPriceAndQuantity;
        normalized.showVatBreakdown = source.showVatBreakdown;
        normalized.showPaymentDetails = source.showPaymentDetails;
        normalized.showPaymentQr = source.showPaymentQr;
        normalized.showFiscalQr = source.showFiscalQr;
        normalized.showNotes = source.showNotes;
        normalized.showIssuedBy = source.showIssuedBy;
        normalized.fontSize = normalizeFontSize(source.fontSize);
        normalized.footerText = source.footerText == null ? "" : source.footerText.strip();
        normalized.taxClauses = normalizeTaxClauses(source.taxClauses);
        normalized.referenceTexts = normalizeReferenceTexts(source.referenceTexts);

        Set<String> ordered = new LinkedHashSet<>();
        if (source.sectionOrder != null) {
            for (String section : source.sectionOrder) {
                if (section != null && DEFAULT_SECTION_ORDER.contains(section)) ordered.add(section);
            }
        }
        ordered.addAll(DEFAULT_SECTION_ORDER);
        normalized.sectionOrder = new ArrayList<>(ordered);
        return normalized;
    }

    private static String normalizeFontSize(String value) {
        if (value == null || value.isBlank()) return "STANDARD";
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "COMPACT", "LARGE" -> normalized;
            default -> "STANDARD";
        };
    }

    private static List<String> normalizeTaxClauses(List<String> input) {
        List<String> normalized = new ArrayList<>();
        if (input == null) return normalized;
        for (String clause : input) {
            if (clause == null) continue;
            String trimmed = clause.trim();
            if (!trimmed.isBlank() && !normalized.contains(trimmed)) normalized.add(trimmed);
        }
        return normalized;
    }

    private static Map<String, String> defaultReferenceTexts() {
        Map<String, String> defaults = new LinkedHashMap<>();
        defaults.put("sl", DEFAULT_REFERENCE_TEXT_SL);
        defaults.put("en", DEFAULT_REFERENCE_TEXT_EN);
        defaults.put("sr", DEFAULT_REFERENCE_TEXT_SR);
        return defaults;
    }

    private static Map<String, String> normalizeReferenceTexts(Map<String, String> input) {
        Map<String, String> normalized = defaultReferenceTexts();
        if (input == null) return normalized;
        for (String locale : List.of("sl", "en", "sr")) {
            if (!input.containsKey(locale)) continue;
            String value = input.get(locale);
            normalized.put(locale, value == null ? "" : value.strip());
        }
        return normalized;
    }

    public boolean isShowLogo() { return showLogo; }
    public void setShowLogo(boolean showLogo) { this.showLogo = showLogo; }
    public boolean isShowRecipient() { return showRecipient; }
    public void setShowRecipient(boolean showRecipient) { this.showRecipient = showRecipient; }
    public boolean isShowUnitPriceAndQuantity() { return showUnitPriceAndQuantity; }
    public void setShowUnitPriceAndQuantity(boolean showUnitPriceAndQuantity) { this.showUnitPriceAndQuantity = showUnitPriceAndQuantity; }
    public boolean isShowVatBreakdown() { return showVatBreakdown; }
    public void setShowVatBreakdown(boolean showVatBreakdown) { this.showVatBreakdown = showVatBreakdown; }
    public boolean isShowPaymentDetails() { return showPaymentDetails; }
    public void setShowPaymentDetails(boolean showPaymentDetails) { this.showPaymentDetails = showPaymentDetails; }
    public boolean isShowPaymentQr() { return showPaymentQr; }
    public void setShowPaymentQr(boolean showPaymentQr) { this.showPaymentQr = showPaymentQr; }
    public boolean isShowFiscalQr() { return showFiscalQr; }
    public void setShowFiscalQr(boolean showFiscalQr) { this.showFiscalQr = showFiscalQr; }
    public boolean isShowNotes() { return showNotes; }
    public void setShowNotes(boolean showNotes) { this.showNotes = showNotes; }
    public boolean isShowIssuedBy() { return showIssuedBy; }
    public void setShowIssuedBy(boolean showIssuedBy) { this.showIssuedBy = showIssuedBy; }
    public String getFontSize() { return fontSize; }
    public void setFontSize(String fontSize) { this.fontSize = fontSize; }
    public String getFooterText() { return footerText; }
    public void setFooterText(String footerText) { this.footerText = footerText; }
    public List<String> getTaxClauses() { return taxClauses; }
    public void setTaxClauses(List<String> taxClauses) { this.taxClauses = taxClauses; }
    public Map<String, String> getReferenceTexts() { return referenceTexts; }
    public void setReferenceTexts(Map<String, String> referenceTexts) { this.referenceTexts = referenceTexts; }
    public List<String> getSectionOrder() { return sectionOrder; }
    public void setSectionOrder(List<String> sectionOrder) { this.sectionOrder = sectionOrder; }
}
