package com.example.app.billingissuer;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyLegalEntityRepository extends JpaRepository<CompanyLegalEntity, Long> {
    @EntityGraph(attributePaths = {"company", "legalEntity", "defaultInvoiceSeries"})
    List<CompanyLegalEntity> findAllByCompanyIdOrderByDefaultIssuerDescIdAsc(Long companyId);

    @EntityGraph(attributePaths = {"company", "legalEntity", "defaultInvoiceSeries"})
    List<CompanyLegalEntity> findAllByCompanyIdInOrderByCompanyIdAscDefaultIssuerDescIdAsc(Collection<Long> companyIds);

    @EntityGraph(attributePaths = {"company", "legalEntity", "defaultInvoiceSeries"})
    Optional<CompanyLegalEntity> findByCompanyIdAndLegalEntityId(Long companyId, Long legalEntityId);

    @EntityGraph(attributePaths = {"company", "legalEntity", "defaultInvoiceSeries"})
    Optional<CompanyLegalEntity> findFirstByCompanyIdAndActiveTrueOrderByDefaultIssuerDescIdAsc(Long companyId);

    List<CompanyLegalEntity> findAllByLegalEntityId(Long legalEntityId);
    long countByLegalEntityIdAndActiveTrue(Long legalEntityId);
}
