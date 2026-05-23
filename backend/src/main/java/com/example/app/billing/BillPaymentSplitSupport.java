package com.example.app.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class BillPaymentSplitSupport {
    private BillPaymentSplitSupport() {
    }

    public static BigDecimal resolveBankTransferDueGross(Bill bill) {
        if (bill == null) return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal splitTotal = sumBankTransferSplitGross(bill);
        if (splitTotal.compareTo(BigDecimal.ZERO) > 0) {
            return splitTotal;
        }
        if ((bill.getPaymentSplits() == null || bill.getPaymentSplits().isEmpty())
                && bill.getPaymentMethod() != null
                && bill.getPaymentMethod().getPaymentType() == PaymentType.BANK_TRANSFER) {
            return money(bill.getTotalGross());
        }
        return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }

    public static BigDecimal sumBankTransferSplitGross(Bill bill) {
        if (bill == null || bill.getPaymentSplits() == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal total = BigDecimal.ZERO;
        for (BillPayment split : bill.getPaymentSplits()) {
            if (split == null || split.getPaymentMethod() == null) continue;
            if (split.getPaymentMethod().getPaymentType() != PaymentType.BANK_TRANSFER) continue;
            total = total.add(money(split.getAmountGross()));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    public static BigDecimal resolvePendingPaymentGross(Bill bill) {
        BigDecimal bankTransferDue = resolveBankTransferDueGross(bill);
        if (bankTransferDue.compareTo(BigDecimal.ZERO) > 0) {
            return bankTransferDue;
        }
        return money(bill == null ? null : bill.getTotalGross());
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }
}
