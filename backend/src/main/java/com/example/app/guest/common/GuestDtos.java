package com.example.app.guest.common;

import java.util.List;

public final class GuestDtos {
    private GuestDtos() {}

    public record GuestUserResponse(
            String id,
            String email,
            String firstName,
            String lastName,
            String phone,
            String language,
            /** Relative API path to download the picture with guest auth, or null. */
            String profilePicturePath
    ) {}
    public record TenantSummaryResponse(
            String companyId,
            String companyName,
            String publicDescription,
            String publicCity,
            String publicPhone,
            String companyAddress,
            String status,
            boolean employeeSelectionStep,
            boolean requireOnlinePayment
    ) {}
    public record GuestSessionResponse(String token, GuestUserResponse guestUser, List<TenantSummaryResponse> linkedTenants) {}
    public record GuestProfileResponse(GuestUserResponse guestUser, List<TenantSummaryResponse> linkedTenants) {}
    public record LinkedCompanyOptionResponse(String id, String name) {}
    public record GuestProfileSettingsResponse(
            GuestUserResponse guestUser,
            String companyId,
            String companyName,
            String linkedCompanyId,
            String linkedCompanyName,
            boolean batchPaymentEnabled,
            boolean notifyMessagesEnabled,
            boolean notifyRemindersEnabled,
            List<LinkedCompanyOptionResponse> linkedCompanyOptions
    ) {}
    public record UpdateGuestProfileSettingsRequest(
            String firstName,
            String lastName,
            String email,
            String phone,
            String language,
            String companyId,
            String linkedCompanyId,
            Boolean batchPaymentEnabled,
            Boolean notifyMessagesEnabled,
            Boolean notifyRemindersEnabled
    ) {}

    public record LoginRequest(String email, String password) {}
    public record SignupRequest(String email, String password, String firstName, String lastName, String phone, String language) {}
    public record SocialTokenRequest(String idToken) {}

    public record TenantLookupRequest(String tenantCode) {}
    public record TenantLookupResponse(String companyId, String companyName, String publicDescription, String publicCity, String publicPhone, String companyAddress, String joinMethod, boolean canJoin, boolean employeeSelectionStep) {}
    public record JoinTenantRequest(String joinMethod, String tenantCode, String inviteCode, String companyId) {}
    public record TenantLinkResponse(String companyId, String clientId, String status, String joinedVia) {}
    public record JoinTenantResponse(TenantLinkResponse tenantLink, boolean clientMatched, String matchType) {}

    public record UpcomingBookingResponse(String bookingId, String sessionTypeName, String startsAt, String bookingStatus) {}
    public record EntitlementResponse(
            String entitlementId,
            String productName,
            String entitlementType,
            Integer remainingUses,
            /** Total uses granted at purchase (e.g. 8 for "Core Mix 8-vstopov"); null if unlimited. */
            Integer totalUses,
            String validUntil,
            /** Source product validity days; when null, the guest app hides "Valid until". */
            Integer validityDays,
            String status,
            String sessionTypeId,
            String sessionTypeName,
            boolean autoRenews,
            /** Short human-friendly code shown on the ticket (e.g. "CM8-425-001"). */
            String displayCode,
            /** Gross price from the source product so the wallet card can render it. */
            Double priceGross,
            String currency
    ) {}
    public record PendingOrderResponse(String orderId, String status, String paymentMethodType, double totalGross, String referenceCode) {}
    public record HomeResponse(TenantSummaryResponse tenant, List<UpcomingBookingResponse> upcomingBookings, List<EntitlementResponse> activeEntitlements, List<PendingOrderResponse> pendingOrders) {}

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
            /** Tenant-set badge label shown on the guest Buy card (e.g. "Best value"). */
            String promoText,
            /** Validity in days; passed through so the Buy card can preview expiry. */
            Integer validityDays,
            /** Usage limit / pack count; null = unlimited. */
            Integer usageLimit
    ) {}
    public record AvailabilitySlotResponse(String slotId, String startsAt, String endsAt, boolean available) {}
    public record AvailabilityResponse(String sessionTypeId, String date, List<AvailabilitySlotResponse> slots) {}
    public record ConsultantResponse(String id, String firstName, String lastName, String email) {}

    public record CreateOrderRequest(String companyId, String productId, String slotId, String paymentMethodType) {}
    public record OrderSummaryResponse(String orderId, String status, String paymentMethodType, double subtotalGross, double taxAmount, double totalGross, String currency) {}
    public record BookingSummaryResponse(String bookingId, String bookingStatus) {}
    public record CreateOrderResponse(OrderSummaryResponse order, BookingSummaryResponse booking, String nextAction) {}

    public record CheckoutRequest(String paymentMethodType, Boolean saveCard, String useSavedPaymentMethodId) {}
    public record BankTransferInstructionsResponse(double amount, String currency, String referenceCode, String instructions) {}
    public record CheckoutResponse(String orderId, String paymentMethodType, String status, String checkoutUrl, BankTransferInstructionsResponse bankTransfer, String nextAction, String paymentIntentClientSecret, String customerId, String customerEphemeralKeySecret, String merchantDisplayName) {}

    public record WalletOrderResponse(
            String orderId,
            /** Order status: PENDING / PAID / CANCELLED. */
            String status,
            String paymentMethodType,
            double totalGross,
            String currency,
            String paidAt,
            String createdAt,
            /** Short order code (ORD-XXXXXXXX) shown as "Order #" in the Orders list. */
            String referenceCode,
            /** Product name so the row doesn't need a separate products lookup. */
            String productName,
            /** Product type (PACK / MEMBERSHIP / CLASS_TICKET / SESSION_SINGLE) for icon rendering. */
            String productType,
            /** Linked bill payment status when present: open / payment_pending / paid / cancelled. */
            String billPaymentStatus
    ) {}
    public record WalletResponse(List<EntitlementResponse> entitlements, List<WalletOrderResponse> orders) {}
    public record BookingHistoryItemResponse(String bookingId, String sessionTypeName, String startsAt, String bookingStatus) {}
    public record ToggleAutoRenewRequest(Boolean autoRenews) {}
    public record ToggleAutoRenewResponse(String entitlementId, boolean autoRenews) {}

    public record NotificationResponse(String notificationId, String notificationType, String title, String body, String readAt, String createdAt, String payloadJson) {}
    public record MarkAllReadResponse(int updatedCount) {}
    public record NotificationsResponse(List<NotificationResponse> items) {}

    public record ReadNotificationResponse(String notificationId, String readAt) {}
    public record DeviceTokenRequest(String platform, String pushToken, String locale) {}
    public record DeviceTokenResponse(boolean registered) {}

    public record BookingActionResponse(String bookingId, String bookingStatus, Boolean creditConsumed, String startsAt, String endsAt) {}
    public record CancelBookingRequest(String reason) {}
    public record RescheduleBookingRequest(String newSlotId) {}

    public record ReceiptResponse(String orderId, String downloadUrl, String type) {}
}
