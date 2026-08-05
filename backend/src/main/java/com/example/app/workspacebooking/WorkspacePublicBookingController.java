package com.example.app.workspacebooking;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.widget.WidgetPublicAuditLogger;
import com.example.app.workspacesubscription.WorkspaceFeature;
import com.example.app.workspacesubscription.WorkspaceSubscriptionService;
import com.example.app.widget.WidgetRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/public/widget/workspaces")
public class WorkspacePublicBookingController {
    private final WorkspacePublicBookingSettingsRepository settings;
    private final CompanyRepository companies;
    private final LocationRepository locations;
    private final SessionTypeRepository sessionTypes;
    private final WorkspacePublicBookingTokenService tokens;
    private final WidgetRateLimiter rateLimiter;
    private final WidgetPublicAuditLogger audit;
    private WorkspaceSubscriptionService workspaceSubscriptions;

    public WorkspacePublicBookingController(
            WorkspacePublicBookingSettingsRepository settings,
            CompanyRepository companies,
            LocationRepository locations,
            SessionTypeRepository sessionTypes,
            WorkspacePublicBookingTokenService tokens,
            WidgetRateLimiter rateLimiter,
            WidgetPublicAuditLogger audit
    ) {
        this.settings = settings;
        this.companies = companies;
        this.locations = locations;
        this.sessionTypes = sessionTypes;
        this.tokens = tokens;
        this.rateLimiter = rateLimiter;
        this.audit = audit;
    }

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void configureWorkspaceSubscriptions(WorkspaceSubscriptionService workspaceSubscriptions) {
        this.workspaceSubscriptions = workspaceSubscriptions;
    }

    public record ConfigResponse(
            String slug,
            String workspaceName,
            String pageTitle,
            String introduction,
            String confirmationText,
            String primaryColor,
            String logoUrl,
            String defaultLanguage,
            String locationSelectionMode,
            boolean allowAnyLocation,
            boolean showPrices,
            boolean allowEmployeeSelection,
            String privacyUrl,
            String termsUrl
    ) {}

    public record LocationResponse(
            String token,
            String unitName,
            String locationName,
            String address,
            String postalCode,
            String city,
            String timezone,
            String phone,
            String email
    ) {}

    public record OfferingResponse(
            String token,
            String locationToken,
            String unitName,
            String locationName,
            String localServiceName,
            Integer durationMinutes,
            BigDecimal priceGross,
            String currency
    ) {}

    public record ServiceResponse(
            String key,
            String name,
            String description,
            String bookingInstructions,
            Integer defaultDurationMinutes,
            String color,
            String icon,
            BigDecimal fromPriceGross,
            String currency,
            List<OfferingResponse> offerings
    ) {}

    public record LaunchRequest(String locationToken, String offeringToken, String locale) {}
    public record LaunchResponse(String bookingUrl) {}

    @GetMapping("/{slug}/config")
    @Transactional(readOnly = true)
    public ConfigResponse config(@PathVariable String slug, HttpServletRequest request) {
        WorkspacePublicBookingSettings row = requirePublicSettings(slug, request, false);
        return new ConfigResponse(
                row.getSlug(), row.getWorkspace().getName(), first(row.getPageTitle(), row.getWorkspace().getName()),
                row.getIntroduction(), row.getConfirmationText(), row.getPrimaryColor(), row.getLogoUrl(),
                row.getDefaultLanguage(), row.getLocationSelectionMode(), row.isAllowAnyLocation(),
                row.isShowPrices(), row.isAllowEmployeeSelection(), row.getPrivacyUrl(), row.getTermsUrl());
    }

    @GetMapping("/{slug}/locations")
    @Transactional(readOnly = true)
    public List<LocationResponse> locations(@PathVariable String slug, HttpServletRequest request) {
        WorkspacePublicBookingSettings row = requirePublicSettings(slug, request, false);
        return publicLocations(row).stream().map(location -> new LocationResponse(
                tokens.issue("location", row.getWorkspace().getId(), location.getCompany().getId(), location.getId()),
                location.getCompany().getName(), location.getName(), location.getAddress(), location.getPostalCode(),
                location.getCity(), location.getTimezone(), location.getPhone(), location.getEmail())).toList();
    }

