package com.example.app.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;

public interface OpenBillRepository extends JpaRepository<OpenBill, Long> {

    boolean existsBySessionBookingId(Long sessionBookingId);
    boolean existsBySessionBookingIdAndCompanyId(Long sessionBookingId, Long companyId);

    @Query("SELECT DISTINCT o FROM OpenBill o LEFT JOIN FETCH o.items i LEFT JOIN FETCH i.transactionService " +
           "LEFT JOIN FETCH o.client LEFT JOIN FETCH o.consultant LEFT JOIN FETCH o.paymentMethod LEFT JOIN FETCH o.sessionBooking")
    List<OpenBill> findAllWithItems();

    @Query("SELECT DISTINCT o FROM OpenBill o LEFT JOIN FETCH o.items i LEFT JOIN FETCH i.transactionService " +
            "LEFT JOIN FETCH o.client LEFT JOIN FETCH o.consultant LEFT JOIN FETCH o.paymentMethod LEFT JOIN FETCH o.sessionBooking " +
            "WHERE o.company.id = :companyId")
    List<OpenBill> findAllWithItemsByCompanyId(Long companyId);

    @Query("SELECT DISTINCT o FROM OpenBill o LEFT JOIN FETCH o.items i LEFT JOIN FETCH i.transactionService " +
            "LEFT JOIN FETCH o.client LEFT JOIN FETCH o.consultant LEFT JOIN FETCH o.paymentMethod LEFT JOIN FETCH o.sessionBooking " +
            "WHERE o.company.id = :companyId AND (o.sessionBooking.id IN :sessionIds " +
            "OR i.sourceSessionBookingId IN :sessionIds)")
    List<OpenBill> findAllContainingSessionIds(
            @Param("companyId") Long companyId,
            @Param("sessionIds") java.util.Collection<Long> sessionIds
    );

    Optional<OpenBill> findBySessionBookingIdAndCompanyId(Long sessionBookingId, Long companyId);

    Optional<OpenBill> findFirstByCompanyIdAndReferenceOrderByIdAsc(Long companyId, String reference);

    List<OpenBill> findAllByCompanyIdAndReferenceStartingWith(Long companyId, String referencePrefix);

    @Query("SELECT DISTINCT o.id FROM OpenBill o LEFT JOIN o.items i " +
            "WHERE o.company.id = :companyId " +
            "AND o.batchScope = 'NONE' " +
            "AND i.id IS NOT NULL " +
            "ORDER BY o.id ASC")
    List<Long> findBatchMergeCandidateIds(Long companyId);

    @Query("SELECT DISTINCT o FROM OpenBill o LEFT JOIN FETCH o.items i LEFT JOIN FETCH i.transactionService " +
            "LEFT JOIN FETCH o.client c LEFT JOIN FETCH c.billingCompany LEFT JOIN FETCH o.consultant " +
            "LEFT JOIN FETCH o.paymentMethod LEFT JOIN FETCH o.sessionBooking " +
            "WHERE o.id = :id AND o.company.id = :companyId")
    Optional<OpenBill> findByIdWithItemsForBatchSync(Long id, Long companyId);

    @Query("SELECT CASE WHEN COUNT(i) > 0 THEN true ELSE false END FROM OpenBillItem i " +
            "WHERE i.openBill.company.id = :companyId AND i.sourceSessionBookingId = :sessionBookingId")
    boolean existsItemBySourceSessionBookingIdAndCompanyId(Long sessionBookingId, Long companyId);

    @Query("SELECT DISTINCT o FROM OpenBill o LEFT JOIN FETCH o.items i LEFT JOIN FETCH i.transactionService " +
            "LEFT JOIN FETCH o.client LEFT JOIN FETCH o.consultant LEFT JOIN FETCH o.paymentMethod LEFT JOIN FETCH o.sessionBooking " +
            "WHERE o.company.id = :companyId AND (o.sessionBooking.id = :sessionBookingId OR EXISTS (" +
            "SELECT 1 FROM OpenBillItem oi WHERE oi.openBill = o AND oi.sourceSessionBookingId = :sessionBookingId))")
    Optional<OpenBill> findContainingSession(Long companyId, Long sessionBookingId);

    @Query("SELECT DISTINCT o FROM OpenBill o LEFT JOIN FETCH o.items i LEFT JOIN FETCH i.transactionService " +
            "LEFT JOIN FETCH o.client LEFT JOIN FETCH o.consultant LEFT JOIN FETCH o.paymentMethod LEFT JOIN FETCH o.sessionBooking " +
            "WHERE o.company.id = :companyId AND o.batchScope = :batchScope AND o.batchTargetClientId = :clientId")
    Optional<OpenBill> findBatchByClientTarget(Long companyId, String batchScope, Long clientId);

    @Query("SELECT DISTINCT o FROM OpenBill o LEFT JOIN FETCH o.items i LEFT JOIN FETCH i.transactionService " +
            "LEFT JOIN FETCH o.client LEFT JOIN FETCH o.consultant LEFT JOIN FETCH o.paymentMethod LEFT JOIN FETCH o.sessionBooking " +
            "WHERE o.company.id = :companyId AND o.batchScope = :batchScope AND o.batchTargetCompanyId = :recipientCompanyId")
    Optional<OpenBill> findBatchByCompanyTarget(Long companyId, String batchScope, Long recipientCompanyId);


    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(value = """
            UPDATE open_bill_items
            SET open_bill_id = :targetOpenBillId,
                source_session_booking_id = COALESCE(source_session_booking_id, :fallbackSessionId)
            WHERE open_bill_id = :sourceOpenBillId
              AND EXISTS (SELECT 1 FROM open_bills source_bill WHERE source_bill.id = :sourceOpenBillId AND source_bill.company_id = :companyId)
              AND EXISTS (SELECT 1 FROM open_bills target_bill WHERE target_bill.id = :targetOpenBillId AND target_bill.company_id = :companyId)
            """, nativeQuery = true)
    int moveItemsToOpenBill(
            @Param("sourceOpenBillId") Long sourceOpenBillId,
            @Param("targetOpenBillId") Long targetOpenBillId,
            @Param("fallbackSessionId") Long fallbackSessionId,
            @Param("companyId") Long companyId
    );


    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query("DELETE FROM OpenBillItem i WHERE i.openBill.id = :openBillId AND i.openBill.company.id = :companyId")
    int deleteItemsByOpenBillIdAndCompanyId(@Param("openBillId") Long openBillId, @Param("companyId") Long companyId);


    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(value = """
            DELETE FROM open_bill_payments
            WHERE open_bill_id = :openBillId
              AND EXISTS (SELECT 1 FROM open_bills WHERE id = :openBillId AND company_id = :companyId)
            """, nativeQuery = true)
    int deletePaymentSplitsByOpenBillIdAndCompanyId(@Param("openBillId") Long openBillId, @Param("companyId") Long companyId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query("DELETE FROM OpenBill o WHERE o.id = :openBillId AND o.company.id = :companyId")
    int deleteByIdAndCompanyId(@Param("openBillId") Long openBillId, @Param("companyId") Long companyId);

    @Query("SELECT COALESCE(MAX(o.manualSessionNumberMax), 0) FROM OpenBill o WHERE o.company.id = :companyId")
    Long findMaxManualSessionNumberByCompanyId(Long companyId);

    @Query("SELECT COALESCE(MAX(o.proformaSequenceNumber), 0) FROM OpenBill o WHERE o.company.id = :companyId")
    Long findMaxProformaSequenceNumberByCompanyId(@Param("companyId") Long companyId);
}
