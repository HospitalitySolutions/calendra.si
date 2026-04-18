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

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal netPrice;

    @Column(name = "source_session_booking_id")
    private Long sourceSessionBookingId;
}
