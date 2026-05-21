package com.example.app.guest.model;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestTenantLinkRepository extends JpaRepository<GuestTenantLink, Long> {
    List<GuestTenantLink> findAllByGuestUserIdOrderByUpdatedAtDesc(Long guestUserId);
    Optional<GuestTenantLink> findByGuestUserIdAndCompanyId(Long guestUserId, Long companyId);
    Optional<GuestTenantLink> findByCompanyIdAndClientIdAndStatus(Long companyId, Long clientId, GuestTenantLinkStatus status);
    boolean existsByCompanyIdAndClientIdAndStatus(Long companyId, Long clientId, GuestTenantLinkStatus status);
    List<GuestTenantLink> findAllByGuestUserIdAndStatus(Long guestUserId, GuestTenantLinkStatus status);
    List<GuestTenantLink> findAllByCompanyIdAndStatus(Long companyId, GuestTenantLinkStatus status);
}
