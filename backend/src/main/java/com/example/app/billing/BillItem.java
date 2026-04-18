package com.example.app.billing;

import com.example.app.common.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Getter
@Setter
@JsonIgnoreProperties({"passwordHash", "preferredSlots", "assignedTo", "spaces", "types", "consultant", "client", "bill", "items"})
@Entity
public class BillItem extends BaseEntity {
    @ManyToOne(optional = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private Bill bill;
    @ManyToOne(optional = false)
    private TransactionService transactionService;
    @Column(nullable = false)
    private Integer quantity;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal netPrice;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal grossPrice;
}
