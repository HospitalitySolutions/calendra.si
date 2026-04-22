package com.example.app.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Net→gross helpers aligned with {@code BillingController} line-item pricing. */
public final class PriceMath {
    private PriceMath() {}

    /** Per-unit gross from net and tax (2 decimal places, HALF_UP). */
    public static BigDecimal unitGrossFromNet(BigDecimal net, TaxRate taxRate) {
        if (net == null) {
            return null;
        }
        TaxRate tr = taxRate != null ? taxRate : TaxRate.NO_VAT;
        return net.add(net.multiply(tr.multiplier)).setScale(2, RoundingMode.HALF_UP);
    }
}
