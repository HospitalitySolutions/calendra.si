package com.example.app.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface TransactionServiceRepository extends JpaRepository<TransactionService, Long> {
    List<TransactionService> findAllByCompanyId(Long companyId);
    Optional<TransactionService> findByIdAndCompanyId(Long id, Long companyId);
}
