package com.example.app.guest.common;

import com.example.app.guest.model.*;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.session.SessionBookingRepository;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GuestHomeService {
    private final GuestTenantService guestTenantService;
    private final GuestEntitlementRepository entitlements;
    private final GuestOrderRepository orders;
    private final SessionBookingRepository bookings;
    private final GuestSettingsService settingsService;

    public GuestHomeService(GuestTenantService guestTenantService, GuestEntitlementRepository entitlements, GuestOrderRepository orders, SessionBookingRepository bookings, GuestSettingsService settingsService) {
        this.guestTenantService = guestTenantService;
        this.entitlements = entitlements;
        this.orders = orders;
        this.bookings = bookings;
        this.settingsService = settingsService;
    }

    @Transactional(readOnly = true)
    public GuestDtos.HomeResponse home(GuestUser guestUser, Long companyId) {
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        var publicSettings = settingsService.publicSettings(companyId);
        GuestDtos.TenantSummaryResponse tenant = GuestMapper.toTenantSummary(link, publicSettings);
        List<GuestDtos.UpcomingBookingResponse> upcoming = bookings.findByClientIdAndCompanyId(link.getClient().getId(), companyId).stream()
                .filter(b -> b.getStartTime() != null && b.getStartTime().isAfter(LocalDateTime.now()))
                .sorted(Comparator.comparing(com.example.app.session.SessionBooking::getStartTime))
                .limit(10)
                .map(b -> new GuestDtos.UpcomingBookingResponse(String.valueOf(b.getId()), b.getType() == null ? "Session" : b.getType().getName(), b.getStartTime().toString(), b.getBookingStatus() == null ? "CONFIRMED" : b.getBookingStatus()))
                .toList();
        List<GuestDtos.EntitlementResponse> active = entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(link.getClient().getId(), companyId, List.of(EntitlementStatus.ACTIVE, EntitlementStatus.PENDING)).stream().map(GuestMapper::toEntitlement).toList();
        List<GuestDtos.PendingOrderResponse> pending = orders.findAllByGuestUserIdAndCompanyIdAndStatusOrderByCreatedAtDesc(guestUser.getId(), companyId, OrderStatus.PENDING).stream()
                .map(order -> new GuestDtos.PendingOrderResponse(String.valueOf(order.getId()), order.getStatus().name(), order.getPaymentMethodType().name(), order.getTotalGross().doubleValue(), order.getReferenceCode()))
                .toList();
        return new GuestDtos.HomeResponse(tenant, upcoming, active, pending);
    }
}
