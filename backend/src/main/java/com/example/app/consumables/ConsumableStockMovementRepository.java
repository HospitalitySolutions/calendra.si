package com.example.app.consumables;

import com.example.app.consumables.ConsumableEnums.StockMovementSourceType;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;

public interface ConsumableStockMovementRepository extends JpaRepository<ConsumableStockMovement, Long> {
    @Query("SELECT m FROM ConsumableStockMovement m JOIN FETCH m.consumable c LEFT JOIN FETCH c.category LEFT JOIN FETCH m.createdBy WHERE m.company.id = :companyId ORDER BY m.createdAt DESC")
    List<ConsumableStockMovement> findAllForCompany(@Param("companyId") Long companyId);

    @Query("SELECT m FROM ConsumableStockMovement m JOIN FETCH m.consumable c LEFT JOIN FETCH c.category LEFT JOIN FETCH m.createdBy WHERE m.company.id = :companyId AND m.createdAt >= :since ORDER BY m.createdAt DESC")
    List<ConsumableStockMovement> findAllForCompanySince(@Param("companyId") Long companyId, @Param("since") Instant since);

    boolean existsByCompanyIdAndMovementTypeAndSourceTypeAndSourceId(Long companyId, StockMovementType movementType, StockMovementSourceType sourceType, Long sourceId);

    List<ConsumableStockMovement> findByCompanyIdAndMovementTypeAndSourceTypeAndSourceId(Long companyId, StockMovementType movementType, StockMovementSourceType sourceType, Long sourceId);
}
