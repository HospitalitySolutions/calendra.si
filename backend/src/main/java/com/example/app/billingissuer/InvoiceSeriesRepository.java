package com.example.app.billingissuer;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvoiceSeriesRepository extends JpaRepository<InvoiceSeries, Long> {
    @EntityGraph(attributePaths = {"legalEntity", "company", "location"})
    List<InvoiceSeries> findAllByWorkspaceIdOrderByLegalEntityNameAscNameAscIdAsc(Long workspaceId);

    @EntityGraph(attributePaths = {"legalEntity", "company", "location"})
    List<InvoiceSeries> findAllByLegalEntityIdOrderByActiveDescNameAscIdAsc(Long legalEntityId);

    @EntityGraph(attributePaths = {"legalEntity", "company", "location"})
    Optional<InvoiceSeries> findByIdAndWorkspaceId(Long id, Long workspaceId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from InvoiceSeries s join fetch s.legalEntity left join fetch s.company left join fetch s.location where s.id = :id")
    Optional<InvoiceSeries> findForUpdateById(@Param("id") Long id);

    boolean existsByLegalEntityIdAndNameIgnoreCase(Long legalEntityId, String name);
    long countByLegalEntityId(Long legalEntityId);
}
