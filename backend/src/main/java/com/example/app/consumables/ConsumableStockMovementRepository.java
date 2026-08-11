package com.example.app.consumables;

import com.example.app.consumables.ConsumableEnums.StockMovementSourceType;
import com.example.app.consumables.ConsumableEnums.StockMovementType;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsumableStockMovementRepository extends JpaRepository<ConsumableStockMovement, Long> {
    @Query("""
            SELECT m FROM ConsumableStockMovement m
            JOIN FETCH m.consumable c
            LEFT JOIN FETCH c.category
            JOIN FETCH m.location l
            LEFT JOIN FETCH m.createdBy
            WHERE m.company.id = :companyId
              AND (:locationId IS NULL OR l.id = :locationId)
            ORDER BY m.createdAt DESC
            """)
    List<ConsumableStockMovement> findAllForCompany(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId
    );

    @Query("""
            SELECT m FROM ConsumableStockMovement m
            JOIN FETCH m.consumable c
            LEFT JOIN FETCH c.category
            JOIN FETCH m.location l
            LEFT JOIN FETCH m.createdBy
            WHERE m.company.id = :companyId
              AND m.createdAt >= :since
              AND (:locationId IS NULL OR l.id = :locationId)
            ORDER BY m.createdAt DESC
            """)
    List<ConsumableStockMovement> findAllForCompanySince(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId,
            @Param("since") Instant since
    );

    boolean existsByCompanyIdAndLocationIdAndMovementTypeAndSourceTypeAndSourceId(
            Long companyId,
            Long locationId,
            StockMovementType movementType,
            StockMovementSourceType sourceType,
            Long sourceId
    );

    List<ConsumableStockMovement> findByCompanyIdAndLocationIdAndMovementTypeAndSourceTypeAndSourceId(
            Long companyId,
            Long locationId,
            StockMovementType movementType,
            StockMovementSourceType sourceType,
            Long sourceId
    );

    List<ConsumableStockMovement> findByCompanyIdAndMovementTypeAndSourceTypeAndSourceId(
            Long companyId,
            StockMovementType movementType,
            StockMovementSourceType sourceType,
            Long sourceId
    );

    List<ConsumableStockMovement> findByCompanyIdAndSourceTypeAndSourceId(
            Long companyId,
            StockMovementSourceType sourceType,
            Long sourceId
    );
}
