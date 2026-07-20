package com.example.app.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SessionTypeRepository extends JpaRepository<SessionType, Long> {

    @Query("SELECT DISTINCT t FROM SessionType t LEFT JOIN FETCH t.serviceGroup LEFT JOIN FETCH t.linkedServices ls LEFT JOIN FETCH ls.transactionService")
    List<SessionType> findAllWithLinkedServices();

    @Query("SELECT DISTINCT t FROM SessionType t LEFT JOIN FETCH t.serviceGroup LEFT JOIN FETCH t.linkedServices ls LEFT JOIN FETCH ls.transactionService " +
            "WHERE t.company.id = :companyId")
    List<SessionType> findAllWithLinkedServicesByCompanyId(@Param("companyId") Long companyId);

    @Query("SELECT DISTINCT t FROM SessionType t LEFT JOIN FETCH t.serviceGroup LEFT JOIN FETCH t.linkedServices ls LEFT JOIN FETCH ls.transactionService " +
            "WHERE t.id = :id AND t.company.id = :companyId")
    Optional<SessionType> findByIdAndCompanyIdWithLinkedServices(@Param("id") Long id, @Param("companyId") Long companyId);

    Optional<SessionType> findByCompanyIdAndNameIgnoreCase(Long companyId, String name);

    List<SessionType> findAllByCompanyIdAndServiceGroupId(Long companyId, Long serviceGroupId);

    long countByCompanyIdAndServiceGroupId(Long companyId, Long serviceGroupId);

    @Query("SELECT COALESCE(MAX(t.guestSortOrder), -1) FROM SessionType t WHERE t.company.id = :companyId " +
            "AND ((:serviceGroupId IS NULL AND t.serviceGroup IS NULL) OR t.serviceGroup.id = :serviceGroupId)")
    int findMaxSortOrderByCompanyIdAndServiceGroupId(
            @Param("companyId") Long companyId,
            @Param("serviceGroupId") Long serviceGroupId
    );
}
