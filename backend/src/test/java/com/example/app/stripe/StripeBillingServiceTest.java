package com.example.app.stripe;

import com.example.app.billing.Bill;
import com.example.app.billing.BillItem;
import com.example.app.billing.BillPaymentStatus;
import com.example.app.billing.BillRepository;
import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentType;
import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StripeBillingServiceTest {
    @Mock
    private BillRepository bills;
    @Mock
    private StripeCheckoutClient client;

    @Test
    void duplicateActiveSessionIsRejected() {
        StripeConfig config = new StripeConfig();
        StripeBillingService service = new StripeBillingService(bills, client, config);
        Bill bill = sampleBill();
        bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);
        bill.setCheckoutSessionId("cs_active");
        bill.setCheckoutSessionExpiresAt(OffsetDateTime.now().plusHours(2));

        Assertions.assertThrows(ResponseStatusException.class, () -> service.createCheckoutSessionForBill(bill));
    }

    @Test
    void expiredPendingSessionCanBeRecreated() {
        StripeConfig config = new StripeConfig();
        StripeBillingService service = new StripeBillingService(bills, client, config);
        Bill bill = sampleBill();
        bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);
        bill.setCheckoutSessionId("cs_old");
        bill.setCheckoutSessionExpiresAt(OffsetDateTime.now().minusHours(1));
        when(client.createOneTimeSession(any(), any(), any(), any(), any()))
                .thenReturn(new StripeCheckoutSessionResult("cs_new", "https://checkout.stripe.com/c/pay", "open", OffsetDateTime.now().plusHours(24)));

        StripeCheckoutSessionResult created = service.createCheckoutSessionForBill(bill);

        Assertions.assertEquals("cs_new", created.id());
        Assertions.assertEquals(BillPaymentStatus.PAYMENT_PENDING, bill.getPaymentStatus());
        Assertions.assertEquals("cs_new", bill.getCheckoutSessionId());
    }

    private Bill sampleBill() {
        Bill bill = new Bill();
        bill.setId(1L);
        bill.setBillNumber("B-1");
        bill.setTotalGross(new BigDecimal("122.00"));
        PaymentMethod paymentMethod = new PaymentMethod();
        paymentMethod.setPaymentType(PaymentType.CARD);
        paymentMethod.setStripeEnabled(true);
        bill.setPaymentMethod(paymentMethod);

        TransactionService tx = new TransactionService();
        tx.setCode("CONSULT-001");
        tx.setDescription("Consultation");
        tx.setTaxRate(TaxRate.VAT_22);
        BillItem item = new BillItem();
        item.setBill(bill);
        item.setTransactionService(tx);
        item.setQuantity(1);
        item.setNetPrice(new BigDecimal("100.00"));
        item.setGrossPrice(new BigDecimal("122.00"));
        bill.setItems(List.of(item));
        return bill;
    }
}
