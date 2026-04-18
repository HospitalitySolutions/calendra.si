package com.example.app.guest.wallet;

import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.model.*;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.session.SessionBookingRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GuestWalletService {
    private final GuestTenantService guestTenantService;
    private final GuestEntitlementRepository entitlements;
    private final GuestOrderRepository orders;
    private final SessionBookingRepository bookings;

    public GuestWalletService(GuestTenantService guestTenantService, GuestEntitlementRepository entitlements, GuestOrderRepository orders, SessionBookingRepository bookings) {
        this.guestTenantService = guestTenantService;
        this.entitlements = entitlements;
        this.orders = orders;
        this.bookings = bookings;
    }

    @Transactional(readOnly = true)
    public GuestDtos.WalletResponse wallet(GuestUser guestUser, Long companyId) {
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        return new GuestDtos.WalletResponse(
                entitlements.findAllByClientIdAndCompanyIdOrderByCreatedAtDesc(link.getClient().getId(), companyId).stream().map(GuestMapper::toEntitlement).toList(),
                orders.findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(guestUser.getId(), companyId).stream().map(order -> new GuestDtos.WalletOrderResponse(
                        String.valueOf(order.getId()),
                        order.getStatus().name(),
                        order.getPaymentMethodType().name(),
                        order.getTotalGross().doubleValue(),
                        order.getPaidAt() == null ? null : order.getPaidAt().toString()
                )).toList()
        );
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.BookingHistoryItemResponse> history(GuestUser guestUser, Long companyId) {
        GuestTenantLink link = guestTenantService.requireLink(guestUser, companyId);
        return bookings.findByClientIdAndCompanyId(link.getClient().getId(), companyId).stream()
                .filter(b -> b.getStartTime() != null && b.getStartTime().isBefore(LocalDateTime.now()))
                .sorted(java.util.Comparator.comparing(com.example.app.session.SessionBooking::getStartTime).reversed())
                .map(b -> new GuestDtos.BookingHistoryItemResponse(
                        String.valueOf(b.getId()),
                        b.getType() == null ? "Session" : b.getType().getName(),
                        b.getStartTime().toString(),
                        b.getBookingStatus() == null ? "COMPLETED" : b.getBookingStatus()
                ))
                .toList();
    }
}
