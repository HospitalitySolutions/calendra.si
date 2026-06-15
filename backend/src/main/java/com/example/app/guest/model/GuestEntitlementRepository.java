package com.example.app.guest.model;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GuestEntitlementRepository extends JpaRepository<GuestEntitlement, Long> {
    @EntityGraph(attributePaths = {"product", "product.sessionType"})
    List<GuestEntitlement> findAllByClientIdAndCompanyIdOrderByCreatedAtDesc(Long clientId, Long companyId);

    @EntityGraph(attributePaths = {"product", "product.sessionType"})
    List<GuestEntitlement> findAllByClientIdAndCompanyIdOrderByCreatedAtDesc(Long clientId, Long companyId, Pageable pageable);

    @EntityGraph(attributePaths = {"product", "product.sessionType"})
    List<GuestEntitlement> findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(Long clientId, Long companyId, java.util.Collection<EntitlementStatus> statuses);

    @EntityGraph(attributePaths = {"product", "product.sessionType"})
    List<GuestEntitlement> findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(Long clientId, Long companyId, java.util.Collection<EntitlementStatus> statuses, Pageable pageable);

    @EntityGraph(attributePaths = {"product", "product.sessionType"})
    List<GuestEntitlement> findAllByClientIdAndCompanyIdAndStatusNotOrderByCreatedAtDesc(Long clientId, Long companyId, EntitlementStatus status, Pageable pageable);
    Optional<GuestEntitlement> findBySourceOrderId(Long sourceOrderId);
    Optional<GuestEntitlement> findBySourceOrderIdAndProductId(Long sourceOrderId, Long productId);
    Optional<GuestEntitlement> findFirstBySourceOrderIdOrderByCreatedAtAsc(Long sourceOrderId);
    Optional<GuestEntitlement> findByEntitlementCode(String entitlementCode);
    Optional<GuestEntitlement> findFirstByDisplayCodeAndCompanyIdOrderByCreatedAtDesc(String displayCode, Long companyId);
    Optional<GuestEntitlement> findByCourseAccessToken(String courseAccessToken);
    boolean existsByEntitlementCode(String entitlementCode);
    long countByProductId(Long productId);

    @Query("SELECT DISTINCT e.client.id FROM GuestEntitlement e WHERE e.company.id = :companyId AND e.client.id IN :clientIds "
            + "AND e.status IN :statuses AND (e.validFrom IS NULL OR e.validFrom <= :now) "
            + "AND (e.validUntil IS NULL OR e.validUntil > :now) "
            + "AND (e.remainingUses IS NULL OR e.remainingUses > 0)")
    List<Long> findClientIdsWithRemovalBlockingEntitlements(
            @Param("companyId") Long companyId,
            @Param("clientIds") Collection<Long> clientIds,
            @Param("statuses") Collection<EntitlementStatus> statuses,
            @Param("now") Instant now);

    @Query("SELECT CASE WHEN COUNT(e) > 0 THEN true ELSE false END FROM GuestEntitlement e WHERE e.company.id = :companyId "
            + "AND e.client.id = :clientId AND e.status IN :statuses AND (e.validFrom IS NULL OR e.validFrom <= :now) "
            + "AND (e.validUntil IS NULL OR e.validUntil > :now) "
            + "AND (e.remainingUses IS NULL OR e.remainingUses > 0)")
    boolean existsRemovalBlockingEntitlement(
            @Param("companyId") Long companyId,
            @Param("clientId") Long clientId,
            @Param("statuses") Collection<EntitlementStatus> statuses,
            @Param("now") Instant now);

    @Modifying
    @Query("UPDATE GuestEntitlement e SET e.status = :expiredStatus WHERE e.status IN :fromStatuses "
            + "AND e.validUntil IS NOT NULL AND e.validUntil <= :now")
    int markExpiredEntitlements(
            @Param("expiredStatus") EntitlementStatus expiredStatus,
            @Param("fromStatuses") Collection<EntitlementStatus> fromStatuses,
            @Param("now") Instant now);
}
