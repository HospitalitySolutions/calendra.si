package com.example.app.billing;

import com.example.app.common.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "open_bill_items")
public class OpenBillItem extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "open_bill_id", nullable = false)
    private OpenBill openBill;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "transaction_service_id", nullable = false)
    private TransactionService transactionService;

    @Column(nullable = false)
    private Integer quantity = 1;

    @Column(nullable = false, precision = 12, scale = 4)
    private BigDecimal netPrice;

    /** Gross unit price entered/displayed in Billing. Net is derived from this and the tax rate. */
    @Column(name = "unit_gross_price", precision = 12, scale = 2)
    private BigDecimal unitGrossPrice;

    /** Optional product/name snapshot copied to the final invoice line description. */
    @Column(name = "invoice_line_description", length = 512)
    private String invoiceLineDescription;

    @Column(name = "source_session_booking_id")
    private Long sourceSessionBookingId;

    @Column(name = "source_advance_bill_id")
    private Long sourceAdvanceBillId;
}
