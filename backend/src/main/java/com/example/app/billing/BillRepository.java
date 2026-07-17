package com.example.app.billing;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface BillRepository extends JpaRepository<Bill, Long> {
    long countByPaymentStatus(String paymentStatus);
    long countByFiscalStatus(BillFiscalStatus fiscalStatus);

    boolean existsByCompanyIdAndOrderId(Long companyId, String orderId);

    @Query("select coalesce(max(b.orderCounter), 0) from Bill b where b.company.id = :companyId")
    Long findMaxOrderCounterByCompanyId(@Param("companyId") Long companyId);

    @Query("select b.orderId from Bill b where b.company.id = :companyId and b.orderId is not null")
    List<String> findAllOrderIdsByCompanyId(@Param("companyId") Long companyId);

    @Override
    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAll();

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyId(Long companyId);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    @Query("""
            select distinct b from Bill b
            left join b.consultant consultant
            where b.company.id = :companyId
              and b.issueDate >= :issueFrom
              and b.issueDate <= :issueTo
              and (:consultantId is null or consultant.id = :consultantId)
            order by b.issueDate asc, b.id asc
            """)
    List<Bill> findAnalyticsByCompanyIdAndIssueDateRange(
            @Param("companyId") Long companyId,
            @Param("issueFrom") LocalDate issueFrom,
            @Param("issueTo") LocalDate issueTo,
            @Param("consultantId") Long consultantId
    );

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    @Query("""
            select distinct b from Bill b
            where b.company.id = :companyId
              and b.paymentStatus <> :paidStatus
              and (
                    (b.paymentMethod.paymentType = :bankTransferType and not exists (
                        select split.id from BillPayment split where split.bill = b
                    ))
                    or exists (
                        select split.id from BillPayment split
                        where split.bill = b and split.paymentMethod.paymentType = :bankTransferType
                    )
              )
            order by b.id asc
            """)
    List<Bill> findBankTransferReconciliationCandidates(
            @Param("companyId") Long companyId,
            @Param("paidStatus") String paidStatus,
            @Param("bankTransferType") PaymentType bankTransferType
    );

    @Query("""
            select b.id from Bill b
            where b.company.id = :companyId
            order by b.issueDate desc, b.id desc
            """)
    List<Long> findPageIdsByCompanyId(@Param("companyId") Long companyId, Pageable pageable);


    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyIdAndBillTypeOrderByIssueDateDescIdDesc(Long companyId, BillType billType);

    @Query("""
            select b.id from Bill b
            where b.company.id = :companyId
              and b.billType = :billType
            order by b.issueDate desc, b.id desc
            """)
    List<Long> findPageIdsByCompanyIdAndBillType(
            @Param("companyId") Long companyId,
            @Param("billType") BillType billType,
            Pageable pageable
    );

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyIdAndRecipientCompanyIdSnapshotOrderByIssueDateDescIdDesc(Long companyId, Long recipientCompanyIdSnapshot);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyIdAndBillTypeAndRecipientCompanyIdSnapshotInOrderByIssueDateDescIdDesc(
            Long companyId,
            BillType billType,
            Collection<Long> recipientCompanyIdSnapshots);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findByIdAndCompanyIdAndRecipientCompanyIdSnapshotIn(
            Long id,
            Long companyId,
            Collection<Long> recipientCompanyIdSnapshots);


    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyIdAndBillTypeAndBankTransferReferenceOrderByIssueDateDescIdDesc(
            Long companyId,
            BillType billType,
            String bankTransferReference);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findByIdAndCompanyIdAndBankTransferReference(
            Long id,
            Long companyId,
            String bankTransferReference);

    @Query("""
            select case when count(b) > 0 then true else false end
            from Bill b
            where b.company.id = :companyId
              and b.recipientCompanyIdSnapshot = :recipientCompanyId
              and b.bankTransferReference like concat(:referencePrefix, '%')
              and b.bankTransferReference <> :currentReference
            """)
    boolean existsSubscriptionBillForDifferentTenant(
            @Param("companyId") Long companyId,
            @Param("recipientCompanyId") Long recipientCompanyId,
            @Param("referencePrefix") String referencePrefix,
            @Param("currentReference") String currentReference);


    @Modifying(flushAutomatically = true)
    @Query("""
            update Bill b
            set b.recipientCompanyIdSnapshot = :newRecipientCompanyId
            where b.company.id = :companyId
              and b.recipientCompanyIdSnapshot = :oldRecipientCompanyId
              and b.bankTransferReference = :subscriptionReference
            """)
    int reassignSubscriptionRecipientCompany(
            @Param("companyId") Long companyId,
            @Param("subscriptionReference") String subscriptionReference,
            @Param("oldRecipientCompanyId") Long oldRecipientCompanyId,
            @Param("newRecipientCompanyId") Long newRecipientCompanyId);

    @Override
    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findById(Long id);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findByIdAndCompanyId(Long id, Long companyId);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findByCheckoutSessionId(String checkoutSessionId);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findByStripeInvoiceId(String stripeInvoiceId);
    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findFirstByCompanyIdAndSourceSessionIdSnapshotOrderByIdDesc(Long companyId, Long sourceSessionIdSnapshot);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findFirstByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdDesc(Long companyId, Long sourceSessionIdSnapshot, BillType billType);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdAsc(Long companyId, Long sourceSessionIdSnapshot, BillType billType);

    @Query("SELECT DISTINCT b FROM Bill b LEFT JOIN FETCH b.client LEFT JOIN FETCH b.consultant LEFT JOIN FETCH b.paymentMethod " +
            "LEFT JOIN FETCH b.items i LEFT JOIN FETCH i.transactionService " +
            "WHERE b.company.id = :companyId AND (b.sourceSessionIdSnapshot IN :sessionIds OR i.sourceSessionBookingId IN :sessionIds)")
    List<Bill> findAllLinkedToSessionIds(@Param("companyId") Long companyId, @Param("sessionIds") Collection<Long> sessionIds);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyIdAndIdIn(Long companyId, Collection<Long> ids);

    @Query(
            "select distinct b.company.id from Bill b where "
                    + "(b.stripeCustomerId is not null and lower(b.stripeCustomerId) like lower(concat('%', :needle, '%'))) or "
                    + "(b.stripeInvoiceId is not null and lower(b.stripeInvoiceId) like lower(concat('%', :needle, '%'))) or "
                    + "(b.checkoutSessionId is not null and lower(b.checkoutSessionId) like lower(concat('%', :needle, '%'))) or "
                    + "(b.paymentIntentId is not null and lower(b.paymentIntentId) like lower(concat('%', :needle, '%')))")
    List<Long> findDistinctCompanyIdsByStripeFieldsContainingIgnoreCase(@Param("needle") String needle);

    List<Bill> findTop8ByCompany_IdOrderByIdDesc(Long companyId);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findFirstByCompanyIdAndRefundOfBillId(Long companyId, Long refundOfBillId);
}
