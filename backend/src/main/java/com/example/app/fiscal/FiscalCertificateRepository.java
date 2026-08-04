package com.example.app.fiscal;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FiscalCertificateRepository extends JpaRepository<FiscalCertificate, Long> {
    Optional<FiscalCertificate> findByLegalEntityId(Long legalEntityId);
    void deleteByLegalEntityId(Long legalEntityId);

    /** Legacy/default-unit lookup retained for premise registration and backwards-compatible callers. */
    Optional<FiscalCertificate> findFirstByCompanyIdOrderByIdAsc(Long companyId);
}
