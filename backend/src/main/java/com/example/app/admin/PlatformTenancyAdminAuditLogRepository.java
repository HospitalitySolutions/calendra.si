package com.example.app.admin;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlatformTenancyAdminAuditLogRepository extends JpaRepository<PlatformTenancyAdminAuditLog, Long> {

    @EntityGraph(attributePaths = {"actorUser"})
    @Query("select e from PlatformTenancyAdminAuditLog e where e.company.id = :companyId order by e.createdAt desc")
    List<PlatformTenancyAdminAuditLog> findRecentByCompanyId(@Param("companyId") Long companyId, Pageable pageable);
}
