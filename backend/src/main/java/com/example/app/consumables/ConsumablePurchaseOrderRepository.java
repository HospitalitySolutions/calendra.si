package com.example.app.consumables;

import com.example.app.consumables.ConsumableEnums.PurchaseOrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface ConsumablePurchaseOrderRepository extends JpaRepository<ConsumablePurchaseOrder, Long> {
    @Query("SELECT po FROM ConsumablePurchaseOrder po LEFT JOIN FETCH po.supplier WHERE po.company.id = :companyId ORDER BY po.orderDate DESC, po.id DESC")
    List<ConsumablePurchaseOrder> findByCompanyId(@Param("companyId") Long companyId);

    Optional<ConsumablePurchaseOrder> findByIdAndCompanyId(Long id, Long companyId);

    long countByCompanyIdAndStatusNot(Long companyId, PurchaseOrderStatus status);
}
