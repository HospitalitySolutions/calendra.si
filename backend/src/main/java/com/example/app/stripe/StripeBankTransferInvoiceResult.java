package com.example.app.stripe;

public record StripeBankTransferInvoiceResult(
        String customerId,
        String invoiceId,
        String hostedInvoiceUrl,
        String status,
        String invoiceNumber,
        String iban,
        String bic,
        String accountHolderName,
        String accountHolderAddressLine1,
        String accountHolderPostalCode,
        String accountHolderCity,
        String accountHolderCountry
) {
}
