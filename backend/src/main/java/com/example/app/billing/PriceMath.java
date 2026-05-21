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

    /**
     * Net per unit derived from a tax-inclusive gross (4 decimal places, HALF_UP).
     * Use when the UI edits gross and the stored link price must round-trip through
     * {@link #unitGrossFromNet}.
     */
    public static BigDecimal netFromGross(BigDecimal gross, TaxRate taxRate) {
        if (gross == null) {
            return null;
        }
        TaxRate tr = taxRate != null ? taxRate : TaxRate.NO_VAT;
        if (tr.multiplier.signum() == 0) {
            return gross.setScale(4, RoundingMode.HALF_UP);
        }
        return gross.divide(BigDecimal.ONE.add(tr.multiplier), 4, RoundingMode.HALF_UP);
    }
}
