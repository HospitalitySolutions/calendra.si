package com.example.app.consumables;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface ServiceTypeConsumableRepository extends JpaRepository<ServiceTypeConsumable, Long> {
    @Query("SELECT stc FROM ServiceTypeConsumable stc JOIN FETCH stc.consumable c LEFT JOIN FETCH c.category WHERE stc.company.id = :companyId AND stc.sessionType.id = :typeId ORDER BY c.name ASC")
    List<ServiceTypeConsumable> findByCompanyIdAndSessionTypeId(@Param("companyId") Long companyId, @Param("typeId") Long typeId);

    @Modifying
    @Query("DELETE FROM ServiceTypeConsumable stc WHERE stc.company.id = :companyId AND stc.sessionType.id = :typeId")
    void deleteByCompanyIdAndSessionTypeId(@Param("companyId") Long companyId, @Param("typeId") Long typeId);
}
