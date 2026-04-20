package com.example.app.guest.common;

import java.util.List;

public final class GuestDtos {
    private GuestDtos() {}

    public record GuestUserResponse(String id, String email, String firstName, String lastName, String phone, String language) {}
    public record TenantSummaryResponse(String companyId, String companyName, String publicDescription, String publicCity, String publicPhone, String companyAddress, String status, boolean employeeSelectionStep) {}
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
            Boolean batchPaymentEnabled
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
    public record EntitlementResponse(String entitlementId, String productName, String entitlementType, Integer remainingUses, String validUntil, String status, String sessionTypeId, String sessionTypeName, boolean autoRenews) {}
    public record PendingOrderResponse(String orderId, String status, String paymentMethodType, double totalGross, String referenceCode) {}
    public record HomeResponse(TenantSummaryResponse tenant, List<UpcomingBookingResponse> upcomingBookings, List<EntitlementResponse> activeEntitlements, List<PendingOrderResponse> pendingOrders) {}

    public record ProductResponse(String productId, String name, String productType, double priceGross, String currency, String sessionTypeId, String sessionTypeName, boolean bookable, String description, Integer durationMinutes) {}
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

    public record WalletOrderResponse(String orderId, String status, String paymentMethodType, double totalGross, String paidAt) {}
    public record WalletResponse(List<EntitlementResponse> entitlements, List<WalletOrderResponse> orders) {}
    public record BookingHistoryItemResponse(String bookingId, String sessionTypeName, String startsAt, String bookingStatus) {}
    public record ToggleAutoRenewRequest(Boolean autoRenews) {}
    public record ToggleAutoRenewResponse(String entitlementId, boolean autoRenews) {}

    public record NotificationResponse(String notificationId, String notificationType, String title, String body, String readAt, String createdAt) {}
    public record NotificationsResponse(List<NotificationResponse> items) {}

    public record ReadNotificationResponse(String notificationId, String readAt) {}
    public record DeviceTokenRequest(String platform, String pushToken, String locale) {}
    public record DeviceTokenResponse(boolean registered) {}

    public record BookingActionResponse(String bookingId, String bookingStatus, Boolean creditConsumed, String startsAt, String endsAt) {}
    public record CancelBookingRequest(String reason) {}
    public record RescheduleBookingRequest(String newSlotId) {}

    public record ReceiptResponse(String orderId, String downloadUrl, String type) {}
}
