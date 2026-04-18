package com.example.app.group;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClientGroupRepository extends JpaRepository<ClientGroup, Long> {

    @EntityGraph(attributePaths = {"members", "billingCompany"})
    List<ClientGroup> findAllByCompanyIdOrderByNameAsc(Long companyId);

    @EntityGraph(attributePaths = {"members", "billingCompany"})
    Optional<ClientGroup> findByIdAndCompanyId(Long id, Long companyId);

    @Query("""
            SELECT g FROM ClientGroup g LEFT JOIN FETCH g.members LEFT JOIN FETCH g.billingCompany
            WHERE g.company.id = :companyId
              AND LOWER(g.name) LIKE LOWER(CONCAT('%', :q, '%'))
            ORDER BY g.name ASC
            """)
    List<ClientGroup> searchByCompanyId(@Param("companyId") Long companyId, @Param("q") String q);
}
