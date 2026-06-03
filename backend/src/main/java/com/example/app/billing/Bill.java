package com.example.app.billing;

import com.example.app.company.Company;
import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Getter
@Setter
@Entity
@Table(
        name = "bills",
        uniqueConstraints = {
                @UniqueConstraint(columnNames = { "company_id", "billNumber" }),
                @UniqueConstraint(columnNames = { "company_id", "order_id" })
        }
)
public class Bill extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String billNumber;

    /** Public order identifier shown to guests and tenant users (tenantCode-clientId-tenantCounter). */
    @Column(name = "order_id", length = 160)
    private String orderId;

    /** Monotonic counter portion of {@link #orderId}, unique inside one tenant. */
    @Column(name = "order_counter")
    private Long orderCounter;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private BillType billType = BillType.INVOICE;
    @ManyToOne
    private Client client;
    @Column(nullable = false)
    private String clientFirstNameSnapshot;
    @Column(nullable = false)
    private String clientLastNameSnapshot;
    private String recipientTypeSnapshot;
    private String recipientPersonEmailSnapshot;
    private Long recipientCompanyIdSnapshot;
    private String recipientCompanyNameSnapshot;
    private String recipientCompanyAddressSnapshot;
    private String recipientCompanyPostalCodeSnapshot;
    private String recipientCompanyCitySnapshot;
    private String recipientCompanyVatIdSnapshot;
    private String recipientCompanyIbanSnapshot;
    private String recipientCompanyEmailSnapshot;
    private String recipientCompanyTelephoneSnapshot;
    private Long sourceSessionIdSnapshot;
    @ManyToOne
    private PaymentMethod paymentMethod;
    @OneToMany(mappedBy = "bill", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC, id ASC")
    private List<BillPayment> paymentSplits = new ArrayList<>();
    @ManyToOne(optional = false)
    private User consultant;
    @Column(nullable = false)
    private LocalDate issueDate;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalNet;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalGross;
    @Column(nullable = false)
    private String paymentStatus = BillPaymentStatus.OPEN;
    private String checkoutSessionId;
    private OffsetDateTime checkoutSessionExpiresAt;
    private String paymentIntentId;
    @Column(name = "stripe_connected_account_id", length = 255)
    private String stripeConnectedAccountId;
    @Column(name = "stripe_connect_mode", length = 32)
    private String stripeConnectMode;
    private String stripeCustomerId;
    private String stripeInvoiceId;
    private String stripeInvoiceNumber;
    private String stripeBankTransferIban;
    private String stripeBankTransferBic;
    private String stripeBankTransferAccountHolderName;
    private String stripeBankTransferAccountHolderAddressLine1;
    private String stripeBankTransferAccountHolderPostalCode;
    private String stripeBankTransferAccountHolderCity;
    private String stripeBankTransferAccountHolderCountry;
    private String stripeBankTransferReference;
    private String bankTransferReference;

    /** Original invoice id when this bill is a refund/negative invoice. */
    @Column(name = "refund_of_bill_id")
    private Long refundOfBillId;

    /** Human-readable refund reference, e.g. "Refund of INV-0007". */
    @Column(name = "refund_reference", length = 255)
    private String refundReference;
    @Column(length = 2048)
    private String stripeHostedInvoiceUrl;
    private OffsetDateTime paidAt;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BillFiscalStatus fiscalStatus = BillFiscalStatus.NOT_SENT;
    private String fiscalZoi;
    private String fiscalEor;
    @Column(columnDefinition = "TEXT")
    private String fiscalQr;
    private java.time.OffsetDateTime fiscalSentAt;
    private String fiscalMessageId;
    private Integer fiscalAttemptCount;
    @Column(columnDefinition = "TEXT")
    private String fiscalLastError;
    @Column(columnDefinition = "TEXT")
    private String fiscalLogJson;
    @Column(columnDefinition = "TEXT")
    private String fiscalRequestBody;
    @Column(columnDefinition = "TEXT")
    private String fiscalResponseBody;

    /** S3 object key when the invoice PDF has been archived ({@code null} until first successful upload). */
    @Column(length = 1024)
    private String invoicePdfObjectKey;

    /** Locale captured when the invoice is created, used for archived/generated PDF labels. */
    @Column(name = "invoice_locale", length = 8)
    private String invoiceLocale;

    @OneToMany(mappedBy = "bill", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<BillItem> items = new ArrayList<>();
}
