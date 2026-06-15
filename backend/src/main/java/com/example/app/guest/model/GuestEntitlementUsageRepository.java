package com.example.app.guest.model;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestEntitlementUsageRepository extends JpaRepository<GuestEntitlementUsage, Long> {
    Optional<GuestEntitlementUsage> findBySessionBookingId(Long sessionBookingId);
    List<GuestEntitlementUsage> findAllBySessionBookingIdOrderByUsedAtAsc(Long sessionBookingId);
    List<GuestEntitlementUsage> findAllBySessionBookingIdInOrderByUsedAtAsc(Collection<Long> sessionBookingIds);
    List<GuestEntitlementUsage> findAllByEntitlementIdOrderByUsedAtDesc(Long entitlementId);
    List<GuestEntitlementUsage> findAllByEntitlementIdInOrderByUsedAtDesc(Collection<Long> entitlementIds, Pageable pageable);
    boolean existsByEntitlementIdAndReasonAndUsedAtAfter(Long entitlementId, EntitlementUsageReason reason, Instant usedAt);
}
