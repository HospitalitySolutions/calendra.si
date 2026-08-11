package com.example.app.consumables;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsumableStockTransferRepository extends JpaRepository<ConsumableStockTransfer, Long> {
    @Query("""
            SELECT t FROM ConsumableStockTransfer t
            JOIN FETCH t.consumable c
            JOIN FETCH t.fromLocation fromLocation
            JOIN FETCH t.toLocation toLocation
            LEFT JOIN FETCH t.createdBy
            WHERE t.company.id = :companyId
              AND (:locationId IS NULL OR fromLocation.id = :locationId OR toLocation.id = :locationId)
            ORDER BY t.createdAt DESC, t.id DESC
            """)
    List<ConsumableStockTransfer> findAllForCompany(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId
    );

    @Query("""
            SELECT t FROM ConsumableStockTransfer t
            JOIN FETCH t.consumable c
            JOIN FETCH t.fromLocation
            JOIN FETCH t.toLocation
            LEFT JOIN FETCH t.createdBy
            WHERE t.company.id = :companyId AND t.idempotencyKey = :idempotencyKey
            """)
    Optional<ConsumableStockTransfer> findByCompanyIdAndIdempotencyKey(
            @Param("companyId") Long companyId,
            @Param("idempotencyKey") String idempotencyKey
    );
}
