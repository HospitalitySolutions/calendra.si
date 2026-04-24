package com.example.app.billing;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "advance_allocations")
public class AdvanceAllocation extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "advance_bill_id", nullable = false)
    private Bill advanceBill;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "open_bill_id", nullable = false)
    private OpenBill openBill;

    @Column(name = "session_booking_id", nullable = false)
    private Long sessionBookingId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "transaction_service_id", nullable = false)
    private TransactionService transactionService;

    @Column(name = "amount_net", nullable = false, precision = 12, scale = 2)
    private BigDecimal amountNet;
}
