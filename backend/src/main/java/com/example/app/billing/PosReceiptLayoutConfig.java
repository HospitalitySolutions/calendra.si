package com.example.app.billing;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Structured configuration for the 58 mm thermal receipt layout.
 * Unlike the A4 editor this format is flow based, so sections automatically
 * collapse and move when optional information is not present.
 */
public class PosReceiptLayoutConfig {
    public static final List<String> DEFAULT_SECTION_ORDER = List.of(
            "company",
            "document",
            "recipient",
            "items",
            "advancePayments",
            "totals",
            "vat",
            "payment",
            "paymentQr",
            "fiscal",
            "notes",
            "footer"
    );

    private boolean showLogo = true;
    private boolean showRecipient = true;
    private boolean showUnitPriceAndQuantity = true;
    private boolean showVatBreakdown = true;
    private boolean showPaymentDetails = true;
    private boolean showPaymentQr = true;
    private boolean showFiscalQr = true;
    private boolean showNotes = true;
    private boolean showIssuedBy = true;
    private String fontSize = "STANDARD";
    private String footerText = "";
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
    public List<String> getSectionOrder() { return sectionOrder; }
    public void setSectionOrder(List<String> sectionOrder) { this.sectionOrder = sectionOrder; }
}
