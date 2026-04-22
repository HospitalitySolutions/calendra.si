package com.example.app.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class PriceMathTest {

    @Test
    void unitGrossFromNet_vat22() {
        BigDecimal net = new BigDecimal("50.00");
        BigDecimal gross = PriceMath.unitGrossFromNet(net, TaxRate.VAT_22);
        assertThat(gross).isEqualByComparingTo("61.00");
    }

    @Test
    void unitGrossFromNet_nullNet_returnsNull() {
        assertThat(PriceMath.unitGrossFromNet(null, TaxRate.VAT_22)).isNull();
    }
}