    @GetMapping("/{slug}/services")
    @Transactional(readOnly = true)
    public List<ServiceResponse> services(@PathVariable String slug, HttpServletRequest request) {
        WorkspacePublicBookingSettings row = requirePublicSettings(slug, request, false);
        List<Location> publicLocations = publicLocations(row);
        Map<Long, List<Location>> locationsByCompany = new LinkedHashMap<>();
        publicLocations.forEach(location -> locationsByCompany
                .computeIfAbsent(location.getCompany().getId(), ignored -> new ArrayList<>()).add(location));

        Map<String, ServiceAccumulator> grouped = new LinkedHashMap<>();
        for (Company company : publicCompanies(row)) {
            List<Location> unitLocations = locationsByCompany.getOrDefault(company.getId(), List.of());
            if (unitLocations.isEmpty()) continue;
            for (SessionType type : sessionTypes.findAllWithLinkedServicesByCompanyId(company.getId())) {
                if (!isPublic(type)) continue;
                String groupKey = type.getWorkspaceServiceTemplate() == null
                        ? "offering-" + type.getId()
                        : "template-" + type.getWorkspaceServiceTemplate().getId();
                String name = type.getWorkspaceServiceTemplate() == null
                        ? type.getName() : type.getWorkspaceServiceTemplate().getName();
                String description = type.getWorkspaceServiceTemplate() == null
                        ? type.getDescription() : type.getWorkspaceServiceTemplate().getDescription();
                String instructions = type.getWorkspaceServiceTemplate() == null
                        ? null : type.getWorkspaceServiceTemplate().getBookingInstructions();
                Integer defaultDuration = type.getWorkspaceServiceTemplate() == null
                        ? type.getDurationMinutes() : type.getWorkspaceServiceTemplate().getDefaultDurationMinutes();
                String color = type.getWorkspaceServiceTemplate() == null
                        ? type.getColor() : type.getWorkspaceServiceTemplate().getColor();
                String icon = type.getWorkspaceServiceTemplate() == null
                        ? null : type.getWorkspaceServiceTemplate().getIcon();
                ServiceAccumulator accumulator = grouped.computeIfAbsent(groupKey,
                        ignored -> new ServiceAccumulator(groupKey, name, description, instructions, defaultDuration, color, icon));
                BigDecimal price = priceGross(type);
                for (Location location : unitLocations) {
                    if (!availableAt(type, location.getId())) continue;
                    String locationToken = tokens.issue("location", row.getWorkspace().getId(), company.getId(), location.getId());
                    String offeringToken = tokens.issue("offering", row.getWorkspace().getId(), company.getId(), type.getId());
                    accumulator.offerings.add(new OfferingResponse(
                            offeringToken, locationToken, company.getName(), location.getName(), type.getName(),
                            duration(type), row.isShowPrices() ? price : null, "EUR"));
                    if (price != null && (accumulator.fromPrice == null || price.compareTo(accumulator.fromPrice) < 0)) {
                        accumulator.fromPrice = price;
                    }
                }
            }
        }
        return grouped.values().stream()
                .filter(value -> !value.offerings.isEmpty())
                .sorted(Comparator.comparing(value -> value.name, String.CASE_INSENSITIVE_ORDER))
                .map(value -> new ServiceResponse(
                        value.key, value.name, value.description, value.instructions, value.defaultDuration,
                        value.color, value.icon, row.isShowPrices() ? value.fromPrice : null, "EUR",
                        value.offerings.stream()
                                .sorted(Comparator.comparing(OfferingResponse::locationName, String.CASE_INSENSITIVE_ORDER)
                                        .thenComparing(OfferingResponse::unitName, String.CASE_INSENSITIVE_ORDER))
                                .toList()))
                .toList();
    }

