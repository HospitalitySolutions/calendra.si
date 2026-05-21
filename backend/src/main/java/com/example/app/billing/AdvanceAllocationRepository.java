package com.example.app.billing;

import java.math.BigDecimal;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdvanceAllocationRepository extends JpaRepository<AdvanceAllocation, Long> {
    @Query("SELECT COALESCE(SUM(a.amountNet), 0) FROM AdvanceAllocation a WHERE a.company.id = :companyId AND a.advanceBill.id = :advanceBillId")
    BigDecimal sumAmountNetByCompanyIdAndAdvanceBillId(Long companyId, Long advanceBillId);

    /**
     * Negative net folio lines tagged with {@link BillItem#getSourceAdvanceBillId()} (advance consumption moved from open bill).
     */
    @Query("""
            SELECT COALESCE(SUM(-(bi.netPrice * bi.quantity)), 0)
            FROM BillItem bi
            WHERE bi.bill.company.id = :companyId
            AND bi.sourceAdvanceBillId = :advanceBillId
            AND bi.netPrice < 0
            """)
    BigDecimal sumConsumedFromFolioByAdvanceBillId(@Param("companyId") Long companyId, @Param("advanceBillId") Long advanceBillId);


    /** Advance/deposit consumption stored directly as payment methods on finalized folios. */
    @Query(
            value = """
                    SELECT COALESCE(SUM(
                        CASE
                            WHEN adv.total_gross IS NOT NULL AND adv.total_gross <> 0
                            THEN (bp.amount_gross * adv.total_net / adv.total_gross)
                            ELSE 0
                        END
                    ), 0)
                    FROM bill_payments bp
                    JOIN bills bill ON bill.id = bp.bill_id
                    JOIN bills adv ON adv.id = bp.source_advance_bill_id
                    WHERE bill.company_id = :companyId
                    AND adv.id = :advanceBillId
                    """,
            nativeQuery = true
    )
    BigDecimal sumConsumedFromBillPaymentsByAdvanceBillId(@Param("companyId") Long companyId, @Param("advanceBillId") Long advanceBillId);


    /** Gross advance/deposit amount reserved on open bills. Used for display so a gross 44.00 selection stays 44.00. */
    @Query(
            value = """
                    SELECT COALESCE(SUM(obp.amount_gross), 0)
                    FROM open_bill_payments obp
                    JOIN open_bills open_bill ON open_bill.id = obp.open_bill_id
                    WHERE open_bill.company_id = :companyId
                    AND obp.source_advance_bill_id = :advanceBillId
                    """,
            nativeQuery = true
    )
    BigDecimal sumConsumedGrossFromOpenBillPaymentsByAdvanceBillId(@Param("companyId") Long companyId, @Param("advanceBillId") Long advanceBillId);

    /** Gross advance/deposit amount consumed on finalized folios. Used for display so gross selections do not drift by tax rounding. */
    @Query(
            value = """
                    SELECT COALESCE(SUM(bp.amount_gross), 0)
                    FROM bill_payments bp
                    JOIN bills bill ON bill.id = bp.bill_id
                    WHERE bill.company_id = :companyId
                    AND bp.source_advance_bill_id = :advanceBillId
                    """,
            nativeQuery = true
    )
    BigDecimal sumConsumedGrossFromBillPaymentsByAdvanceBillId(@Param("companyId") Long companyId, @Param("advanceBillId") Long advanceBillId);

    /** Advance/deposit consumption reserved on open bills before the folio is finalized. */
    @Query(
            value = """
                    SELECT COALESCE(SUM(
                        CASE
                            WHEN adv.total_gross IS NOT NULL AND adv.total_gross <> 0
                            THEN (obp.amount_gross * adv.total_net / adv.total_gross)
                            ELSE 0
                        END
                    ), 0)
                    FROM open_bill_payments obp
                    JOIN open_bills open_bill ON open_bill.id = obp.open_bill_id
                    JOIN bills adv ON adv.id = obp.source_advance_bill_id
                    WHERE open_bill.company_id = :companyId
                    AND adv.id = :advanceBillId
                    """,
            nativeQuery = true
    )
    BigDecimal sumConsumedFromOpenBillPaymentsByAdvanceBillId(@Param("companyId") Long companyId, @Param("advanceBillId") Long advanceBillId);

    List<AdvanceAllocation> findAllByCompanyIdAndOpenBillId(Long companyId, Long openBillId);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM AdvanceAllocation a WHERE a.company.id = :companyId AND a.openBill.id = :openBillId")
    void deleteByCompanyIdAndOpenBillId(@Param("companyId") Long companyId, @Param("openBillId") Long openBillId);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM AdvanceAllocation a WHERE a.company.id = :companyId AND a.openBill.id = :openBillId AND a.sessionBookingId = :sessionBookingId")
    void deleteByCompanyIdAndOpenBillIdAndSessionBookingId(
            @Param("companyId") Long companyId,
            @Param("openBillId") Long openBillId,
            @Param("sessionBookingId") Long sessionBookingId
    );

    @Modifying(clearAutomatically = true)
    @Query(
            value = "UPDATE advance_allocations SET open_bill_id = :newOpenBillId "
                    + "WHERE company_id = :companyId AND open_bill_id = :oldOpenBillId AND session_booking_id = :sessionId",
            nativeQuery = true
    )
    void reassignOpenBillForSession(
            @Param("companyId") Long companyId,
            @Param("oldOpenBillId") Long oldOpenBillId,
            @Param("newOpenBillId") Long newOpenBillId,
            @Param("sessionId") Long sessionId
    );
}
