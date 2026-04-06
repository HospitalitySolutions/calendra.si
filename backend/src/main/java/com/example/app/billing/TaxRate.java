package com.example.app.billing;

import java.math.BigDecimal;

public enum TaxRate {
    VAT_0(new BigDecimal("0.00"), "0%"),
    VAT_9_5(new BigDecimal("0.095"), "9.5%"),
    VAT_22(new BigDecimal("0.22"), "22%"),
    NO_VAT(new BigDecimal("0.00"), "NO VAT");

    public final BigDecimal multiplier;
    public final String label;

    TaxRate(BigDecimal multiplier, String label) {
        this.multiplier = multiplier;
        this.label = label;
    }
}
