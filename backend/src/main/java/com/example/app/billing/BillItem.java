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

    /** Optional product/name snapshot shown on invoice PDFs instead of the transaction service description. */
    @Column(name = "invoice_line_description", length = 512)
    private String invoiceLineDescription;

    /** When set, this folio line is allocated to a booked session row (participant). */
    @Column(name = "source_session_booking_id")
    private Long sourceSessionBookingId;

    /** When set, this folio line consumes part of an advance bill (same id as {@link Bill#getId()} of the ADVANCE bill). */
    @Column(name = "source_advance_bill_id")
    private Long sourceAdvanceBillId;
}
