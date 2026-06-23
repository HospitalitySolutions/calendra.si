package com.example.app.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.example.app.company.ClientCompany;
import org.junit.jupiter.api.Test;

class ClientAnonymizationTest {

    @Test
    void anonymizeClearsBillingRecipientDataStoredOnClientProfile() {
        Client client = new Client();
        client.setId(42L);
        client.setFirstName("Ana");
        client.setLastName("Novak");
        client.setEmail("ana@example.com");
        client.setPhone("031123456");
        client.setWhatsappPhone("031123456");
        client.setWhatsappOptIn(true);
        client.setViberUserId("viber-user");
        client.setViberConnected(true);
        client.setBatchPaymentEnabled(true);
        client.setBillingCompany(new ClientCompany());
        client.setInvoiceRecipientType(InvoiceRecipientType.COMPANY);
        client.setInvoicePersonAddressLine("Osebna ulica 1");
        client.setInvoicePersonPostalCode("1000");
        client.setInvoicePersonCity("Ljubljana");
        client.setInvoiceCompanyName("Test d.o.o.");
        client.setInvoiceCompanyAddressLine("Poslovna cesta 2");
        client.setInvoiceCompanyPostalCode("2000");
        client.setInvoiceCompanyCity("Maribor");
        client.setInvoiceCompanyVatId("SI12345678");

        client.anonymize(7L);

        assertEquals("Anonymized", client.getFirstName());
        assertEquals("Client 42", client.getLastName());
        assertNull(client.getEmail());
        assertNull(client.getPhone());
        assertNull(client.getWhatsappPhone());
        assertFalse(client.isWhatsappOptIn());
        assertNull(client.getViberUserId());
        assertFalse(client.isViberConnected());
        assertNull(client.getBillingCompany());
        assertEquals(InvoiceRecipientType.PERSON, client.getInvoiceRecipientType());
        assertNull(client.getInvoicePersonAddressLine());
        assertNull(client.getInvoicePersonPostalCode());
        assertNull(client.getInvoicePersonCity());
        assertNull(client.getInvoiceCompanyName());
        assertNull(client.getInvoiceCompanyAddressLine());
        assertNull(client.getInvoiceCompanyPostalCode());
        assertNull(client.getInvoiceCompanyCity());
        assertNull(client.getInvoiceCompanyVatId());
        assertFalse(client.isBatchPaymentEnabled());
        assertTrue(client.isAnonymized());
        assertNotNull(client.getAnonymizedAt());
        assertEquals(7L, client.getAnonymizedByUserId());
    }
}
