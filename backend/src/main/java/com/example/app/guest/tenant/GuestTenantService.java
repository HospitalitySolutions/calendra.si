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
        Company company = companies.findByTenantCodeIgnoreCase(tenantCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
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
                GuestJoinMethod.TENANT_CODE.name(),
                settings.guestAppEnabled(),
                settings.employeeSelectionStep(),
                settings.useEmployeeContact(),
                settings.cancellationAllowed(),
                settings.modificationAllowed(),
                locationSummaries(company, "ACTIVE")
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
            if (normalizedType != null && !normalizedType.equals(settings.tenantType())) continue;
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

        Long selectedLocationId = resolveJoinLocationId(company, request.locationId());

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

        if (joinMethod == GuestJoinMethod.INVITE_LINK || joinMethod == GuestJoinMethod.QR_CODE) {
            String inviteCode = request.inviteCode();
            if (inviteCode != null && !inviteCode.isBlank()) {
                invites.findByCodeIgnoreCase(inviteCode).ifPresent(invite -> {
                    invite.setUsedCount(invite.getUsedCount() + 1);
                    invites.save(invite);
                });
            }
        }

        return new GuestDtos.JoinTenantResponse(
                new GuestDtos.TenantLinkResponse(String.valueOf(company.getId()), String.valueOf(match.client().getId()), link.getStatus().name(), link.getJoinedVia().name()),
                match.matchType() != MatchType.CREATED,
                match.matchType().name(),
                selectedLocationId == null ? null : String.valueOf(selectedLocationId)
        );
    }

    public List<GuestDtos.TenantSummaryResponse> linkedTenants(GuestUser guestUser) {
        return links.findAllByGuestUserIdOrderByUpdatedAtDesc(guestUser.getId()).stream()
                .filter(link -> link.getStatus() == GuestTenantLinkStatus.ACTIVE)
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
     * Location-level providers available to the signed-in guest. The membership itself
     * remains company-level, so one active link may expose several discoverable branches.
     */
    public List<GuestDtos.TenantSummaryResponse> providers(GuestUser guestUser) {
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

    @Transactional
    public GuestDtos.TenantLinkResponse unsubscribe(GuestUser guestUser, Long companyId) {
        GuestTenantLink link = requireLink(guestUser, companyId);
        enforceClientRemovalAllowed(link.getClient(), "Cannot unsubscribe while active sessions or entitlements exist.");
        link.setStatus(GuestTenantLinkStatus.LEFT);
        link.setLastUsedAt(Instant.now());
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
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant membership not found."));
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

    private Long resolveJoinLocationId(Company company, String rawLocationId) {
        if (company == null) return null;
        if (rawLocationId != null && !rawLocationId.isBlank()) {
            Long locationId = parseId(rawLocationId);
            return guestLocations.requireDiscoverable(company.getId(), locationId).getId();
        }
        List<Location> visible = guestLocations.discoverableLocations(company.getId());
        return visible.size() == 1 ? visible.get(0).getId() : null;
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
                    if ("PAYPAL".equals(normalized)) {
                        return paymentMethods == null || methods.stream().anyMatch(row -> row.getPaymentType() == PaymentType.OTHER);
                    }
                    return true;
                })
                .toList();
    }

    private static String normalizeTenantType(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (value) {
            case "salon", "gym", "spa", "therapy", "personal_training" -> value;
            default -> null;
        };
    }

    private Company resolveCompanyForJoin(GuestJoinMethod joinMethod, GuestDtos.JoinTenantRequest request) {
        return switch (joinMethod) {
            case TENANT_CODE -> companies.findByTenantCodeIgnoreCase(safeText(request.tenantCode()))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
            case INVITE_LINK, QR_CODE -> invites.findByCodeIgnoreCase(safeText(request.inviteCode()))
                    .filter(TenantInvite::isActive)
                    .map(TenantInvite::getCompany)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invite not found."));
            case PUBLIC_SEARCH -> companies.findById(parseId(request.companyId()))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
        };
    }

    private MatchResult matchOrCreateClient(Company company, GuestUser guestUser) {
        companies.findByIdForUpdate(company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
        List<Client> emailMatches = findByEmail(company.getId(), guestUser.getEmail());
        List<Client> phoneMatches = findByPhone(company.getId(), guestUser.getPhone());

        if (emailMatches.size() > 1 || phoneMatches.size() > 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Duplicate clients found for this tenant. Please clean up tenant client data first.");
        }
        if (!emailMatches.isEmpty() && !phoneMatches.isEmpty() && !Objects.equals(emailMatches.get(0).getId(), phoneMatches.get(0).getId())) {
            return new MatchResult(emailMatches.get(0), MatchType.EMAIL);
        }
        if (!emailMatches.isEmpty()) {
            return new MatchResult(emailMatches.get(0), MatchType.EMAIL);
        }
        if (!phoneMatches.isEmpty()) {
            return new MatchResult(phoneMatches.get(0), MatchType.PHONE);
        }

        return new MatchResult(createClient(company, guestUser), MatchType.CREATED);
    }

    private MatchResult resolveClientForExistingLink(GuestTenantLink existing, Company company, GuestUser guestUser) {
        Client linkedClient = existing.getClient();
        if (linkedClient != null && linkedClient.isAnonymized()) {
            return new MatchResult(createClient(company, guestUser), MatchType.CREATED);
        }
        if (linkedClient != null) {
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
