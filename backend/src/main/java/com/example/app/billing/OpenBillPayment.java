package com.example.app.billing;

import com.example.app.common.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "open_bill_payments")
public class OpenBillPayment extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "open_bill_id", nullable = false)
    private OpenBill openBill;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payment_method_id", nullable = false)
    private PaymentMethod paymentMethod;

    @Column(name = "amount_gross", nullable = false, precision = 12, scale = 2)
    private BigDecimal amountGross = BigDecimal.ZERO;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    /** Advance/deposit bill reserved for this draft payment split. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_advance_bill_id")
    private Bill sourceAdvanceBill;
}
