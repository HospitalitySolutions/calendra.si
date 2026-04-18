package com.example.app.guest.preview;

import java.util.List;

public final class GuestPreviewDtos {
    private GuestPreviewDtos() {}

    public record GuestUserResponse(
            String id,
            String email,
            String firstName,
            String lastName,
            String phone,
            String language
    ) {}

    public record TenantSummaryResponse(
            String companyId,
            String companyName,
            String publicDescription,
            String publicCity,
            String publicPhone,
            String status
    ) {}

    public record GuestSessionResponse(
            String token,
            GuestUserResponse guestUser,
            List<TenantSummaryResponse> linkedTenants
    ) {}

    public record GuestProfileResponse(
            GuestUserResponse guestUser,
            List<TenantSummaryResponse> linkedTenants
    ) {}

    public record TenantLookupResponse(
            String companyId,
            String companyName,
            String publicDescription,
            String publicCity,
            String publicPhone,
            String joinMethod,
            boolean canJoin
    ) {}

    public record UpcomingBookingResponse(
            String bookingId,
            String sessionTypeName,
            String startsAt,
            String bookingStatus
    ) {}

    public record EntitlementResponse(
            String entitlementId,
            String productName,
            String entitlementType,
            Integer remainingUses,
            String validUntil,
            String status
    ) {}

    public record PendingOrderResponse(
            String orderId,
            String status,
            String paymentMethodType,
            double totalGross,
            String referenceCode
    ) {}

    public record HomeResponse(
            TenantSummaryResponse tenant,
            List<UpcomingBookingResponse> upcomingBookings,
            List<EntitlementResponse> activeEntitlements,
            List<PendingOrderResponse> pendingOrders
    ) {}

    public record ProductResponse(
            String productId,
            String name,
            String productType,
            double priceGross,
            String currency,
            String sessionTypeId,
            String sessionTypeName,
            boolean bookable,
            String description,
            Integer durationMinutes
    ) {}

    public record WalletOrderResponse(
            String orderId,
            String status,
            String paymentMethodType,
            double totalGross,
            String paidAt
    ) {}

    public record WalletResponse(
            List<EntitlementResponse> entitlements,
            List<WalletOrderResponse> orders
    ) {}

    public record BookingHistoryItemResponse(
            String bookingId,
            String sessionTypeName,
            String startsAt,
            String bookingStatus
    ) {}

    public record NotificationResponse(
            String notificationId,
            String notificationType,
            String title,
            String body,
            String readAt,
            String createdAt
    ) {}

    public record NotificationsResponse(
            List<NotificationResponse> items
    ) {}
}
