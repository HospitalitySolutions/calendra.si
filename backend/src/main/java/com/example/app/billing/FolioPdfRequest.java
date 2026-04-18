package com.example.app.billing;

import java.math.BigDecimal;
import java.util.List;

/**
 * POST body for {@code /api/billing/folio/pdf}.
 * All fields are optional except {@code services} (at least one row required).
 */
public class FolioPdfRequest {

    /* ── header: company block ── */
    private String companyName;
    private String companyAddress;
    private String companyPostalCode;
    private String companyCity;
    private String companyTaxId;

    /* ── header: document meta ── */
    private String folioNumber;
    private String folioDate;
    private String dateOfService;
    private String dueDate;

    /* ── header: recipient ── */
    private String recipientName;
    private String recipientAddress;
    private String recipientPostalCode;
    private String recipientCity;
    private String recipientVatId;

    /* ── line items ── */
    private List<ServiceLine> services;

    /* ── footer ── */
    private String notes;
    private String paymentMethod;
    private String issuedBy;
    private String iban;
    private String paymentQrPayload;

    public static class ServiceLine {
        private String date;
        private String description;
        private int qty;
        private BigDecimal nettPrice;
        private BigDecimal grossPrice;
        private String taxPercent;
        private BigDecimal taxAmount;
        private BigDecimal totalPrice;

        public ServiceLine() {}

        public ServiceLine(String description, int qty, BigDecimal nettPrice, BigDecimal grossPrice) {
            this.description = description;
            this.qty = qty;
            this.nettPrice = nettPrice;
            this.grossPrice = grossPrice;
        }

        public String getDate() { return date; }
        public void setDate(String date) { this.date = date; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public int getQty() { return qty; }
        public void setQty(int qty) { this.qty = qty; }
        public BigDecimal getNettPrice() { return nettPrice; }
        public void setNettPrice(BigDecimal nettPrice) { this.nettPrice = nettPrice; }
        public BigDecimal getGrossPrice() { return grossPrice; }
        public void setGrossPrice(BigDecimal grossPrice) { this.grossPrice = grossPrice; }
        public String getTaxPercent() { return taxPercent; }
        public void setTaxPercent(String taxPercent) { this.taxPercent = taxPercent; }
        public BigDecimal getTaxAmount() { return taxAmount; }
        public void setTaxAmount(BigDecimal taxAmount) { this.taxAmount = taxAmount; }
        public BigDecimal getTotalPrice() { return totalPrice; }
        public void setTotalPrice(BigDecimal totalPrice) { this.totalPrice = totalPrice; }
    }

    public FolioPdfRequest() {}

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }
    public String getCompanyAddress() { return companyAddress; }
    public void setCompanyAddress(String companyAddress) { this.companyAddress = companyAddress; }
    public String getCompanyPostalCode() { return companyPostalCode; }
    public void setCompanyPostalCode(String companyPostalCode) { this.companyPostalCode = companyPostalCode; }
    public String getCompanyCity() { return companyCity; }
    public void setCompanyCity(String companyCity) { this.companyCity = companyCity; }
    public String getCompanyTaxId() { return companyTaxId; }
    public void setCompanyTaxId(String companyTaxId) { this.companyTaxId = companyTaxId; }
    public String getFolioNumber() { return folioNumber; }
    public void setFolioNumber(String folioNumber) { this.folioNumber = folioNumber; }
    public String getFolioDate() { return folioDate; }
    public void setFolioDate(String folioDate) { this.folioDate = folioDate; }
    public String getDateOfService() { return dateOfService; }
    public void setDateOfService(String dateOfService) { this.dateOfService = dateOfService; }
    public String getDueDate() { return dueDate; }
    public void setDueDate(String dueDate) { this.dueDate = dueDate; }
    public String getRecipientName() { return recipientName; }
    public void setRecipientName(String recipientName) { this.recipientName = recipientName; }
    public String getRecipientAddress() { return recipientAddress; }
    public void setRecipientAddress(String recipientAddress) { this.recipientAddress = recipientAddress; }
    public String getRecipientPostalCode() { return recipientPostalCode; }
    public void setRecipientPostalCode(String recipientPostalCode) { this.recipientPostalCode = recipientPostalCode; }
    public String getRecipientCity() { return recipientCity; }
    public void setRecipientCity(String recipientCity) { this.recipientCity = recipientCity; }
    public String getRecipientVatId() { return recipientVatId; }
    public void setRecipientVatId(String recipientVatId) { this.recipientVatId = recipientVatId; }
    public List<ServiceLine> getServices() { return services; }
    public void setServices(List<ServiceLine> services) { this.services = services; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
    public String getIssuedBy() { return issuedBy; }
    public void setIssuedBy(String issuedBy) { this.issuedBy = issuedBy; }
    public String getIban() { return iban; }
    public void setIban(String iban) { this.iban = iban; }
    public String getPaymentQrPayload() { return paymentQrPayload; }
    public void setPaymentQrPayload(String paymentQrPayload) { this.paymentQrPayload = paymentQrPayload; }
}
