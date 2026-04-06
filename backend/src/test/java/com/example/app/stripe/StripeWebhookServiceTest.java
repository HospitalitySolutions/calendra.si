package com.example.app.stripe;

import com.example.app.billing.Bill;
import com.example.app.billing.BillPaymentStatus;
import com.example.app.billing.BillPdfService;
import com.example.app.billing.BillRepository;
import com.example.app.billing.BillingEmailService;
import com.example.app.billing.InvoicePdfS3Service;
import com.example.app.company.Company;
import com.example.app.fiscal.FiscalizationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StripeWebhookServiceTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private StripeWebhookEventRepository events;
    @Mock
    private BillRepository bills;
    @Mock
    private FiscalizationService fiscalizationService;
    @Mock
    private BillPdfService billPdfService;
    @Mock
    private BillingEmailService billingEmailService;
    @Mock
    private InvoicePdfS3Service invoicePdfS3Service;

    private StripeWebhookService service;
    private String secret = "whsec_test_123";

    @BeforeEach
    void setUp() {
        StripeConfig config = new StripeConfig();
        ReflectionTestUtils.setField(config, "webhookSecret", secret);
        StripeWebhookVerifier verifier = new StripeWebhookVerifier();
        service = new StripeWebhookService(
                config,
                verifier,
                events,
                bills,
                fiscalizationService,
                billPdfService,
                billingEmailService,
                invoicePdfS3Service
        );
    }

    @Test
    void completedEventMarksBillPaidOnce() throws Exception {
        String payload = eventJson("evt_1", "checkout.session.completed", Map.of(
                "id", "cs_1",
                "payment_intent", "pi_1",
                "metadata", Map.of("bill_id", "100", "client_id", "10", "session_id", "500")
        ));
        Bill bill = bill(100L, BillPaymentStatus.PAYMENT_PENDING, "cs_1");
        when(events.existsByEventId("evt_1")).thenReturn(false);
        when(bills.findById(100L)).thenReturn(Optional.of(bill));
        when(fiscalizationService.fiscalizeBill(any(Bill.class), eq(1L))).thenAnswer(a -> a.getArgument(0));
        when(billPdfService.generatePdf(any(Bill.class), eq(1L))).thenReturn(new byte[] {1, 2, 3});

        service.handleWebhook(payload, signature(payload));

        Assertions.assertEquals(BillPaymentStatus.PAID, bill.getPaymentStatus());
        Assertions.assertEquals("pi_1", bill.getPaymentIntentId());
        Assertions.assertNotNull(bill.getPaidAt());
        verify(billingEmailService, times(1)).sendPaidBillReceipt(eq(bill), any(byte[].class));
        verify(invoicePdfS3Service, times(1)).uploadAndPersistKey(eq(bill), any(byte[].class));
    }

    @Test
    void duplicateEventIsIgnored() throws Exception {
        String payload = eventJson("evt_dup", "checkout.session.completed", Map.of(
                "id", "cs_1",
                "payment_intent", "pi_1",
                "metadata", Map.of("bill_id", "100")
        ));
        when(events.existsByEventId("evt_dup")).thenReturn(true);

        service.handleWebhook(payload, signature(payload));

        verifyNoInteractions(bills);
        verify(events, never()).save(any());
    }

    @Test
    void asyncPaymentFailedMarksBillCancelled() throws Exception {
        String payload = eventJson("evt_fail", "checkout.session.async_payment_failed", Map.of(
                "id", "cs_2",
                "metadata", Map.of("bill_id", "200")
        ));
        Bill bill = bill(200L, BillPaymentStatus.PAYMENT_PENDING, "cs_2");
        when(events.existsByEventId("evt_fail")).thenReturn(false);
        when(bills.findById(200L)).thenReturn(Optional.of(bill));

        service.handleWebhook(payload, signature(payload));

        Assertions.assertEquals(BillPaymentStatus.CANCELLED, bill.getPaymentStatus());
    }

    @Test
    void expiredSessionMarksBillCancelled() throws Exception {
        String payload = eventJson("evt_exp", "checkout.session.expired", Map.of(
                "id", "cs_3",
                "metadata", Map.of("bill_id", "300")
        ));
        Bill bill = bill(300L, BillPaymentStatus.PAYMENT_PENDING, "cs_3");
        when(events.existsByEventId("evt_exp")).thenReturn(false);
        when(bills.findById(300L)).thenReturn(Optional.of(bill));

        service.handleWebhook(payload, signature(payload));

        Assertions.assertEquals(BillPaymentStatus.CANCELLED, bill.getPaymentStatus());
    }

    private Bill bill(Long id, String status, String checkoutSessionId) {
        Bill bill = new Bill();
        bill.setId(id);
        bill.setPaymentStatus(status);
        bill.setCheckoutSessionId(checkoutSessionId);
        Company company = new Company();
        company.setId(1L);
        bill.setCompany(company);
        return bill;
    }

    private String eventJson(String eventId, String type, Map<String, Object> object) throws Exception {
        return JSON.writeValueAsString(Map.of(
                "id", eventId,
                "type", type,
                "data", Map.of("object", object)
        ));
    }

    private String signature(String payload) throws Exception {
        long ts = System.currentTimeMillis() / 1000L;
        String signedPayload = ts + "." + payload;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] digest = mac.doFinal(signedPayload.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte b : digest) hex.append(String.format("%02x", b));
        return "t=" + ts + ",v1=" + hex;
    }
}
