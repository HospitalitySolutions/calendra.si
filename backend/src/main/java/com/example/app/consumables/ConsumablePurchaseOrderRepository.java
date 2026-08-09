package com.example.app.consumables;

import com.example.app.consumables.ConsumableEnums.PurchaseOrderStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsumablePurchaseOrderRepository extends JpaRepository<ConsumablePurchaseOrder, Long> {
    @Query("""
            SELECT po FROM ConsumablePurchaseOrder po
            LEFT JOIN FETCH po.supplier
            JOIN FETCH po.location l
            WHERE po.company.id = :companyId
              AND (:locationId IS NULL OR l.id = :locationId)
            ORDER BY po.orderDate DESC, po.id DESC
            """)
    List<ConsumablePurchaseOrder> findByCompanyId(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId
    );

    @Query("""
            SELECT po FROM ConsumablePurchaseOrder po
            LEFT JOIN FETCH po.supplier
            JOIN FETCH po.location
            WHERE po.id = :id AND po.company.id = :companyId
            """)
    Optional<ConsumablePurchaseOrder> findByIdAndCompanyId(
            @Param("id") Long id,
            @Param("companyId") Long companyId
    );

    long countByCompanyIdAndStatusNot(Long companyId, PurchaseOrderStatus status);
}