    @PostMapping("/{slug}/launch")
    @Transactional(readOnly = true)
    public LaunchResponse launch(
            @PathVariable String slug,
            @RequestBody LaunchRequest request,
            HttpServletRequest httpRequest
    ) {
        WorkspacePublicBookingSettings row = requirePublicSettings(slug, httpRequest, true);
        if (request == null || request.locationToken() == null || request.offeringToken() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location and service are required.");
        }
        var locationPayload = tokens.require(request.locationToken(), "location", row.getWorkspace().getId());
        var offeringPayload = tokens.require(request.offeringToken(), "offering", row.getWorkspace().getId());
        if (!Objects.equals(locationPayload.companyId(), offeringPayload.companyId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The selected service is not offered at this location.");
        }
        Company company = companies.findById(locationPayload.companyId())
                .filter(value -> value.getWorkspace().getId().equals(row.getWorkspace().getId()))
                .filter(Company::isWorkspacePublicBookingEnabled)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Location location = locations.findByIdAndCompanyId(locationPayload.entityId(), company.getId())
                .filter(Location::isActive).filter(Location::isPublicBookingEnabled)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        SessionType type = sessionTypes.findByIdAndCompanyIdWithLinkedServices(offeringPayload.entityId(), company.getId())
                .filter(this::isPublic)
                .filter(value -> availableAt(value, location.getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "The selected service is not offered at this location."));
        String language = request.locale() == null ? row.getDefaultLanguage() : request.locale().trim().toLowerCase();
        if (!List.of("sl", "en", "sr").contains(language)) language = row.getDefaultLanguage();
        String tenantCode = company.getTenantCode();
        if (tenantCode == null || tenantCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The selected unit has no public booking code.");
        }
        String bookingUrl = "/widget/" + tenantCode + "?lang=" + language
                + "&locationId=" + location.getId() + "&typeId=" + type.getId()
                + "&workspace=" + row.getSlug();
        if (!row.isAllowEmployeeSelection()) bookingUrl += "&workspaceEmployeeSelection=0";
        if (!row.isShowPrices()) bookingUrl += "&workspaceShowPrices=0";
        return new LaunchResponse(bookingUrl);
    }

    private WorkspacePublicBookingSettings requirePublicSettings(String slug, HttpServletRequest request, boolean booking) {
        String normalized = slug == null ? "" : slug.trim();
        rateLimiter.check("workspace:" + normalized, audit.clientIp(request), booking);
        WorkspacePublicBookingSettings row = settings.findBySlugIgnoreCase(normalized)
                .filter(WorkspacePublicBookingSettings::isEnabled)
                .filter(value -> value.getWorkspace().isActive())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (workspaceSubscriptions != null) {
            var subscription = workspaceSubscriptions.requireForWorkspace(row.getWorkspace().getId());
            if (!workspaceSubscriptions.hasFeature(subscription, WorkspaceFeature.WORKSPACE_PUBLIC_BOOKING)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            }
        }
        return row;
    }

    private List<Company> publicCompanies(WorkspacePublicBookingSettings row) {
        return companies.findAllByWorkspaceIdOrderByNameAscIdAsc(row.getWorkspace().getId()).stream()
                .filter(Company::isWorkspacePublicBookingEnabled)
                .filter(company -> company.getTenantCode() != null && !company.getTenantCode().isBlank())
                .toList();
    }

    private List<Location> publicLocations(WorkspacePublicBookingSettings row) {
        List<Long> companyIds = publicCompanies(row).stream().map(Company::getId).toList();
        if (companyIds.isEmpty()) return List.of();
        return locations.findAllByCompanyIdInAndActiveTrueOrderByCompanyIdAscDefaultLocationDescNameAscIdAsc(companyIds)
                .stream().filter(Location::isPublicBookingEnabled).toList();
    }

    private boolean isPublic(SessionType type) {
        return type != null && type.isActive() && type.isWidgetGroupBookingEnabled();
    }

    private boolean availableAt(SessionType type, Long locationId) {
        return type.isAvailableAllLocations() || type.getLocations().stream()
                .anyMatch(location -> Objects.equals(location.getId(), locationId));
    }

    private static Integer duration(SessionType type) {
        return type.getDurationMinutes() == null || type.getDurationMinutes() <= 0 ? 60 : type.getDurationMinutes();
    }

    private static BigDecimal priceGross(SessionType type) {
        if (type.getLinkedServices() == null || type.getLinkedServices().isEmpty()) return null;
        BigDecimal total = BigDecimal.ZERO;
        boolean found = false;
        for (var link : type.getLinkedServices()) {
            if (link == null || link.getTransactionService() == null) continue;
            BigDecimal net = link.getPrice() == null ? link.getTransactionService().getNetPrice() : link.getPrice();
            if (net == null) continue;
            BigDecimal multiplier = link.getTransactionService().getTaxRate() == null
                    ? BigDecimal.ZERO : link.getTransactionService().getTaxRate().multiplier;
            total = total.add(net.add(net.multiply(multiplier)).setScale(2, RoundingMode.HALF_UP));
            found = true;
        }
        return found ? total.setScale(2, RoundingMode.HALF_UP) : null;
    }

    private static String first(String first, String fallback) {
        return first == null || first.isBlank() ? fallback : first;
    }

    private static final class ServiceAccumulator {
        private final String key;
        private final String name;
        private final String description;
        private final String instructions;
        private final Integer defaultDuration;
        private final String color;
        private final String icon;
        private final List<OfferingResponse> offerings = new ArrayList<>();
        private BigDecimal fromPrice;

        private ServiceAccumulator(String key, String name, String description, String instructions,
                                   Integer defaultDuration, String color, String icon) {
            this.key = key;
            this.name = name;
            this.description = description;
            this.instructions = instructions;
            this.defaultDuration = defaultDuration;
            this.color = color;
            this.icon = icon;
        }
    }
}
