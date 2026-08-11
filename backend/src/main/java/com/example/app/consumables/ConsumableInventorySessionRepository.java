package com.example.app.consumables;

import com.example.app.consumables.ConsumableEnums.InventorySessionStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

public interface ConsumableInventorySessionRepository extends JpaRepository<ConsumableInventorySession, Long> {
    @Query("""
            SELECT s FROM ConsumableInventorySession s
            JOIN FETCH s.location l
            LEFT JOIN FETCH s.startedBy
            LEFT JOIN FETCH s.completedBy
            WHERE s.company.id = :companyId
              AND (:locationId IS NULL OR l.id = :locationId)
            ORDER BY s.startedAt DESC, s.id DESC
            """)
    List<ConsumableInventorySession> findAllForCompany(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId
    );

    @Query("""
            SELECT s FROM ConsumableInventorySession s
            JOIN FETCH s.location l
            LEFT JOIN FETCH s.startedBy
            LEFT JOIN FETCH s.completedBy
            WHERE s.id = :id AND s.company.id = :companyId
            """)
    Optional<ConsumableInventorySession> findDetail(@Param("id") Long id, @Param("companyId") Long companyId);

    boolean existsByCompanyIdAndLocationIdAndStatus(Long companyId, Long locationId, InventorySessionStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT s FROM ConsumableInventorySession s
            JOIN FETCH s.location l
            LEFT JOIN FETCH s.startedBy
            LEFT JOIN FETCH s.completedBy
            WHERE s.id = :id AND s.company.id = :companyId
            """)
    Optional<ConsumableInventorySession> findForUpdate(@Param("id") Long id, @Param("companyId") Long companyId);
}
