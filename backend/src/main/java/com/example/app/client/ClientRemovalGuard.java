package com.example.app.client;

import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.session.SessionBookingRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class ClientRemovalGuard {
    private static final List<EntitlementStatus> WALLET_BLOCKING_STATUSES = List.of(EntitlementStatus.ACTIVE, EntitlementStatus.PENDING);

    private final SessionBookingRepository bookings;
    private final GuestEntitlementRepository entitlements;

    public ClientRemovalGuard(SessionBookingRepository bookings, GuestEntitlementRepository entitlements) {
        this.bookings = bookings;
        this.entitlements = entitlements;
    }

    public boolean isRemovalBlocked(Long clientId, Long companyId) {
        LocalDateTime nowLdt = LocalDateTime.now();
        Instant nowInst = Instant.now();
        if (bookings.existsRemovalBlockingBooking(companyId, clientId, nowLdt)) {
            return true;
        }
        return entitlements.existsRemovalBlockingEntitlement(companyId, clientId, WALLET_BLOCKING_STATUSES, nowInst);
    }

    /**
     * Client IDs that cannot be deactivated or deleted due to upcoming/current sessions or usable wallet items.
     */
    public Set<Long> clientIdsWithRemovalBlock(Long companyId, Collection<Long> clientIds) {
        if (clientIds == null || clientIds.isEmpty()) {
            return Set.of();
        }
        LocalDateTime nowLdt = LocalDateTime.now();
        Instant nowInst = Instant.now();
        Set<Long> blocked = new HashSet<>();
        blocked.addAll(bookings.findClientIdsWithRemovalBlockingBookings(companyId, clientIds, nowLdt));
        blocked.addAll(entitlements.findClientIdsWithRemovalBlockingEntitlements(companyId, clientIds, WALLET_BLOCKING_STATUSES, nowInst));
        return blocked;
    }
}
