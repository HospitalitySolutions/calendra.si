package com.example.app.consumables;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface ConsumableInventoryLineRepository extends JpaRepository<ConsumableInventoryLine, Long> {
    @Query("""
            SELECT l FROM ConsumableInventoryLine l
            JOIN FETCH l.consumable c
            LEFT JOIN FETCH c.category
            LEFT JOIN FETCH l.countedBy
            WHERE l.company.id = :companyId AND l.inventorySession.id = :sessionId
            ORDER BY l.itemNameSnapshot ASC, l.id ASC
            """)
    List<ConsumableInventoryLine> findForSession(@Param("companyId") Long companyId, @Param("sessionId") Long sessionId);

    @Query("""
            SELECT l FROM ConsumableInventoryLine l
            JOIN FETCH l.inventorySession s
            JOIN FETCH l.consumable c
            WHERE l.company.id = :companyId AND s.id IN :sessionIds
            ORDER BY s.id DESC, l.id ASC
            """)
    List<ConsumableInventoryLine> findForSessions(
            @Param("companyId") Long companyId,
            @Param("sessionIds") java.util.Collection<Long> sessionIds
    );

    @Query("""
            SELECT l FROM ConsumableInventoryLine l
            JOIN FETCH l.inventorySession s
            JOIN FETCH s.location
            LEFT JOIN FETCH s.completedBy
            JOIN FETCH l.consumable c
            LEFT JOIN FETCH c.category
            WHERE l.company.id = :companyId
              AND s.status = :status
            ORDER BY s.completedAt DESC, l.itemNameSnapshot ASC, l.id ASC
            """)
    List<ConsumableInventoryLine> findCompletedForReport(
            @Param("companyId") Long companyId,
            @Param("status") ConsumableEnums.InventorySessionStatus status
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT l FROM ConsumableInventoryLine l
            JOIN FETCH l.consumable c
            WHERE l.company.id = :companyId AND l.inventorySession.id = :sessionId
            ORDER BY l.id ASC
            """)
    List<ConsumableInventoryLine> findForSessionForUpdate(@Param("companyId") Long companyId, @Param("sessionId") Long sessionId);
}
