package com.example.app.guest.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.example.app.billing.Bill;
import com.example.app.client.Client;
import com.example.app.client.InvoiceRecipientType;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class GuestInvoiceSettingsSupportTest {

    @Test
    void applyInvoiceSettings_company_requiresVatAndStoresCompanyFields() {
        Client client = new Client();
        client.setInvoiceRecipientType(InvoiceRecipientType.PERSON);

        GuestInvoiceSettingsSupport.applyInvoiceSettings(
                client,
                new GuestDtos.UpdateGuestProfileSettingsRequest(
                        "Ana",
                        "Novak",
                        "ana@example.com",
                        null,
                        "sl",
                        "1",
                        null,
                        null,
                        null,
                        null,
                        "COMPANY",
                        null,
                        null,
                        null,
                        "Acme d.o.o.",
                        "Main Street 1",
                        "1000",
                        "Ljubljana",
                        "SI12345678"));

        assertThat(client.getInvoiceRecipientType()).isEqualTo(InvoiceRecipientType.COMPANY);
        assertThat(client.getInvoiceCompanyName()).isEqualTo("Acme d.o.o.");
        assertThat(client.getInvoiceCompanyVatId()).isEqualTo("SI12345678");
        assertThat(client.getInvoicePersonAddressLine()).isNull();
    }

    @Test
    void applyInvoiceSettings_company_withoutVatThrows() {
        Client client = new Client();
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> GuestInvoiceSettingsSupport.applyInvoiceSettings(
                        client,
                        new GuestDtos.UpdateGuestProfileSettingsRequest(
                                "Ana",
                                "Novak",
                                "ana@example.com",
                                null,
                                "sl",
                                "1",
                                null,
                                null,
                                null,
                                null,
                                "COMPANY",
                                null,
                                null,
                                null,
                                "Acme d.o.o.",
                                "Main Street 1",
                                "1000",
                                "Ljubljana",
                                null)));
        assertThat(ex.getReason()).isEqualTo("Company VAT ID is required.");
    }

    @Test
    void applyInvoiceSettings_person_requiresAddressAndClearsCompanyFields() {
        Client client = new Client();
        client.setInvoiceCompanyName("Old company");
        client.setInvoiceCompanyVatId("SI999");

        GuestInvoiceSettingsSupport.applyInvoiceSettings(
                client,
                new GuestDtos.UpdateGuestProfileSettingsRequest(
                        "Ana",
                        "Novak",
                        "ana@example.com",
                        null,
                        "sl",
                        "1",
                        null,
                        null,
                        null,
                        null,
                        "PERSON",
                        "Street 2",
                        "2000",
                        "Maribor",
                        null,
                        null,
                        null,
                        null,
                        null));

        assertThat(client.getInvoiceRecipientType()).isEqualTo(InvoiceRecipientType.PERSON);
        assertThat(client.getInvoicePersonAddressLine()).isEqualTo("Street 2");
        assertThat(client.getInvoiceCompanyName()).isNull();
        assertThat(client.getInvoiceCompanyVatId()).isNull();
    }

    @Test
    void applyBillRecipientSnapshot_usesCompanySnapshotForCompanyType() {
        Client client = new Client();
        client.setInvoiceRecipientType(InvoiceRecipientType.COMPANY);
        client.setInvoiceCompanyName("Northside d.o.o.");
        client.setInvoiceCompanyAddressLine("Dunajska 1");
        client.setInvoiceCompanyPostalCode("1000");
        client.setInvoiceCompanyCity("Ljubljana");
        client.setInvoiceCompanyVatId("SI12345678");
        Bill bill = new Bill();

        GuestInvoiceSettingsSupport.applyBillRecipientSnapshot(bill, client);

        assertThat(bill.getRecipientTypeSnapshot()).isEqualTo("COMPANY");
        assertThat(bill.getRecipientCompanyNameSnapshot()).isEqualTo("Northside d.o.o.");
        assertThat(bill.getRecipientCompanyVatIdSnapshot()).isEqualTo("SI12345678");
    }

    @Test
    void applyBillRecipientSnapshot_usesPersonAddressForPersonType() {
        Client client = new Client();
        client.setInvoiceRecipientType(InvoiceRecipientType.PERSON);
        client.setInvoicePersonAddressLine("Cesta 5");
        client.setInvoicePersonPostalCode("3000");
        client.setInvoicePersonCity("Celje");
        Bill bill = new Bill();

        GuestInvoiceSettingsSupport.applyBillRecipientSnapshot(bill, client);

        assertThat(bill.getRecipientTypeSnapshot()).isEqualTo("PERSON");
        assertThat(bill.getRecipientCompanyAddressSnapshot()).isEqualTo("Cesta 5");
        assertThat(bill.getRecipientCompanyPostalCodeSnapshot()).isEqualTo("3000");
        assertThat(bill.getRecipientCompanyCitySnapshot()).isEqualTo("Celje");
        assertThat(bill.getRecipientCompanyNameSnapshot()).isNull();
    }
}
