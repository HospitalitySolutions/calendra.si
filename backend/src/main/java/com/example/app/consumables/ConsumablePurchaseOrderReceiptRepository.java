package com.example.app.consumables;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsumablePurchaseOrderReceiptRepository extends JpaRepository<ConsumablePurchaseOrderReceipt, Long> {
    Optional<ConsumablePurchaseOrderReceipt> findByCompanyIdAndPurchaseOrderIdAndIdempotencyKey(
            Long companyId,
            Long purchaseOrderId,
            String idempotencyKey
    );

    @Query("""
            SELECT r FROM ConsumablePurchaseOrderReceipt r
            LEFT JOIN FETCH r.createdBy
            WHERE r.company.id = :companyId AND r.purchaseOrder.id = :purchaseOrderId
            ORDER BY r.receivedAt DESC, r.id DESC
            """)
    List<ConsumablePurchaseOrderReceipt> findByCompanyAndPurchaseOrder(
            @Param("companyId") Long companyId,
            @Param("purchaseOrderId") Long purchaseOrderId
    );
}
