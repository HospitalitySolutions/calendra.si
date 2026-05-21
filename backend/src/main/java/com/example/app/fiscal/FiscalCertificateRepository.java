package com.example.app.fiscal;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FiscalCertificateRepository extends JpaRepository<FiscalCertificate, Long> {
    Optional<FiscalCertificate> findByCompanyId(Long companyId);
    void deleteByCompanyId(Long companyId);
}
