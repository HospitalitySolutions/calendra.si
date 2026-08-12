package com.example.app.guest.model;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GuestLocationSubscriptionRepository extends JpaRepository<GuestLocationSubscription, Long> {
    Optional<GuestLocationSubscription> findByTenantLinkIdAndLocationId(Long tenantLinkId, Long locationId);

    boolean existsByTenantLinkIdAndLocationIdAndStatus(
            Long tenantLinkId, Long locationId, GuestTenantLinkStatus status);

    List<GuestLocationSubscription> findAllByTenantLinkIdAndStatusOrderByUpdatedAtDesc(
            Long tenantLinkId, GuestTenantLinkStatus status);

    @Query("""
            select s from GuestLocationSubscription s
            join fetch s.location l
            join fetch l.company c
            join fetch s.tenantLink tl
            where tl.guestUser.id = :guestUserId and s.status = :status and tl.status = :linkStatus
            order by s.updatedAt desc, s.id desc
            """)
    List<GuestLocationSubscription> findAllActiveForGuest(
            @Param("guestUserId") Long guestUserId,
            @Param("status") GuestTenantLinkStatus status,
            @Param("linkStatus") GuestTenantLinkStatus linkStatus);
}
