package com.example.app.billing;

import com.example.app.company.Company;
import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.session.SessionBooking;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

/**
 * Draft bill created from past booked sessions with types.
 * Items are editable until converted to a real Bill.
 */
@Getter
@Setter
@Entity
@Table(name = "open_bills")
public class OpenBill extends BaseEntity {
    public static final String BATCH_SCOPE_NONE = "NONE";
    public static final String BATCH_SCOPE_CLIENT = "CLIENT";
    public static final String BATCH_SCOPE_COMPANY = "COMPANY";

    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false)
    private Client client;

    @ManyToOne(optional = false)
    private User consultant;

    @ManyToOne
    private PaymentMethod paymentMethod;

    @OneToMany(mappedBy = "openBill", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC, id ASC")
    private List<OpenBillPayment> paymentSplits = new ArrayList<>();

    @Column(length = 255)
    private String reference;

    @OneToOne
    @JoinColumn(name = "session_booking_id", unique = true)
    private SessionBooking sessionBooking;

    @OneToMany(mappedBy = "openBill", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OpenBillItem> items = new ArrayList<>();

    @Column(name = "batch_scope", nullable = false, length = 16)
    private String batchScope = BATCH_SCOPE_NONE;

    @Column(name = "batch_target_client_id")
    private Long batchTargetClientId;

    @Column(name = "batch_target_company_id")
    private Long batchTargetCompanyId;

    @Column(name = "manual_split_locked", nullable = false)
    private boolean manualSplitLocked = false;

    @Column(name = "manual_session_numbers_csv")
    private String manualSessionNumbersCsv;

    @Column(name = "manual_session_number_max")
    private Long manualSessionNumberMax;

    @Enumerated(EnumType.STRING)
    @Column(name = "bill_type", length = 16)
    private BillType billType;

    @Column(name = "booking_group_key", length = 64)
    private String bookingGroupKey;

    @Column(name = "discount_type", length = 16)
    private String discountType;

    @Column(name = "discount_value", precision = 19, scale = 4)
    private BigDecimal discountValue;

    /** For fixed-amount discounts, the 0-based bill-item row that receives the discount. */
    @Column(name = "discount_item_index")
    private Integer discountItemIndex;

    /** Guest wallet order created from Client > Wallet > Kupi ugodnost. */
    @Column(name = "source_guest_order_id")
    private Long sourceGuestOrderId;

    public Long getSourceGuestOrderId() {
        return sourceGuestOrderId;
    }

    public void setSourceGuestOrderId(Long sourceGuestOrderId) {
        this.sourceGuestOrderId = sourceGuestOrderId;
    }
}
