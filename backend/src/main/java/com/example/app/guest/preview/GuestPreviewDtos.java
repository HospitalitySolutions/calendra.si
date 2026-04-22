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
            String language,
            String profilePicturePath
    ) {}

    public record TenantSummaryResponse(
            String companyId,
            String companyName,
            String publicDescription,
            String publicCity,
            String publicPhone,
            String status,
            boolean requireOnlinePayment
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
            Integer totalUses,
            String validUntil,
            Integer validityDays,
            String status,
            String displayCode,
            Double priceGross,
            String currency
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
            Integer durationMinutes,
            String promoText,
            Integer validityDays,
            Integer usageLimit
    ) {}

    public record WalletOrderResponse(
            String orderId,
            String status,
            String paymentMethodType,
            double totalGross,
            String currency,
            String paidAt,
            String createdAt,
            String referenceCode,
            String productName,
            String productType,
            String billPaymentStatus
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
