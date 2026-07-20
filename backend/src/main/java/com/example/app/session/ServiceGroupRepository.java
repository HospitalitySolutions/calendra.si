package com.example.app.session;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ServiceGroupRepository extends JpaRepository<ServiceGroup, Long> {
    List<ServiceGroup> findAllByCompanyIdOrderBySortOrderAscNameAsc(Long companyId);

    Optional<ServiceGroup> findByCompanyIdAndNameIgnoreCase(Long companyId, String name);

    @Query("SELECT COALESCE(MAX(g.sortOrder), -1) FROM ServiceGroup g WHERE g.company.id = :companyId")
    int findMaxSortOrderByCompanyId(@Param("companyId") Long companyId);
}
