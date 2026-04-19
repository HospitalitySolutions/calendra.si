package com.example.app.guest.model;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestEntitlementUsageRepository extends JpaRepository<GuestEntitlementUsage, Long> {
    Optional<GuestEntitlementUsage> findBySessionBookingId(Long sessionBookingId);
    List<GuestEntitlementUsage> findAllByEntitlementIdOrderByUsedAtDesc(Long entitlementId);
}
