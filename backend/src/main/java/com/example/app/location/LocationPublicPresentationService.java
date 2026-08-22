package com.example.app.location;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Single source of truth for the public-facing identity of a physical location.
 *
 * <p>Location fields override legal/company branding. The company logo remains a
 * deliberate fallback because it is also used by invoices, e-mails and other
 * company-level channels. Public-name/address fields stored in company settings are
 * intentionally not consulted at runtime; the location record is authoritative.</p>
 */
@Service
public class LocationPublicPresentationService {
    private final AppSettingRepository settings;

    public LocationPublicPresentationService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public PublicPresentation resolve(Location location) {
        if (location == null) return null;
        Long companyId = location.getCompany() == null ? null : location.getCompany().getId();
        String companyLogoUrl = companyId == null ? null : settings.findByCompanyIdAndKey(companyId, SettingKey.COMPANY_LOGO_URL)
                .map(AppSetting::getValue)
                .map(LocationPublicPresentationService::trim)
                .orElse(null);
        return resolve(location, companyLogoUrl);
    }

    /** Allows bulk callers to fetch the company logo once and avoid an N+1 setting lookup. */
    public PublicPresentation resolve(Location location, String companyLogoUrl) {
        if (location == null) return null;

        String name = firstNonBlank(
                location.getPublicName(),
                location.getName(),
                location.getCompany() == null ? null : location.getCompany().getName(),
                "Location"
        );
        String address = firstNonBlank(location.getPublicAddress(), formatLocationAddress(location));
        String logoKey = trim(location.getPublicLogoS3Key());
        String logoUrl = logoKey == null ? trim(companyLogoUrl) : publicLogoPath(logoKey);

        return new PublicPresentation(
                location.getId(),
                location.getCompany() == null ? null : location.getCompany().getId(),
                name,
                address,
                trim(location.getPublicDescription()),
                trim(location.getPhone()),
                trim(location.getEmail()),
                logoUrl,
                logoKey,
                location.isPublicDirectoryEnabled(),
                location.isGuestAppDiscoverable(),
                location.isWebsitePresentationEnabled(),
                location.isPublicBookingEnabled(),
                location.isActive(),
                trim(location.getGooglePlaceId())
        );
    }

    public String companyLogoUrl(Long companyId) {
        if (companyId == null) return null;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.COMPANY_LOGO_URL)
                .map(AppSetting::getValue)
                .map(LocationPublicPresentationService::trim)
                .orElse(null);
    }

    public static String publicLogoPath(String objectKey) {
        String key = trim(objectKey);
        if (key == null) return null;
        return UriComponentsBuilder.fromPath("/api/public/widget/location-assets")
                .queryParam("key", key)
                .build()
                .encode()
                .toUriString();
    }

    static String formatLocationAddress(Location location) {
        if (location == null) return null;
        String street = trim(location.getAddress());
        String postal = trim(location.getPostalCode());
        String city = trim(location.getCity());
        String locality = joinSpace(postal, city);
        if (street == null) return locality;
        if (locality == null) return street;
        return street + ", " + locality;
    }

    private static String joinSpace(String left, String right) {
        String a = trim(left);
        String b = trim(right);
        if (a == null) return b;
        if (b == null) return a;
        return a + " " + b;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            String normalized = trim(value);
            if (normalized != null) return normalized;
        }
        return null;
    }

    private static String trim(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    public record PublicPresentation(
            Long locationId,
            Long companyId,
            String publicName,
            String publicAddress,
            String publicDescription,
            String publicPhone,
            String publicEmail,
            String publicLogoUrl,
            String publicLogoS3Key,
            boolean publicDirectoryEnabled,
            boolean guestAppDiscoverable,
            boolean websitePresentationEnabled,
            boolean publicBookingEnabled,
            boolean active,
            String googlePlaceId
    ) {}
}
