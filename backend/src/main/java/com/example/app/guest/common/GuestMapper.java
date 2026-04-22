package com.example.app.guest.common;

import com.example.app.company.Company;
import com.example.app.guest.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;

public final class GuestMapper {
    private static final ObjectMapper JSON = new ObjectMapper();
    private GuestMapper() {}

    public static GuestDtos.GuestUserResponse toGuestUser(GuestUser guestUser) {
        String picturePath = guestUser.getProfilePictureS3Key() == null || guestUser.getProfilePictureS3Key().isBlank()
                ? null
                : "/api/guest/profile/picture";
        return new GuestDtos.GuestUserResponse(
                String.valueOf(guestUser.getId()),
                guestUser.getEmail(),
                guestUser.getFirstName(),
                guestUser.getLastName(),
                guestUser.getPhone(),
                guestUser.getLanguage(),
                picturePath
        );
    }

    public static GuestDtos.TenantSummaryResponse toTenantSummary(
            GuestTenantLink link,
            GuestSettingsService.GuestPublicSettings settings,
            boolean requireOnlinePayment
    ) {
        Company company = link.getCompany();
        return new GuestDtos.TenantSummaryResponse(
                String.valueOf(company.getId()),
                displayCompanyName(company, settings),
                settings.publicDescription(),
                settings.publicCity(),
                settings.publicPhone(),
                displayCompanyAddressLine(settings),
                link.getStatus().name(),
                settings.employeeSelectionStep(),
                requireOnlinePayment
        );
    }

    public static GuestDtos.TenantSummaryResponse toTenantSummary(
            Company company,
            GuestSettingsService.GuestPublicSettings settings,
            boolean requireOnlinePayment
    ) {
        return new GuestDtos.TenantSummaryResponse(
                String.valueOf(company.getId()),
                displayCompanyName(company, settings),
                settings.publicDescription(),
                settings.publicCity(),
                settings.publicPhone(),
                displayCompanyAddressLine(settings),
                "ACTIVE",
                settings.employeeSelectionStep(),
                requireOnlinePayment
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
        boolean autoRenews = autoRenewSetting(entitlement);
        GuestProduct product = entitlement.getProduct();
        Integer totalUses = product == null ? null : product.getUsageLimit();
        Integer validityDays = product == null ? null : product.getValidityDays();
        Double priceGross = product == null || product.getPriceGross() == null
                ? null
                : product.getPriceGross().doubleValue();
        String currency = product == null ? null : product.getCurrency();
        return new GuestDtos.EntitlementResponse(
                String.valueOf(entitlement.getId()),
                product == null ? "" : product.getName(),
                entitlement.getEntitlementType().name(),
                entitlement.getRemainingUses(),
                totalUses,
                entitlement.getValidUntil() == null ? null : entitlement.getValidUntil().toString(),
                validityDays,
                entitlement.getStatus().name(),
                product == null || product.getSessionType() == null ? null : String.valueOf(product.getSessionType().getId()),
                product == null || product.getSessionType() == null ? null : product.getSessionType().getName(),
                autoRenews,
                entitlement.getDisplayCode(),
                priceGross,
                currency
        );
    }

    private static boolean autoRenewSetting(GuestEntitlement entitlement) {
        String raw = entitlement.getMetadataJson();
        if (raw != null && !raw.isBlank()) {
            try {
                JsonNode root = JSON.readTree(raw);
                if (root.has("autoRenews")) {
                    return root.path("autoRenews").asBoolean(false);
                }
            } catch (Exception ignore) {
            }
        }
        return entitlement.getProduct() != null && entitlement.getProduct().isAutoRenews();
    }

    public static GuestDtos.NotificationResponse toNotification(GuestNotification notification) {
        return new GuestDtos.NotificationResponse(
                String.valueOf(notification.getId()),
                notification.getNotificationType().name(),
                notification.getTitle(),
                notification.getBody(),
                notification.getReadAt() == null ? null : notification.getReadAt().toString(),
                notification.getCreatedAt().toString(),
                notification.getPayloadJson()
        );
    }

    public static Instant now() { return Instant.now(); }
}
