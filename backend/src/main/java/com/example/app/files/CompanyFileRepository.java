package com.example.app.files;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyFileRepository extends JpaRepository<CompanyFile, Long> {
    List<CompanyFile> findAllByCompanyIdAndOwnerCompanyIdOrderByCreatedAtDescIdDesc(Long companyId, Long ownerCompanyId);

    Optional<CompanyFile> findByIdAndCompanyIdAndOwnerCompanyId(Long id, Long companyId, Long ownerCompanyId);
}
