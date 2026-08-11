package com.example.app.consumables;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsumablePurchaseOrderLineRepository extends JpaRepository<ConsumablePurchaseOrderLine, Long> {
    @Query("""
            SELECT line FROM ConsumablePurchaseOrderLine line
            JOIN FETCH line.consumable c
            LEFT JOIN FETCH c.category
            WHERE line.company.id = :companyId AND line.purchaseOrder.id = :purchaseOrderId
            ORDER BY line.id ASC
            """)
    List<ConsumablePurchaseOrderLine> findByCompanyIdAndPurchaseOrderId(
            @Param("companyId") Long companyId,
            @Param("purchaseOrderId") Long purchaseOrderId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT line FROM ConsumablePurchaseOrderLine line
            JOIN FETCH line.consumable
            WHERE line.company.id = :companyId AND line.purchaseOrder.id = :purchaseOrderId
            ORDER BY line.id ASC
            """)
    List<ConsumablePurchaseOrderLine> findForUpdate(
            @Param("companyId") Long companyId,
            @Param("purchaseOrderId") Long purchaseOrderId
    );

    Optional<ConsumablePurchaseOrderLine> findByIdAndCompanyIdAndPurchaseOrderId(
            Long id,
            Long companyId,
            Long purchaseOrderId
    );

    void deleteByCompanyIdAndPurchaseOrderId(Long companyId, Long purchaseOrderId);
}
