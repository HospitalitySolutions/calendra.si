package com.example.app.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

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

    Optional<OpenBill> findBySessionBookingIdAndCompanyId(Long sessionBookingId, Long companyId);

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

    @Query("SELECT COALESCE(MAX(o.manualSessionNumberMax), 0) FROM OpenBill o WHERE o.company.id = :companyId")
    Long findMaxManualSessionNumberByCompanyId(Long companyId);
}
