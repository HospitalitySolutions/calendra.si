package com.example.app.customer;

import com.example.app.guest.common.GuestDtos;
import java.util.List;

public final class CustomerDtos {
    private CustomerDtos() {}

    public record BookingHandoffRequest(
            String locationId,
            String sessionTypeId
    ) {}

    public record BookingHandoffResponse(
            String handoffToken,
            String expiresAt,
            String bookingUrl,
            String companyId,
            String companyName,
            String locationId,
            String locationName
    ) {}

    public record ProviderResponse(
            String companyId,
            String companyName,
            String logoUrl,
            String locationId,
            String locationName,
            String locationAddress
    ) {}

    public record BookingResponse(
            String bookingId,
            ProviderResponse provider,
            String sessionTypeId,
            String sessionTypeName,
            String startsAt,
            String endsAt,
            String bookingStatus,
            String consultantName,
            List<GuestDtos.BookingServiceResponse> services,
            int totalDurationMinutes,
            double totalPriceGross,
            String currency,
            String paymentStatus
    ) {}

    public record WalletEntitlementResponse(
            ProviderResponse provider,
            GuestDtos.EntitlementResponse entitlement
    ) {}

    public record WalletOrderResponse(
            ProviderResponse provider,
            String orderId,
            String status,
            String paymentMethodType,
            double totalGross,
            String currency,
            String paidAt,
            String createdAt,
            String referenceCode,
            String productName,
            String productType
    ) {}

    public record WalletResponse(
            List<WalletEntitlementResponse> entitlements,
            List<WalletOrderResponse> orders
    ) {}

    public record NotificationResponse(
            String notificationId,
            ProviderResponse provider,
            String notificationType,
            String title,
            String body,
            String readAt,
            String createdAt,
            String payloadJson
    ) {}

    public record NotificationsResponse(
            List<NotificationResponse> items,
            long unreadCount
    ) {}

    public record InboxThreadResponse(
            ProviderResponse provider,
            Long clientId,
            String threadKey,
            String clientFirstName,
            String clientLastName,
            String lastPreview,
            String lastSenderName,
            String lastSentAt,
            long messageCount,
            long unreadCount
    ) {}

    public record HomeResponse(
            BookingResponse nextBooking,
            List<BookingResponse> upcomingBookings,
            List<WalletEntitlementResponse> activeEntitlements,
            List<ProviderResponse> recentProviders,
            long unreadNotificationCount,
            long unreadInboxCount
    ) {}
}
