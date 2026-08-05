package com.example.app.workspacebooking;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.user.User;
import com.example.app.workspaceclient.WorkspaceClientAccessService;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/workspace-public-booking")
@PreAuthorize("hasRole('ADMIN')")
public class WorkspacePublicBookingAdminController {
    private static final Pattern SLUG = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$");
    private static final Pattern COLOR = Pattern.compile("^#[0-9A-Fa-f]{6}$");

    private final WorkspacePublicBookingSettingsRepository settings;
    private final CompanyRepository companies;
    private final LocationRepository locations;
    private final WorkspaceClientAccessService access;

    public WorkspacePublicBookingAdminController(
            WorkspacePublicBookingSettingsRepository settings,
            CompanyRepository companies,
            LocationRepository locations,
            WorkspaceClientAccessService access
    ) {
        this.settings = settings;
        this.companies = companies;
        this.locations = locations;
        this.access = access;
    }

    public record UnitInput(Long companyId, boolean enabled) {}
    public record LocationInput(Long locationId, boolean enabled) {}
    public record SettingsRequest(
            String slug,
            Boolean enabled,
            String locationSelectionMode,
            Boolean allowAnyLocation,
            Boolean showPrices,
            Boolean allowEmployeeSelection,
            String defaultLanguage,
            String primaryColor,
            String logoUrl,
            String pageTitle,
            String introduction,
            String confirmationText,
            String privacyUrl,
            String termsUrl,
            List<UnitInput> units,
            List<LocationInput> locations
    ) {}
    public record UnitResponse(Long companyId, String companyName, boolean enabled) {}
    public record LocationResponse(Long locationId, Long companyId, String companyName, String name, String address,
                                   String city, boolean active, boolean enabled) {}
    public record SettingsResponse(
            String slug,
            String publicUrl,
            boolean enabled,
            String locationSelectionMode,
            boolean allowAnyLocation,
            boolean showPrices,
            boolean allowEmployeeSelection,
            String defaultLanguage,
            String primaryColor,
            String logoUrl,
            String pageTitle,
            String introduction,
            String confirmationText,
            String privacyUrl,
            String termsUrl,
            List<UnitResponse> units,
            List<LocationResponse> locations
    ) {}

    @GetMapping
    @Transactional
    public SettingsResponse get(@AuthenticationPrincipal User me) {
        requireWorkspaceAdmin(me);
        return response(requireSettings(me), me);
    }

    @PutMapping
    @Transactional
    public SettingsResponse update(@RequestBody SettingsRequest request, @AuthenticationPrincipal User me) {
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Settings are required.");
        WorkspacePublicBookingSettings row = requireSettings(me);
        List<Company> workspaceCompanies = requireWorkspaceAdmin(me);
        List<Long> companyIds = workspaceCompanies.stream().map(Company::getId).toList();

        String slug = normalizeSlug(request.slug());
        if (settings.existsBySlugIgnoreCaseAndWorkspaceIdNot(slug, row.getWorkspace().getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This public booking slug is already in use.");
        }
        row.setSlug(slug);
        if (request.enabled() != null) row.setEnabled(request.enabled());
        row.setLocationSelectionMode(selectionMode(request.locationSelectionMode()));
        if (request.allowAnyLocation() != null) row.setAllowAnyLocation(request.allowAnyLocation());
        if (request.showPrices() != null) row.setShowPrices(request.showPrices());
        if (request.allowEmployeeSelection() != null) row.setAllowEmployeeSelection(request.allowEmployeeSelection());
        row.setDefaultLanguage(language(request.defaultLanguage()));
        row.setPrimaryColor(color(request.primaryColor()));
        row.setLogoUrl(trim(request.logoUrl(), 512));
        row.setPageTitle(trim(request.pageTitle(), 180));
        row.setIntroduction(trim(request.introduction(), 5000));
        row.setConfirmationText(trim(request.confirmationText(), 5000));
        row.setPrivacyUrl(url(request.privacyUrl()));
        row.setTermsUrl(url(request.termsUrl()));
        settings.save(row);

        if (request.units() != null) {
            for (UnitInput input : request.units()) {
                if (input == null || input.companyId() == null || !companyIds.contains(input.companyId())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid operating unit.");
                }
                Company company = companies.findById(input.companyId())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid operating unit."));
                company.setWorkspacePublicBookingEnabled(input.enabled());
                companies.save(company);
            }
        }
        if (request.locations() != null) {
            for (LocationInput input : request.locations()) {
                if (input == null || input.locationId() == null) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location.");
                }
                Location location = locations.findById(input.locationId())
                        .filter(value -> companyIds.contains(value.getCompany().getId()))
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location."));
                location.setPublicBookingEnabled(input.enabled());
                locations.save(location);
            }
        }
        return response(row, me);
    }

