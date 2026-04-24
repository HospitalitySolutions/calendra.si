package com.example.app.company;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CompanyRepository extends JpaRepository<Company, Long> {

    Optional<Company> findByTenantCodeIgnoreCase(String tenantCode);

    java.util.List<Company> findAllByNameContainingIgnoreCase(String name);

    @Query(
            "select c.id from Company c where lower(c.name) like lower(concat('%', :needle, '%')) "
                    + "or lower(c.tenantCode) like lower(concat('%', :needle, '%'))")
    java.util.List<Long> findIdsByNameOrTenantCodeContainingIgnoreCase(@Param("needle") String needle);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Company c WHERE c.id = :id")
    Optional<Company> findByIdForUpdate(@Param("id") Long id);
}

