package com.example.app.consumables;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsumableLocationStockRepository extends JpaRepository<ConsumableLocationStock, Long> {
    @Query("""
            SELECT s FROM ConsumableLocationStock s
            JOIN FETCH s.consumable c
            LEFT JOIN FETCH c.category
            JOIN FETCH s.location l
            WHERE s.company.id = :companyId
            ORDER BY c.name ASC, l.name ASC, l.id ASC
            """)
    List<ConsumableLocationStock> findAllForCompany(@Param("companyId") Long companyId);

    @Query("""
            SELECT s FROM ConsumableLocationStock s
            JOIN FETCH s.consumable c
            LEFT JOIN FETCH c.category
            JOIN FETCH s.location l
            WHERE s.company.id = :companyId AND l.id = :locationId
            ORDER BY c.name ASC
            """)
    List<ConsumableLocationStock> findAllForCompanyAndLocation(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId
    );

    @Query("""
            SELECT s FROM ConsumableLocationStock s
            JOIN FETCH s.location l
            WHERE s.company.id = :companyId AND s.consumable.id IN :consumableIds
            """)
    List<ConsumableLocationStock> findAllByCompanyAndConsumableIds(
            @Param("companyId") Long companyId,
            @Param("consumableIds") Collection<Long> consumableIds
    );

    Optional<ConsumableLocationStock> findByCompanyIdAndConsumableIdAndLocationId(
            Long companyId,
            Long consumableId,
            Long locationId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            SELECT s FROM ConsumableLocationStock s
            JOIN FETCH s.consumable c
            JOIN FETCH s.location l
            WHERE s.company.id = :companyId
              AND c.id = :consumableId
              AND l.id = :locationId
            """)
    Optional<ConsumableLocationStock> findForUpdate(
            @Param("companyId") Long companyId,
            @Param("consumableId") Long consumableId,
            @Param("locationId") Long locationId
    );
}
