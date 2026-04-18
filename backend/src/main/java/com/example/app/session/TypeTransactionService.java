package com.example.app.session;

import com.example.app.billing.TransactionService;
import com.example.app.common.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

/**
 * Links a SessionType to a TransactionService with an optional price override.
 * If price is null, the TransactionService's default netPrice is used.
 */
@Getter
@Setter
@Entity
@Table(name = "type_transaction_services", uniqueConstraints = @UniqueConstraint(columnNames = { "session_type_id", "transaction_service_id" }))
public class TypeTransactionService extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_type_id", nullable = false)
    private SessionType sessionType;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "transaction_service_id", nullable = false)
    private TransactionService transactionService;

    /** Net price for this type; if null, use TransactionService.netPrice */
    @Column(precision = 12, scale = 2)
    private BigDecimal price;
}
