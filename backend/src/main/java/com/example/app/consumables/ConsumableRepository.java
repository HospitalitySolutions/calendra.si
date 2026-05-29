package com.example.app.consumables;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface ConsumableRepository extends JpaRepository<Consumable, Long> {
    @Query("SELECT c FROM Consumable c LEFT JOIN FETCH c.category WHERE c.company.id = :companyId ORDER BY c.name ASC")
    List<Consumable> findAllForCompany(@Param("companyId") Long companyId);

    @Query("SELECT c FROM Consumable c LEFT JOIN FETCH c.category WHERE c.company.id = :companyId AND c.active = true ORDER BY c.name ASC")
    List<Consumable> findActiveForCompany(@Param("companyId") Long companyId);

    @Query("SELECT c FROM Consumable c LEFT JOIN FETCH c.category WHERE c.id = :id AND c.company.id = :companyId")
    Optional<Consumable> findByIdAndCompanyId(@Param("id") Long id, @Param("companyId") Long companyId);
}
