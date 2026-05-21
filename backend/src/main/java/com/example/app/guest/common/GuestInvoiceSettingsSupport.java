package com.example.app.guest.common;

import com.example.app.billing.Bill;
import com.example.app.client.Client;
import com.example.app.client.InvoiceRecipientType;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class GuestInvoiceSettingsSupport {
    private GuestInvoiceSettingsSupport() {}

    public static void applyInvoiceSettings(Client client, GuestDtos.UpdateGuestProfileSettingsRequest request) {
        if (client == null || request == null) return;
        InvoiceRecipientType type = parseRecipientType(request.invoiceRecipientType());
        if (type == null) {
            return;
        }
        client.setInvoiceRecipientType(type);
        if (type == InvoiceRecipientType.COMPANY) {
            client.setInvoiceCompanyName(required(request.invoiceCompanyName(), "Company name is required."));
            client.setInvoiceCompanyAddressLine(required(request.invoiceCompanyAddressLine(), "Company address is required."));
            client.setInvoiceCompanyPostalCode(required(request.invoiceCompanyPostalCode(), "Company postal code is required."));
            client.setInvoiceCompanyCity(required(request.invoiceCompanyCity(), "Company city is required."));
            client.setInvoiceCompanyVatId(required(request.invoiceCompanyVatId(), "Company VAT ID is required."));

            client.setInvoicePersonAddressLine(null);
            client.setInvoicePersonPostalCode(null);
            client.setInvoicePersonCity(null);
            return;
        }

        client.setInvoicePersonAddressLine(required(request.invoicePersonAddressLine(), "Address is required."));
        client.setInvoicePersonPostalCode(required(request.invoicePersonPostalCode(), "Postal code is required."));
        client.setInvoicePersonCity(required(request.invoicePersonCity(), "City is required."));

        client.setInvoiceCompanyName(null);
        client.setInvoiceCompanyAddressLine(null);
        client.setInvoiceCompanyPostalCode(null);
        client.setInvoiceCompanyCity(null);
        client.setInvoiceCompanyVatId(null);
    }

    public static GuestDtos.GuestInvoiceSettingsResponse toResponse(Client client) {
        InvoiceRecipientType type = client != null && client.getInvoiceRecipientType() != null
                ? client.getInvoiceRecipientType()
                : InvoiceRecipientType.PERSON;
        return new GuestDtos.GuestInvoiceSettingsResponse(
                type.name(),
                client == null ? null : blankToNull(client.getInvoicePersonAddressLine()),
                client == null ? null : blankToNull(client.getInvoicePersonPostalCode()),
                client == null ? null : blankToNull(client.getInvoicePersonCity()),
                client == null ? null : blankToNull(client.getInvoiceCompanyName()),
                client == null ? null : blankToNull(client.getInvoiceCompanyAddressLine()),
                client == null ? null : blankToNull(client.getInvoiceCompanyPostalCode()),
                client == null ? null : blankToNull(client.getInvoiceCompanyCity()),
                client == null ? null : blankToNull(client.getInvoiceCompanyVatId())
        );
    }

    public static void applyBillRecipientSnapshot(Bill bill, Client client) {
        InvoiceRecipientType type = client != null && client.getInvoiceRecipientType() != null
                ? client.getInvoiceRecipientType()
                : InvoiceRecipientType.PERSON;
        if (type == InvoiceRecipientType.COMPANY) {
            bill.setRecipientTypeSnapshot("COMPANY");
            bill.setRecipientCompanyIdSnapshot(null);
            bill.setRecipientCompanyNameSnapshot(blankToNull(client == null ? null : client.getInvoiceCompanyName()));
            bill.setRecipientCompanyAddressSnapshot(blankToNull(client == null ? null : client.getInvoiceCompanyAddressLine()));
            bill.setRecipientCompanyPostalCodeSnapshot(blankToNull(client == null ? null : client.getInvoiceCompanyPostalCode()));
            bill.setRecipientCompanyCitySnapshot(blankToNull(client == null ? null : client.getInvoiceCompanyCity()));
            bill.setRecipientCompanyVatIdSnapshot(blankToNull(client == null ? null : client.getInvoiceCompanyVatId()));
            bill.setRecipientCompanyIbanSnapshot(null);
            bill.setRecipientCompanyEmailSnapshot(null);
            bill.setRecipientCompanyTelephoneSnapshot(null);
            return;
        }

        bill.setRecipientTypeSnapshot("PERSON");
        bill.setRecipientCompanyIdSnapshot(null);
        bill.setRecipientCompanyNameSnapshot(null);
        bill.setRecipientCompanyAddressSnapshot(blankToNull(client == null ? null : client.getInvoicePersonAddressLine()));
        bill.setRecipientCompanyPostalCodeSnapshot(blankToNull(client == null ? null : client.getInvoicePersonPostalCode()));
        bill.setRecipientCompanyCitySnapshot(blankToNull(client == null ? null : client.getInvoicePersonCity()));
        bill.setRecipientCompanyVatIdSnapshot(null);
        bill.setRecipientCompanyIbanSnapshot(null);
        bill.setRecipientCompanyEmailSnapshot(null);
        bill.setRecipientCompanyTelephoneSnapshot(null);
    }

    private static InvoiceRecipientType parseRecipientType(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return InvoiceRecipientType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid invoice recipient type.");
        }
    }

    private static String required(String value, String message) {
        String normalized = blankToNull(value);
        if (normalized == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return normalized;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
