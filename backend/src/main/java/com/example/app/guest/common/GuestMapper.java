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

    public static GuestDtos.TenantSummaryResponse toTenantSummary(GuestTenantLink link, GuestSettingsService.GuestPublicSettings settings) {
        Company company = link.getCompany();
        return new GuestDtos.TenantSummaryResponse(
                String.valueOf(company.getId()),
                displayCompanyName(company, settings),
                settings.publicDescription(),
                settings.publicCity(),
                settings.publicPhone(),
                displayCompanyAddressLine(settings),
                link.getStatus().name()
        );
    }

    public static GuestDtos.TenantSummaryResponse toTenantSummary(Company company, GuestSettingsService.GuestPublicSettings settings) {
        return new GuestDtos.TenantSummaryResponse(
                String.valueOf(company.getId()),
                displayCompanyName(company, settings),
                settings.publicDescription(),
                settings.publicCity(),
                settings.publicPhone(),
                displayCompanyAddressLine(settings),
                "ACTIVE"
        );
    }

    /** Invoice / billing "Company name", then guest public name, then DB tenancy name. */
    public static String displayCompanyName(Company company, GuestSettingsService.GuestPublicSettings settings) {
        if (settings.invoiceCompanyName() != null && !settings.invoiceCompanyName().isBlank()) {
            return settings.invoiceCompanyName().trim();
        }
        if (settings.publicName() != null && !settings.publicName().isBlank()) {
            return settings.publicName().trim();
        }
        return company.getName();
    }

    public static String displayCompanyAddressLine(GuestSettingsService.GuestPublicSettings settings) {
        if (settings.companyAddress() != null && !settings.companyAddress().isBlank()) {
            return settings.companyAddress().trim();
        }
        if (settings.publicCity() != null && !settings.publicCity().isBlank()) {
            return settings.publicCity().trim();
        }
        return null;
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
