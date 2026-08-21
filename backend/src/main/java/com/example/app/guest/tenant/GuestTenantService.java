package com.example.app.guest.tenant;

import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.client.Client;
import com.example.app.client.ClientAnonymizationService;
import com.example.app.client.ClientRemovalGuard;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.commerce.CommerceLocationScopeService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.*;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.stripe.StripeConnectService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestTenantService {
    private final CompanyRepository companies;
    private final ClientRepository clients;
    private final UserRepository users;
    private final GuestTenantLinkRepository links;
    private final TenantInviteRepository invites;
    private final GuestSettingsService guestSettings;
    private final StripeConnectService stripeConnectService;
    private final ClientRemovalGuard clientRemovalGuard;
    private final ClientAnonymizationService clientAnonymizationService;
    private final GuestLocationAccessService guestLocations;
    private final LocationPublicPresentationService locationPresentations;

    /**
     * Location subscription persistence is optional only to keep isolated unit tests/backwards
     * compatibility constructors working. In the application context it is always present.
     */
    @Autowired(required = false)
    private GuestLocationSubscriptionRepository locationSubscriptions;

    @Autowired(required = false)
    private GuestProviderLinkService guestProviderLinks;

    @Autowired(required = false)
    private PaymentMethodRepository paymentMethods;

    @Autowired(required = false)
    private CommerceLocationScopeService commerceLocations;

    @Autowired
    public GuestTenantService(
            CompanyRepository companies,
            ClientRepository clients,
            UserRepository users,
            GuestTenantLinkRepository links,
            TenantInviteRepository invites,
            GuestSettingsService guestSettings,
            StripeConnectService stripeConnectService,
            ClientRemovalGuard clientRemovalGuard,
            ClientAnonymizationService clientAnonymizationService,
            GuestLocationAccessService guestLocations,
            LocationPublicPresentationService locationPresentations
    ) {
        this.companies = companies;
        this.clients = clients;
        this.users = users;
        this.links = links;
        this.invites = invites;
        this.guestSettings = guestSettings;
        this.stripeConnectService = stripeConnectService;
        this.clientRemovalGuard = clientRemovalGuard;
        this.clientAnonymizationService = clientAnonymizationService;
        this.guestLocations = guestLocations;
        this.locationPresentations = locationPresentations;
    }


    public GuestDtos.TenantLookupResponse resolveByCode(String tenantCode) {
        CodeResolution resolution = resolveCodeTarget(tenantCode);
        Company company = resolution.company();
        var settings = guestSettings.publicSettings(company.getId());
        List<GuestDtos.TenantSummaryResponse> locations = resolution.location() == null
                ? locationSummaries(company, "ACTIVE")
                : List.of(toLocationSummary(resolution.location(), settings, "ACTIVE"));
        return new GuestDtos.TenantLookupResponse(
                String.valueOf(company.getId()),
                GuestMapper.displayCompanyName(company, settings),
                null,
                settings.companyCity(),
                settings.companyPhone(),
                GuestMapper.displayCompanyAddressLine(settings),
                settings.tenantType(),
                settings.cardImageUrl(),
                settings.companyLogoUrl(),
                settings.iconImageUrl(),
                GuestJoinMethod.TENANT_CODE.name(),
                settings.guestAppEnabled(),
                settings.employeeSelectionStep(),
                settings.useEmployeeContact(),
                settings.cancellationAllowed(),
                settings.modificationAllowed(),
                locations
        );
    }

    public GuestDtos.TenantLookupResponse resolveInvite(String code) {
        TenantInvite invite = invites.findByCodeIgnoreCase(code)
                .filter(TenantInvite::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invite not found."));
        if (invite.getExpiresAt() != null && invite.getExpiresAt().isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.GONE, "Invite expired.");
        }
        Company company = invite.getCompany();
        var settings = guestSettings.publicSettings(company.getId());
        return new GuestDtos.TenantLookupResponse(
                String.valueOf(company.getId()),
                GuestMapper.displayCompanyName(company, settings),
                null,
                settings.companyCity(),
                settings.companyPhone(),
                GuestMapper.displayCompanyAddressLine(settings),
                settings.tenantType(),
                settings.cardImageUrl(),
                settings.companyLogoUrl(),
                settings.iconImageUrl(),
                GuestJoinMethod.INVITE_LINK.name(),
                settings.guestAppEnabled(),
                settings.employeeSelectionStep(),
                settings.useEmployeeContact(),
                settings.cancellationAllowed(),
                settings.modificationAllowed(),
                locationSummaries(company, "ACTIVE")
        );
    }

    public List<GuestDtos.TenantSummaryResponse> search(String query, String tenantType) {
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        String normalizedType = normalizeTenantType(tenantType);

        List<GuestDtos.TenantSummaryResponse> out = new ArrayList<>();
        for (Location location : guestLocations.discoverableLocations()) {
            Company company = location.getCompany();
            if (company == null) continue;
            var settings = guestSettings.publicSettings(company.getId());
            if (!settings.guestAppEnabled()) continue;
            if (normalizedType != null && !normalizedType.equals(normalizeTenantType(settings.tenantType()))) continue;
            var presentation = locationPresentations.resolve(location);
            if (!matchesLocationSearch(normalizedQuery, company, location, presentation)) continue;
            out.add(toLocationSummary(location, settings, "ACTIVE"));
        }
        out.sort(Comparator
                .comparing(GuestDtos.TenantSummaryResponse::companyName, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(item -> item.locationId() == null ? "" : item.locationId()));
        return out;
    }

    @Transactional
    public GuestDtos.JoinTenantResponse join(GuestUser guestUser, GuestDtos.JoinTenantRequest request) {
        GuestJoinMethod joinMethod = parseJoinMethod(request.joinMethod());
        Company company = resolveCompanyForJoin(joinMethod, request);
        var publicSettings = guestSettings.publicSettings(company.getId());
        if (!publicSettings.guestAppEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Guest app is disabled for this tenant.");
        }

        Location selectedLocation = resolveJoinLocation(company, joinMethod, request);
        Long selectedLocationId = selectedLocation == null ? null : selectedLocation.getId();

        if (guestProviderLinks != null) {
            GuestProviderLinkService.LinkResult linked = guestProviderLinks.activate(
                    guestUser, company, selectedLocation, joinMethod, guestUser.getLanguage(), null);
            incrementInviteUsage(joinMethod, request);
            return new GuestDtos.JoinTenantResponse(
                    new GuestDtos.TenantLinkResponse(
                            String.valueOf(company.getId()),
                            String.valueOf(linked.client().getId()),
                            linked.tenantLink().getStatus().name(),
                            linked.tenantLink().getJoinedVia().name()),
                    linked.matchType() != GuestProviderLinkService.MatchType.CREATED,
                    linked.matchType().name(),
                    selectedLocationId == null ? null : String.valueOf(selectedLocationId)
            );
        }

        GuestTenantLink existing = links.findByGuestUserIdAndCompanyId(guestUser.getId(), company.getId()).orElse(null);
        MatchResult match = existing == null
                ? matchOrCreateClient(company, guestUser)
                : resolveClientForExistingLink(existing, company, guestUser);
        if (!match.client().isAnonymized() && !match.client().isActive()) {
            match.client().setActive(true);
        }
        GuestTenantLink link = existing != null ? existing : new GuestTenantLink();
        link.setGuestUser(guestUser);
        link.setCompany(company);
        link.setClient(match.client());
        link.setStatus(GuestTenantLinkStatus.ACTIVE);
        link.setJoinedVia(joinMethod);
        link.setJoinedAt(existing != null ? existing.getJoinedAt() : Instant.now());
        link.setLastUsedAt(Instant.now());
        link = links.save(link);
        activateLocationSubscription(link, selectedLocation, joinMethod);

        incrementInviteUsage(joinMethod, request);

        return new GuestDtos.JoinTenantResponse(
                new GuestDtos.TenantLinkResponse(String.valueOf(company.getId()), String.valueOf(match.client().getId()), link.getStatus().name(), link.getJoinedVia().name()),
                match.matchType() != MatchType.CREATED,
                match.matchType().name(),
                selectedLocationId == null ? null : String.valueOf(selectedLocationId)
        );
    }

    private void incrementInviteUsage(GuestJoinMethod joinMethod, GuestDtos.JoinTenantRequest request) {
        if (joinMethod != GuestJoinMethod.INVITE_LINK && joinMethod != GuestJoinMethod.QR_CODE) return;
        String inviteCode = request == null ? null : request.inviteCode();
        if (inviteCode == null || inviteCode.isBlank()) return;
        invites.findByCodeIgnoreCase(inviteCode).ifPresent(invite -> {
            invite.setUsedCount(invite.getUsedCount() + 1);
            invites.save(invite);
        });
    }

    public List<GuestDtos.TenantSummaryResponse> linkedTenants(GuestUser guestUser) {
        return links.findAllByGuestUserIdOrderByUpdatedAtDesc(guestUser.getId()).stream()
                .filter(link -> link.getStatus() == GuestTenantLinkStatus.ACTIVE)
                .filter(this::hasActiveLocationSubscription)
                .map(link -> {
                    var settings = guestSettings.publicSettings(link.getCompany().getId());
                    var rules = guestSettings.bookingRules(link.getCompany().getId());
                    return GuestMapper.toTenantSummary(
                            link,
                            settings,
                            rules.requireOnlinePayment(),
                            rules.paymentRequirement(),
                            rules.depositPercent(),
                            selectablePaymentMethods(link.getCompany())
                    );
                })
                .toList();
    }

    /**
     * Concrete provider locations subscribed by the signed-in guest. The company/client
     * bridge remains internal so wallet, inbox and billing can keep one client identity per
     * company, while Guest App discovery is strictly location-scoped.
     */
    public List<GuestDtos.TenantSummaryResponse> providers(GuestUser guestUser) {
        if (locationSubscriptions == null) {
            // Compatibility path for isolated tests/older contexts.
            List<GuestTenantLink> activeLinks = links.findAllByGuestUserIdOrderByUpdatedAtDesc(guestUser.getId()).stream()
                    .filter(link -> link.getStatus() == GuestTenantLinkStatus.ACTIVE)
                    .toList();
            List<Long> companyIds = activeLinks.stream()
                    .map(link -> link.getCompany() == null ? null : link.getCompany().getId())
                    .filter(Objects::nonNull)
                    .distinct()
                    .toList();
            if (companyIds.isEmpty()) return List.of();
            java.util.Map<Long, GuestTenantLink> linkByCompany = activeLinks.stream()
                    .filter(link -> link.getCompany() != null && link.getCompany().getId() != null)
                    .collect(java.util.stream.Collectors.toMap(
                            link -> link.getCompany().getId(),
                            link -> link,
                            (first, ignored) -> first,
                            java.util.LinkedHashMap::new
                    ));
            List<GuestDtos.TenantSummaryResponse> out = new ArrayList<>();
            for (Location location : guestLocations.discoverableLocations(companyIds)) {
                if (location.getCompany() == null) continue;
                GuestTenantLink link = linkByCompany.get(location.getCompany().getId());
                if (link == null) continue;
                var settings = guestSettings.publicSettings(location.getCompany().getId());
                if (!settings.guestAppEnabled()) continue;
                out.add(toLocationSummary(location, settings, link.getStatus().name()));
            }
            return out;
        }

        List<GuestDtos.TenantSummaryResponse> out = new ArrayList<>();
        java.util.Set<Long> seenLocations = new java.util.LinkedHashSet<>();
        for (GuestLocationSubscription subscription : locationSubscriptions.findAllActiveForGuest(
                guestUser.getId(), GuestTenantLinkStatus.ACTIVE, GuestTenantLinkStatus.ACTIVE)) {
            Location location = subscription.getLocation();
            if (location == null || location.getId() == null || !seenLocations.add(location.getId())) continue;
            if (!location.isActive() || !location.isGuestAppDiscoverable() || location.getCompany() == null) continue;
            var settings = guestSettings.publicSettings(location.getCompany().getId());
            if (!settings.guestAppEnabled()) continue;
            out.add(toLocationSummary(location, settings, GuestTenantLinkStatus.ACTIVE.name()));
        }
        return out;
    }

    @Transactional
    public GuestDtos.TenantLinkResponse unsubscribe(GuestUser guestUser, Long companyId) {
        GuestTenantLink link = requireLink(guestUser, companyId);
        enforceClientRemovalAllowed(link.getClient(), "Cannot unsubscribe while active sessions or entitlements exist.");
        link.setStatus(GuestTenantLinkStatus.LEFT);
        link.setLastUsedAt(Instant.now());
        deactivateLocationSubscriptions(link);
        Client client = link.getClient();
        client.setActive(false);
        links.save(link);
        return new GuestDtos.TenantLinkResponse(
                String.valueOf(link.getCompany().getId()),
                String.valueOf(client.getId()),
                link.getStatus().name(),
                link.getJoinedVia().name()
        );
    }

    @Transactional
    public GuestDtos.TenantLinkResponse anonymize(GuestUser guestUser, Long companyId) {
        GuestTenantLink link = requireLink(guestUser, companyId);
        enforceClientRemovalAllowed(link.getClient(), "Cannot anonymize while active sessions or entitlements exist.");
        Client client = clientAnonymizationService.anonymizeForGuest(link.getClient(), guestUser.getId());
        client.setActive(false);
        link.setClient(client);
        link.setStatus(GuestTenantLinkStatus.LEFT);
        link.setLastUsedAt(Instant.now());
        deactivateLocationSubscriptions(link);
        links.save(link);
        return new GuestDtos.TenantLinkResponse(
                String.valueOf(link.getCompany().getId()),
                String.valueOf(client.getId()),
                link.getStatus().name(),
                link.getJoinedVia().name()
        );
    }

    public GuestTenantLink requireLink(GuestUser guestUser, Long companyId) {
        return links.findByGuestUserIdAndCompanyId(guestUser.getId(), companyId)
                .filter(link -> link.getStatus() == GuestTenantLinkStatus.ACTIVE)
                .filter(this::hasActiveLocationSubscription)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider subscription not found."));
    }

    public GuestTenantLink requireLocationSubscription(GuestUser guestUser, Long companyId, Long locationId) {
        GuestTenantLink link = requireLink(guestUser, companyId);
        if (locationId == null || locationSubscriptions == null) return link;
        if (!locationSubscriptions.existsByTenantLinkIdAndLocationIdAndStatus(
                link.getId(), locationId, GuestTenantLinkStatus.ACTIVE)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This location is not subscribed in the guest app.");
        }
        return link;
    }

    public List<Long> subscribedLocationIds(GuestUser guestUser, Long companyId) {
        if (guestUser == null || companyId == null) return List.of();
        GuestTenantLink link = links.findByGuestUserIdAndCompanyId(guestUser.getId(), companyId)
                .filter(row -> row.getStatus() == GuestTenantLinkStatus.ACTIVE)
                .orElse(null);
        if (link == null) return List.of();
        if (locationSubscriptions == null) {
            return guestLocations.discoverableLocations(companyId).stream().map(Location::getId).toList();
        }
        return locationSubscriptions.findAllByTenantLinkIdAndStatusOrderByUpdatedAtDesc(
                        link.getId(), GuestTenantLinkStatus.ACTIVE).stream()
                .map(GuestLocationSubscription::getLocation)
                .filter(Objects::nonNull)
                .filter(location -> location.isActive() && location.isGuestAppDiscoverable())
                .map(Location::getId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }


    private List<GuestDtos.TenantSummaryResponse> locationSummaries(Company company, String status) {
        if (company == null) return List.of();
        var settings = guestSettings.publicSettings(company.getId());
        if (!settings.guestAppEnabled()) return List.of();
        return guestLocations.discoverableLocations(company.getId()).stream()
                .map(location -> toLocationSummary(location, settings, status))
                .toList();
    }

    private GuestDtos.TenantSummaryResponse toLocationSummary(
            Location location,
            GuestSettingsService.GuestPublicSettings settings,
            String status
    ) {
        var rules = guestSettings.bookingRules(location.getCompany().getId());
        return GuestMapper.toLocationSummary(
                location,
                settings,
                locationPresentations,
                rules.requireOnlinePayment(),
                rules.paymentRequirement(),
                rules.depositPercent(),
                selectablePaymentMethods(location.getCompany(), location),
                status
        );
    }

    private Location resolveJoinLocation(Company company, GuestJoinMethod joinMethod, GuestDtos.JoinTenantRequest request) {
        if (company == null) return null;
        if (request.locationId() != null && !request.locationId().isBlank()) {
            return guestLocations.requireDiscoverable(company.getId(), parseId(request.locationId()));
        }
        if (joinMethod == GuestJoinMethod.TENANT_CODE) {
            CodeResolution resolution = resolveCodeTarget(request.tenantCode());
            if (resolution.location() != null) return resolution.location();
        }
        List<Location> visible = guestLocations.discoverableLocations(company.getId());
        if (visible.size() == 1) return visible.get(0);
        // Before location subscriptions were introduced a company code could create a company-wide
        // membership. Keep that only for isolated legacy/unit-test contexts; production requires
        // an unambiguous concrete location.
        if (locationSubscriptions == null) return null;
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location selection is required.");
    }

    private static boolean matchesLocationSearch(
            String normalizedQuery,
            Company company,
            Location location,
            LocationPublicPresentationService.PublicPresentation presentation
    ) {
        if (normalizedQuery == null || normalizedQuery.isBlank()) return true;
        return containsIgnoreCase(company == null ? null : company.getName(), normalizedQuery)
                || containsIgnoreCase(location == null ? null : location.getName(), normalizedQuery)
                || containsIgnoreCase(location == null ? null : location.getCity(), normalizedQuery)
                || containsIgnoreCase(presentation.publicName(), normalizedQuery)
                || containsIgnoreCase(presentation.publicAddress(), normalizedQuery)
                || containsIgnoreCase(presentation.publicDescription(), normalizedQuery);
    }

    private static boolean containsIgnoreCase(String value, String normalizedQuery) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(normalizedQuery);
    }

    private List<String> selectablePaymentMethods(Company company) {
        return selectablePaymentMethods(company, null);
    }

    private List<String> selectablePaymentMethods(Company company, Location location) {
        List<String> accepted = guestSettings.acceptedPaymentMethods(company.getId());
        if (accepted == null || accepted.isEmpty()) return List.of();
        boolean stripeReady = stripeConnectService != null && stripeConnectService.isReadyForCompany(company);
        List<PaymentMethod> methods = paymentMethods == null
                ? List.of()
                : paymentMethods.findAllByCompanyIdOrderByNameAsc(company.getId()).stream()
                    .filter(method -> location == null || commerceLocations == null
                            || commerceLocations.paymentMethodAvailableAt(method, location.getId()))
                    .toList();
        return accepted.stream()
                .filter(method -> {
                    String normalized = method == null ? "" : method.trim().toUpperCase(Locale.ROOT);
                    if ("GIFT_CARD".equals(normalized)) return true;
                    if ("CARD".equals(normalized)) {
                        if (!stripeReady) return false;
                        return paymentMethods == null || methods.stream().anyMatch(row -> row.getPaymentType() == PaymentType.CARD && row.isStripeEnabled());
                    }
                    if ("BANK_TRANSFER".equals(normalized)) {
                        return paymentMethods == null || methods.stream().anyMatch(row -> row.getPaymentType() == PaymentType.BANK_TRANSFER);
                    }
                    return true;
                })
                .toList();
    }

    private static String normalizeTenantType(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (value) {
            case "salon" -> "hair_salon";
            case "gym", "personal_training" -> "fitness_personal_training";
            case "therapy" -> "psychology_counselling";
            case "spa" -> "spa_sauna";
            case "hair_salon", "beauty_salon", "massage", "spa_sauna", "tattooing_piercing",
                 "fitness_personal_training", "physical_therapy", "psychology_counselling",
                 "yoga_pilates", "pet_services", "education_coaching", "other" -> value;
            default -> null;
        };
    }

    private Company resolveCompanyForJoin(GuestJoinMethod joinMethod, GuestDtos.JoinTenantRequest request) {
        return switch (joinMethod) {
            case TENANT_CODE -> resolveCodeTarget(request.tenantCode()).company();
            case INVITE_LINK, QR_CODE -> invites.findByCodeIgnoreCase(safeText(request.inviteCode()))
                    .filter(TenantInvite::isActive)
                    .map(TenantInvite::getCompany)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invite not found."));
            case PUBLIC_SEARCH -> companies.findById(parseId(request.companyId()))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
        };
    }

    private CodeResolution resolveCodeTarget(String rawCode) {
        String code = safeText(rawCode);
        if (code.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found.");
        }
        Company direct = companies.findByTenantCodeIgnoreCase(code).orElse(null);
        if (direct != null) return new CodeResolution(direct, null);

        int separator = code.lastIndexOf('-');
        if (separator <= 0 || separator >= code.length() - 1) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found.");
        }
        String companyCode = code.substring(0, separator);
        Company company = companies.findByTenantCodeIgnoreCase(companyCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found."));
        Long locationId = parseId(code.substring(separator + 1));
        Location location = guestLocations.requireDiscoverable(company.getId(), locationId);
        String expected = locationCode(location);
        if (!expected.equalsIgnoreCase(code)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found.");
        }
        return new CodeResolution(company, location);
    }

    private static String locationCode(Location location) {
        if (location == null || location.getId() == null || location.getCompany() == null) return "";
        String tenantCode = safeText(location.getCompany().getTenantCode());
        return tenantCode.isBlank() ? "" : tenantCode + "-" + location.getId();
    }

    private void activateLocationSubscription(GuestTenantLink link, Location location, GuestJoinMethod joinMethod) {
        if (locationSubscriptions == null || link == null || link.getId() == null || location == null) return;
        GuestLocationSubscription subscription = locationSubscriptions
                .findByTenantLinkIdAndLocationId(link.getId(), location.getId())
                .orElseGet(GuestLocationSubscription::new);
        boolean newSubscription = subscription.getId() == null;
        subscription.setTenantLink(link);
        subscription.setLocation(location);
        subscription.setStatus(GuestTenantLinkStatus.ACTIVE);
        subscription.setJoinedVia(joinMethod == null ? GuestJoinMethod.TENANT_CODE : joinMethod);
        if (newSubscription || subscription.getJoinedAt() == null) subscription.setJoinedAt(Instant.now());
        subscription.setLastUsedAt(Instant.now());
        locationSubscriptions.save(subscription);
    }

    private void deactivateLocationSubscriptions(GuestTenantLink link) {
        if (locationSubscriptions == null || link == null || link.getId() == null) return;
        List<GuestLocationSubscription> subscriptions = locationSubscriptions
                .findAllByTenantLinkIdAndStatusOrderByUpdatedAtDesc(link.getId(), GuestTenantLinkStatus.ACTIVE);
        if (subscriptions.isEmpty()) return;
        Instant now = Instant.now();
        subscriptions.forEach(subscription -> {
            subscription.setStatus(GuestTenantLinkStatus.LEFT);
            subscription.setLastUsedAt(now);
        });
        locationSubscriptions.saveAll(subscriptions);
    }

    private boolean hasActiveLocationSubscription(GuestTenantLink link) {
        if (locationSubscriptions == null) return true;
        if (link == null || link.getId() == null) return false;
        return !locationSubscriptions.findAllByTenantLinkIdAndStatusOrderByUpdatedAtDesc(
                link.getId(), GuestTenantLinkStatus.ACTIVE).isEmpty();
    }

    private record CodeResolution(Company company, Location location) {}

    private MatchResult matchOrCreateClient(Company company, GuestUser guestUser) {
        companies.findByIdForUpdate(company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
        List<Client> emailMatches = findByEmail(company.getId(), guestUser.getEmail());
        List<Client> phoneMatches = findByPhone(company.getId(), guestUser.getPhone());

        // Email is authoritative inside a tenant. If historical duplicate rows already
        // exist, deterministically reuse the oldest matching row instead of creating yet
        // another client or blocking the guest from joining.
        if (!emailMatches.isEmpty()) {
            return new MatchResult(emailMatches.get(0), MatchType.EMAIL);
        }
        if (phoneMatches.size() > 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Duplicate clients with this phone were found for this tenant. Please clean up tenant client data first.");
        }
        if (!phoneMatches.isEmpty()) {
            return new MatchResult(phoneMatches.get(0), MatchType.PHONE);
        }

        return new MatchResult(createClient(company, guestUser), MatchType.CREATED);
    }

    private MatchResult resolveClientForExistingLink(GuestTenantLink existing, Company company, GuestUser guestUser) {
        Client linkedClient = existing.getClient();
        String normalizedEmail = normalizeEmail(guestUser.getEmail());
        if (normalizedEmail != null) {
            List<Client> emailMatches = findByEmail(company.getId(), normalizedEmail);
            if (!emailMatches.isEmpty()) {
                Client canonical = emailMatches.get(0);
                return new MatchResult(canonical, Objects.equals(
                        linkedClient == null ? null : linkedClient.getId(), canonical.getId())
                        ? MatchType.LINKED
                        : MatchType.EMAIL);
            }
        }
        if (linkedClient != null && !linkedClient.isAnonymized()) {
            return new MatchResult(linkedClient, MatchType.LINKED);
        }
        return matchOrCreateClient(company, guestUser);
    }

    private Client createClient(Company company, GuestUser guestUser) {
        User assigned = users.findFirstByCompanyIdAndActiveTrueOrderByIdAsc(company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No active tenant staff user is available to own new clients."));
        Client client = new Client();
        client.setCompany(company);
        client.setAssignedTo(assigned);
        client.setFirstName(blankToFallback(guestUser.getFirstName(), "Guest"));
        client.setLastName(blankToFallback(guestUser.getLastName(), "User"));
        client.setEmail(normalizeEmail(guestUser.getEmail()));
        client.setPhone(normalizePhone(guestUser.getPhone()));
        client.setActive(true);
        return clients.save(client);
    }

    private static String blankToFallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private List<Client> findByEmail(Long companyId, String email) {
        String normalized = normalizeEmail(email);
        if (normalized == null) return List.of();
        return clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(companyId, normalized).stream()
                .filter(c -> !c.isAnonymized())
                .toList();
    }

    private List<Client> findByPhone(Long companyId, String phone) {
        String normalized = normalizePhone(phone);
        if (normalized == null) return List.of();
        return clients.findFirstCandidatesByCompanyIdAndNormalizedPhone(companyId, normalized).stream()
                .filter(c -> !c.isAnonymized())
                .toList();
    }

    private void enforceClientRemovalAllowed(Client client, String message) {
        if (client == null || client.getId() == null || client.getCompany() == null || client.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tenant membership is missing linked client data.");
        }
        if (clientRemovalGuard.isRemovalBlocked(client.getId(), client.getCompany().getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, message);
        }
    }

    private static String normalizeEmail(String email) {
        return email == null || email.isBlank() ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizePhone(String phone) {
        if (phone == null || phone.isBlank()) return null;
        return phone.replaceAll("[^0-9+]", "");
    }

    private static GuestJoinMethod parseJoinMethod(String raw) {
        try {
            return GuestJoinMethod.valueOf(safeText(raw).toUpperCase(Locale.ROOT));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported join method.");
        }
    }

    private static String safeText(String raw) {
        if (raw == null || raw.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing required value.");
        return raw.trim();
    }

    private static Long parseId(String raw) {
        try {
            return Long.parseLong(safeText(raw));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid identifier.");
        }
    }

    private record MatchResult(Client client, MatchType matchType) {}
    private enum MatchType { LINKED, EMAIL, PHONE, CREATED }
}
