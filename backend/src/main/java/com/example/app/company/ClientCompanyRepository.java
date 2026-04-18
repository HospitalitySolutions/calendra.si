package com.example.app.company;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClientCompanyRepository extends JpaRepository<ClientCompany, Long> {
    List<ClientCompany> findAllByOwnerCompanyIdOrderByNameAsc(Long ownerCompanyId);

    Optional<ClientCompany> findByIdAndOwnerCompanyId(Long id, Long ownerCompanyId);

    @Query("""
            SELECT c FROM ClientCompany c
            WHERE c.ownerCompany.id = :ownerCompanyId
              AND (
                LOWER(c.name) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(COALESCE(c.address, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(COALESCE(c.city, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(COALESCE(c.vatId, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(COALESCE(c.email, '')) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(COALESCE(c.telephone, '')) LIKE LOWER(CONCAT('%', :q, '%'))
              )
            ORDER BY c.name ASC
            """)
    List<ClientCompany> searchByOwnerCompanyId(@Param("ownerCompanyId") Long ownerCompanyId, @Param("q") String q);
}
