package com.example.app.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;

public interface TransactionServiceRepository extends JpaRepository<TransactionService, Long> {
    List<TransactionService> findAllByCompanyId(Long companyId);

    List<TransactionService> findAllByCompanyIdAndSystemGeneratedFalse(Long companyId);

    Optional<TransactionService> findByIdAndCompanyId(Long id, Long companyId);
    Optional<TransactionService> findByCompanyIdAndCodeIgnoreCase(Long companyId, String code);

    Optional<TransactionService> findByCompanyIdAndSystemGeneratedTrueAndSystemSourceAndSystemSourceKey(
            Long companyId,
            String systemSource,
            String systemSourceKey
    );

    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO transaction_service (
                created_at, updated_at, company_id, code, description, tax_rate, net_price, active,
                system_generated, system_source, system_source_key
            )
            VALUES (
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, :companyId, :code, :description, :taxRate, 0, TRUE,
                TRUE, :systemSource, :systemSourceKey
            )
            ON CONFLICT DO NOTHING
            """, nativeQuery = true)
    int ensureSystemGeneratedService(
            @Param("companyId") Long companyId,
            @Param("code") String code,
            @Param("description") String description,
            @Param("taxRate") String taxRate,
            @Param("systemSource") String systemSource,
            @Param("systemSourceKey") String systemSourceKey
    );
}
