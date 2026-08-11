package com.example.app.consumables;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsumablePurchaseOrderReceiptLineRepository extends JpaRepository<ConsumablePurchaseOrderReceiptLine, Long> {
    @Query("""
            SELECT rl FROM ConsumablePurchaseOrderReceiptLine rl
            JOIN FETCH rl.purchaseOrderLine line
            JOIN FETCH line.consumable
            WHERE rl.company.id = :companyId AND rl.receipt.id = :receiptId
            ORDER BY rl.id ASC
            """)
    List<ConsumablePurchaseOrderReceiptLine> findByCompanyAndReceipt(
            @Param("companyId") Long companyId,
            @Param("receiptId") Long receiptId
    );

    @org.springframework.data.jpa.repository.Query("""
            SELECT rl FROM ConsumablePurchaseOrderReceiptLine rl
            JOIN FETCH rl.receipt r
            JOIN FETCH r.purchaseOrder po
            LEFT JOIN FETCH po.supplier
            JOIN FETCH po.location
            JOIN FETCH rl.purchaseOrderLine pol
            JOIN FETCH pol.consumable c
            LEFT JOIN FETCH c.category
            WHERE rl.company.id = :companyId
            ORDER BY r.receivedAt DESC, rl.id DESC
            """)
    java.util.List<ConsumablePurchaseOrderReceiptLine> findAllForReport(
            @org.springframework.data.repository.query.Param("companyId") Long companyId
    );
}

