package com.example.app.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class BillingControllerFiscalizationDecisionTest {

    @Test
    void fiscalizesWhenAnyNonZeroPaymentSplitUsesFiscalizedMethod() {
        Bill bill = new Bill();
        bill.setPaymentMethod(method(false));
        bill.getPaymentSplits().add(split(bill, method(false), "40.00"));
        bill.getPaymentSplits().add(split(bill, method(true), "60.00"));

        assertThat(BillingController.hasFiscalizedPaymentMethod(bill)).isTrue();
    }

    @Test
    void ignoresZeroValueFiscalizedPaymentSplit() {
        Bill bill = new Bill();
        bill.setPaymentMethod(method(true));
        bill.getPaymentSplits().add(split(bill, method(true), "0.00"));
        bill.getPaymentSplits().add(split(bill, method(false), "100.00"));

        assertThat(BillingController.hasFiscalizedPaymentMethod(bill)).isFalse();
    }

    @Test
    void fallsBackToLegacySinglePaymentMethodWhenThereAreNoSplits() {
        Bill bill = new Bill();
        bill.setPaymentMethod(method(true));

        assertThat(BillingController.hasFiscalizedPaymentMethod(bill)).isTrue();
    }

    private static PaymentMethod method(boolean fiscalized) {
        PaymentMethod method = new PaymentMethod();
        method.setFiscalized(fiscalized);
        return method;
    }

    private static BillPayment split(Bill bill, PaymentMethod method, String amount) {
        BillPayment split = new BillPayment();
        split.setBill(bill);
        split.setPaymentMethod(method);
        split.setAmountGross(new BigDecimal(amount));
        return split;
    }
}
