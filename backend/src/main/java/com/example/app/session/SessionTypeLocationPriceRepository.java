package com.example.app.session;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SessionTypeLocationPriceRepository extends JpaRepository<SessionTypeLocationPrice, Long> {
    Optional<SessionTypeLocationPrice> findByCompanyIdAndSessionTypeIdAndTransactionServiceIdAndLocationId(
            Long companyId, Long sessionTypeId, Long transactionServiceId, Long locationId);
    List<SessionTypeLocationPrice> findAllByCompanyIdAndSessionTypeIdAndLocationId(Long companyId, Long sessionTypeId, Long locationId);
    List<SessionTypeLocationPrice> findAllByCompanyIdAndSessionTypeId(Long companyId, Long sessionTypeId);
    @EntityGraph(attributePaths = {"sessionType", "transactionService", "location"})
    List<SessionTypeLocationPrice> findAllByCompanyIdAndLocationIdInAndSessionTypeIdIn(
            Long companyId,
            Collection<Long> locationIds,
            Collection<Long> sessionTypeIds
    );
    void deleteByCompanyIdAndSessionTypeIdAndTransactionServiceIdAndLocationId(
            Long companyId, Long sessionTypeId, Long transactionServiceId, Long locationId);
    void deleteByCompanyIdAndSessionTypeIdAndTransactionServiceIdNotIn(Long companyId, Long sessionTypeId, java.util.Collection<Long> transactionServiceIds);
    void deleteByCompanyIdAndSessionTypeId(Long companyId, Long sessionTypeId);
}
