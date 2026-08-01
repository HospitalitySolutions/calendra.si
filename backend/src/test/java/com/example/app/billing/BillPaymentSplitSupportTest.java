package com.example.app.billing;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BillPaymentSplitSupportTest {

    @Test
    void fullBankTransferBillStartsUnpaid() {
        Bill bill = billWithTotal("61.00");
        PaymentMethod bankTransfer = paymentMethod(PaymentType.BANK_TRANSFER, false);
        bill.setPaymentMethod(bankTransfer);

        assertEquals(BillPaymentStatus.OPEN, BillPaymentSplitSupport.resolveInitialPaymentStatus(bill));
    }

    @Test
    void bankTransferRemainderAfterImmediatePaymentIsPartiallyPaid() {
        Bill bill = billWithTotal("100.00");
        PaymentMethod cash = paymentMethod(PaymentType.CASH, false);
        PaymentMethod bankTransfer = paymentMethod(PaymentType.BANK_TRANSFER, false);
        bill.setPaymentMethod(cash);

        bill.getPaymentSplits().add(split(bill, cash, "60.00", 0));
        bill.getPaymentSplits().add(split(bill, bankTransfer, "40.00", 1));

        assertEquals(BillPaymentStatus.PAYMENT_PENDING, BillPaymentSplitSupport.resolveInitialPaymentStatus(bill));
    }

    @Test
    void stripeBillStartsUnpaidAndImmediatePaymentStartsPaid() {
        Bill stripeBill = billWithTotal("50.00");
        stripeBill.setPaymentMethod(paymentMethod(PaymentType.CARD, true));
        assertEquals(BillPaymentStatus.OPEN, BillPaymentSplitSupport.resolveInitialPaymentStatus(stripeBill));

        Bill cashBill = billWithTotal("50.00");
        cashBill.setPaymentMethod(paymentMethod(PaymentType.CASH, false));
        assertEquals(BillPaymentStatus.PAID, BillPaymentSplitSupport.resolveInitialPaymentStatus(cashBill));
    }

    private static Bill billWithTotal(String amount) {
        Bill bill = new Bill();
        bill.setTotalGross(new BigDecimal(amount));
        return bill;
    }

    private static PaymentMethod paymentMethod(PaymentType type, boolean stripeEnabled) {
        PaymentMethod method = new PaymentMethod();
        method.setName(type.name());
        method.setPaymentType(type);
        method.setStripeEnabled(stripeEnabled);
        return method;
    }

    private static BillPayment split(Bill bill, PaymentMethod method, String amount, int sortOrder) {
        BillPayment split = new BillPayment();
        split.setBill(bill);
        split.setPaymentMethod(method);
        split.setAmountGross(new BigDecimal(amount));
        split.setSortOrder(sortOrder);
        return split;
    }
}