    private WorkspacePublicBookingSettings requireSettings(User me) {
        Long workspaceId = workspaceId(me);
        return settings.findByWorkspaceId(workspaceId).orElseGet(() -> {
            WorkspacePublicBookingSettings row = new WorkspacePublicBookingSettings();
            row.setWorkspace(me.getCompany().getWorkspace());
            row.setSlug("workspace-" + workspaceId);
            row.setPageTitle(me.getCompany().getWorkspace().getName());
            return settings.save(row);
        });
    }

    private SettingsResponse response(WorkspacePublicBookingSettings row, User me) {
        List<Company> workspaceCompanies = companies.findAllByWorkspaceIdOrderByNameAscIdAsc(workspaceId(me));
        List<Long> companyIds = workspaceCompanies.stream().map(Company::getId).toList();
        List<UnitResponse> unitRows = workspaceCompanies.stream()
                .sorted(java.util.Comparator.comparing(Company::getName, String.CASE_INSENSITIVE_ORDER))
                .map(company -> new UnitResponse(company.getId(), company.getName(), company.isWorkspacePublicBookingEnabled()))
                .toList();
        List<LocationResponse> locationRows = locations
                .findAllByCompanyIdInAndActiveTrueOrderByCompanyIdAscDefaultLocationDescNameAscIdAsc(companyIds)
                .stream()
                .map(location -> new LocationResponse(
                        location.getId(), location.getCompany().getId(), location.getCompany().getName(), location.getName(),
                        location.getAddress(), location.getCity(), location.isActive(), location.isPublicBookingEnabled()))
                .toList();
        return new SettingsResponse(
                row.getSlug(), "/book/" + row.getSlug(), row.isEnabled(), row.getLocationSelectionMode(),
                row.isAllowAnyLocation(), row.isShowPrices(), row.isAllowEmployeeSelection(), row.getDefaultLanguage(),
                row.getPrimaryColor(), row.getLogoUrl(), row.getPageTitle(), row.getIntroduction(),
                row.getConfirmationText(), row.getPrivacyUrl(), row.getTermsUrl(), unitRows, locationRows);
    }

    private List<Company> requireWorkspaceAdmin(User me) {
        List<Company> workspaceCompanies = companies.findAllByWorkspaceIdOrderByNameAscIdAsc(workspaceId(me));
        access.requireAdminForCompanies(me, workspaceCompanies.stream().map(Company::getId).toList());
        return workspaceCompanies;
    }

    private Long workspaceId(User me) {
        if (me == null || me.getCompany() == null || me.getCompany().getWorkspace() == null || me.getLoginAccount() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return me.getCompany().getWorkspace().getId();
    }

    private static String normalizeSlug(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (!SLUG.matcher(value).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Slug must contain 3-80 lowercase letters, numbers or hyphens.");
        }
        return value;
    }

    private static String selectionMode(String value) {
        String normalized = value == null ? "LOCATION_FIRST" : value.trim().toUpperCase(Locale.ROOT);
        if (!Objects.equals(normalized, "LOCATION_FIRST") && !Objects.equals(normalized, "SERVICE_FIRST")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid selection mode.");
        }
        return normalized;
    }

    private static String language(String value) {
        String normalized = value == null ? "sl" : value.trim().toLowerCase(Locale.ROOT);
        if (!List.of("sl", "en", "sr").contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid language.");
        }
        return normalized;
    }

    private static String color(String value) {
        String normalized = trim(value, 20);
        if (normalized != null && !COLOR.matcher(normalized).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Primary color must be a HEX value.");
        }
        return normalized;
    }

    private static String url(String value) {
        String normalized = trim(value, 512);
        if (normalized != null && !(normalized.startsWith("https://") || normalized.startsWith("http://"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Public links must use http or https.");
        }
        return normalized;
    }

    private static String trim(String value, int max) {
        if (value == null || value.trim().isEmpty()) return null;
        String normalized = value.trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max);
    }
}
