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

    List<AdvanceAllocation> findAllByCompanyIdAndOpenBillId(Long companyId, Long openBillId);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM AdvanceAllocation a WHERE a.company.id = :companyId AND a.openBill.id = :openBillId")
    void deleteByCompanyIdAndOpenBillId(@Param("companyId") Long companyId, @Param("openBillId") Long openBillId);

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
