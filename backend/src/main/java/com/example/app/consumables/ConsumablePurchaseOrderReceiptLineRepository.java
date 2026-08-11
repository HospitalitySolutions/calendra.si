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
}
