package com.example.app.guest.model;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestEntitlementRepository extends JpaRepository<GuestEntitlement, Long> {
    List<GuestEntitlement> findAllByClientIdAndCompanyIdOrderByCreatedAtDesc(Long clientId, Long companyId);
    List<GuestEntitlement> findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(Long clientId, Long companyId, java.util.Collection<EntitlementStatus> statuses);
}
