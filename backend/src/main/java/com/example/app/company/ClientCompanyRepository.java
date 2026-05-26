package com.example.app.company;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClientCompanyRepository extends JpaRepository<ClientCompany, Long> {
    List<ClientCompany> findAllByOwnerCompanyIdOrderByNameAsc(Long ownerCompanyId);

    Optional<ClientCompany> findByIdAndOwnerCompanyId(Long id, Long ownerCompanyId);

    Optional<ClientCompany> findFirstByOwnerCompanyIdAndVatId(Long ownerCompanyId, String vatId);

    Optional<ClientCompany> findFirstByOwnerCompanyIdAndEmailIgnoreCase(Long ownerCompanyId, String email);

    Optional<ClientCompany> findFirstByOwnerCompanyIdAndNameIgnoreCase(Long ownerCompanyId, String name);

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

    @Query(
            """
            select case when count(c) > 0 then true else false end from ClientCompany c
            where c.ownerCompany.id = :ownerCompanyId
              and c.email is not null
              and trim(c.email) <> ''
              and lower(trim(c.email)) = :normalizedEmail
              and (:excludeId is null or c.id <> :excludeId)
            """)
    boolean existsOtherWithNormalizedEmail(
            @Param("ownerCompanyId") Long ownerCompanyId,
            @Param("normalizedEmail") String normalizedEmail,
            @Param("excludeId") Long excludeId);

    @Query(
            """
            select case when count(c) > 0 then true else false end from ClientCompany c
            where c.ownerCompany.id = :ownerCompanyId
              and c.vatId is not null
              and trim(c.vatId) <> ''
              and c.vatId = :normalizedVatId
              and (:excludeId is null or c.id <> :excludeId)
            """)
    boolean existsOtherWithSameVatId(
            @Param("ownerCompanyId") Long ownerCompanyId,
            @Param("normalizedVatId") String normalizedVatId,
            @Param("excludeId") Long excludeId);
}
