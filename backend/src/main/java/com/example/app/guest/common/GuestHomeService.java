package com.example.app.guest.common;

import com.example.app.guest.model.*;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.session.SessionBookingRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.PageRequest;
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
        var rules = settingsService.bookingRules(companyId);
        GuestDtos.TenantSummaryResponse tenant = GuestMapper.toTenantSummary(
                link,
                publicSettings,
                rules.requireOnlinePayment(),
                rules.paymentRequirement(),
                rules.depositPercent(),
                settingsService.acceptedPaymentMethods(companyId)
        );
        LocalDateTime now = LocalDateTime.now();
        List<GuestDtos.UpcomingBookingResponse> upcoming = bookings.findUpcomingByClientIdAndCompanyId(
                        link.getClient().getId(),
                        companyId,
                        now,
                        PageRequest.of(0, 10)
                ).stream()
                .map(b -> {
                    List<GuestDtos.BookingServiceResponse> serviceLines = GuestBookingViewSupport.services(b, "EUR");
                    String paymentStatus = resolvePaymentStatus(b);
                    return new GuestDtos.UpcomingBookingResponse(
                            String.valueOf(b.getId()),
                            GuestBookingViewSupport.summaryName(serviceLines),
                            b.getStartTime().toString(),
                            b.getBookingStatus() == null ? "CONFIRMED" : b.getBookingStatus(),
                            b.getConsultant() == null ? null : b.getConsultant().getPhone(),
                            b.getEndTime() == null ? null : b.getEndTime().toString(),
                            GuestMapper.formatConsultantDisplayName(b.getConsultant()),
                            b.getType() == null ? null : String.valueOf(b.getType().getId()),
                            serviceLines,
                            com.example.app.session.SessionServiceSupport.totalServiceMinutes(b),
                            GuestBookingViewSupport.totalPrice(serviceLines),
                            "EUR",
                            paymentStatus,
                            b.getLocation() == null ? null : String.valueOf(b.getLocation().getId())
                    );
                })
                .toList();
        List<GuestDtos.EntitlementResponse> active = entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(
                        link.getClient().getId(),
                        companyId,
                        List.of(EntitlementStatus.ACTIVE, EntitlementStatus.PENDING),
                        PageRequest.of(0, 20)
                ).stream()
                .map(GuestMapper::toEntitlement)
                .toList();
        List<GuestDtos.PendingOrderResponse> pending = orders.findAllByGuestUserIdAndCompanyIdAndStatusOrderByCreatedAtDesc(
                        guestUser.getId(),
                        companyId,
                        OrderStatus.PENDING,
                        PageRequest.of(0, 10)
                ).stream()
                .map(order -> new GuestDtos.PendingOrderResponse(String.valueOf(order.getId()), order.getStatus().name(), order.getPaymentMethodType().name(), order.getTotalGross().doubleValue(), order.getReferenceCode()))
                .toList();
        return new GuestDtos.HomeResponse(tenant, upcoming, active, pending);
    }

    private String resolvePaymentStatus(com.example.app.session.SessionBooking booking) {
        if (booking == null || booking.getSourceOrderId() == null || booking.getSourceOrderId().isBlank()) return null;
        try {
            return orders.findById(Long.parseLong(booking.getSourceOrderId()))
                    .map(order -> order.getStatus().name())
                    .orElse(null);
        } catch (Exception ex) {
            return null;
        }
    }
}
