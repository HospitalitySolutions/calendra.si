package com.example.app.group;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClientGroupRepository extends JpaRepository<ClientGroup, Long> {

    @EntityGraph(attributePaths = {"members", "billingCompany", "defaultSessionType"})
    List<ClientGroup> findAllByCompanyIdOrderByNameAsc(Long companyId);

    @EntityGraph(attributePaths = {"members", "billingCompany", "assignedLocations", "defaultSessionType"})
    @Query("select distinct g from ClientGroup g where g.company.id = :companyId and g.id in :ids")
    List<ClientGroup> findListRowsByCompanyIdAndIdIn(
            @Param("companyId") Long companyId,
            @Param("ids") Collection<Long> ids);

    @EntityGraph(attributePaths = {"members", "billingCompany", "assignedLocations", "defaultSessionType"})
    Optional<ClientGroup> findByIdAndCompanyId(Long id, Long companyId);

    @Query("""
            SELECT DISTINCT g FROM ClientGroup g LEFT JOIN FETCH g.members LEFT JOIN FETCH g.billingCompany LEFT JOIN FETCH g.defaultSessionType
            WHERE g.company.id = :companyId
              AND LOWER(g.name) LIKE LOWER(CONCAT('%', :q, '%'))
            ORDER BY g.name ASC
            """)
    List<ClientGroup> searchByCompanyId(@Param("companyId") Long companyId, @Param("q") String q);
}
