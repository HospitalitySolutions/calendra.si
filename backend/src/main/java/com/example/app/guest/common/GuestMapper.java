package com.example.app.guest.common;

import com.example.app.company.Company;
import com.example.app.guest.model.*;
import java.time.Instant;

public final class GuestMapper {
    private GuestMapper() {}

    public static GuestDtos.GuestUserResponse toGuestUser(GuestUser guestUser) {
        return new GuestDtos.GuestUserResponse(
                String.valueOf(guestUser.getId()),
                guestUser.getEmail(),
                guestUser.getFirstName(),
                guestUser.getLastName(),
                guestUser.getPhone(),
                guestUser.getLanguage()
        );
    }

    public static GuestDtos.TenantSummaryResponse toTenantSummary(GuestTenantLink link, String publicDescription, String publicCity, String publicPhone) {
        Company company = link.getCompany();
        return new GuestDtos.TenantSummaryResponse(
                String.valueOf(company.getId()),
                company.getName(),
                publicDescription,
                publicCity,
                publicPhone,
                link.getStatus().name()
        );
    }

    public static GuestDtos.TenantSummaryResponse toTenantSummary(Company company, String publicDescription, String publicCity, String publicPhone) {
        return new GuestDtos.TenantSummaryResponse(
                String.valueOf(company.getId()),
                company.getName(),
                publicDescription,
                publicCity,
                publicPhone,
                "ACTIVE"
        );
    }

    public static GuestDtos.EntitlementResponse toEntitlement(GuestEntitlement entitlement) {
        return new GuestDtos.EntitlementResponse(
                String.valueOf(entitlement.getId()),
                entitlement.getProduct().getName(),
                entitlement.getEntitlementType().name(),
                entitlement.getRemainingUses(),
                entitlement.getValidUntil() == null ? null : entitlement.getValidUntil().toString(),
                entitlement.getStatus().name()
        );
    }

    public static GuestDtos.NotificationResponse toNotification(GuestNotification notification) {
        return new GuestDtos.NotificationResponse(
                String.valueOf(notification.getId()),
                notification.getNotificationType().name(),
                notification.getTitle(),
                notification.getBody(),
                notification.getReadAt() == null ? null : notification.getReadAt().toString(),
                notification.getCreatedAt().toString()
        );
    }

    public static Instant now() { return Instant.now(); }
}
