package com.example.app.guest.tenant;

import com.example.app.client.Client;
import com.example.app.client.ClientOnlineAccessGuard;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.model.GuestJoinMethod;
import com.example.app.guest.model.GuestLocationSubscription;
import com.example.app.guest.model.GuestLocationSubscriptionRepository;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestUser;
import com.example.app.location.Location;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Canonical bridge between a global Calendra customer and a provider/location.
 *
 * <p>The customer account remains global ({@link GuestUser}), while each provider keeps its own
 * {@link Client} record. This service deterministically reuses/creates that provider client,
 * activates the company link and activates only the selected location subscription.</p>
 */
@Service
public class GuestProviderLinkService {
    private final CompanyRepository companies;
    private final ClientRepository clients;
    private final UserRepository users;
    private final GuestTenantLinkRepository links;
    private final GuestLocationSubscriptionRepository locationSubscriptions;

    public GuestProviderLinkService(
            CompanyRepository companies,
            ClientRepository clients,
            UserRepository users,
            GuestTenantLinkRepository links,
            GuestLocationSubscriptionRepository locationSubscriptions
    ) {
        this.companies = companies;
        this.clients = clients;
        this.users = users;
        this.links = links;
        this.locationSubscriptions = locationSubscriptions;
    }

    @Transactional
    public LinkResult activateMarketplaceLocation(
            GuestUser guestUser,
            Company company,
            Location location,
            String locale
    ) {
        return activate(guestUser, company, location, GuestJoinMethod.PUBLIC_SEARCH, locale, null);
    }

    @Transactional
    public LinkResult activate(
            GuestUser guestUser,
            Company company,
            Location location,
            GuestJoinMethod joinMethod,
            String locale,
            User preferredOwner
    ) {
        if (guestUser == null || guestUser.getId() == null || !guestUser.isActive()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Customer account is not available.");
        }
        if (company == null || company.getId() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found.");
        }
        if (location != null) {
            if (location.getId() == null || location.getCompany() == null
                    || !Objects.equals(location.getCompany().getId(), company.getId()) || !location.isActive()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is not available.");
            }
        }

        companies.findByIdForUpdate(company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found."));

        GuestTenantLink existing = links.findByGuestUserIdAndCompanyId(guestUser.getId(), company.getId()).orElse(null);
        MatchResult match = resolveClient(existing, company, guestUser, preferredOwner);
        ClientOnlineAccessGuard.requireAllowed(match.client(), locale == null ? guestUser.getLanguage() : locale);

        Client client = match.client();
        if (!client.isAnonymized() && !client.isActive()) {
            client.setActive(true);
            client = clients.save(client);
        }

        GuestTenantLink link = existing != null ? existing : new GuestTenantLink();
        link.setGuestUser(guestUser);
        link.setCompany(company);
        link.setClient(client);
        link.setStatus(GuestTenantLinkStatus.ACTIVE);
        // Preserve the original company-level acquisition source. Location subscriptions keep the
        // current acquisition source, so marketplace discovery is still observable per location.
        if (existing == null || link.getJoinedVia() == null) {
            link.setJoinedVia(joinMethod == null ? GuestJoinMethod.PUBLIC_SEARCH : joinMethod);
        }
        if (existing == null || link.getJoinedAt() == null) {
            link.setJoinedAt(Instant.now());
        }
        link.setLastUsedAt(Instant.now());
        link = links.save(link);

        if (location != null) {
            activateLocation(link, location, joinMethod == null ? GuestJoinMethod.PUBLIC_SEARCH : joinMethod);
        }

        return new LinkResult(link, client, match.matchType(), location == null ? null : location.getId());
    }

    private MatchResult resolveClient(
            GuestTenantLink existing,
            Company company,
            GuestUser guestUser,
            User preferredOwner
    ) {
        String normalizedEmail = normalizeEmail(guestUser.getEmail());
        if (normalizedEmail != null) {
            List<Client> emailMatches = clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(
                            company.getId(), normalizedEmail)
                    .stream()
                    .filter(candidate -> candidate != null && !candidate.isAnonymized())
                    .toList();
            if (!emailMatches.isEmpty()) {
                Client canonical = emailMatches.getFirst();
                return new MatchResult(canonical,
                        existing != null && existing.getClient() != null
                                && Objects.equals(existing.getClient().getId(), canonical.getId())
                                ? MatchType.LINKED
                                : MatchType.EMAIL);
            }
        }

        if (existing != null && existing.getClient() != null && !existing.getClient().isAnonymized()) {
            return new MatchResult(existing.getClient(), MatchType.LINKED);
        }

        String normalizedPhone = normalizePhone(guestUser.getPhone());
        if (normalizedPhone != null) {
            List<Client> phoneMatches = clients.findFirstCandidatesByCompanyIdAndNormalizedPhone(
                            company.getId(), normalizedPhone)
                    .stream()
                    .filter(candidate -> candidate != null && !candidate.isAnonymized())
                    .toList();
            if (phoneMatches.size() > 1) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Duplicate clients with this phone were found for this provider."
                );
            }
            if (!phoneMatches.isEmpty()) {
                return new MatchResult(phoneMatches.getFirst(), MatchType.PHONE);
            }
        }

        User owner = preferredOwner;
        if (owner == null || owner.getId() == null || owner.getCompany() == null
                || !Objects.equals(owner.getCompany().getId(), company.getId()) || !owner.isActive()) {
            owner = users.findFirstByCompanyIdAndActiveTrueOrderByIdAsc(company.getId())
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.CONFLICT,
                            "No active provider staff user is available to own new clients."
                    ));
        }

        Client client = new Client();
        client.setCompany(company);
        client.setAssignedTo(owner);
        client.setFirstName(blankToFallback(guestUser.getFirstName(), "Guest"));
        client.setLastName(blankToFallback(guestUser.getLastName(), "User"));
        client.setEmail(normalizedEmail);
        client.setPhone(normalizedPhone);
        client.setWhatsappPhone(normalizedPhone);
        client.setWhatsappOptIn(false);
        client.setActive(true);
        client.setBatchPaymentEnabled(false);
        return new MatchResult(clients.save(client), MatchType.CREATED);
    }

    private void activateLocation(GuestTenantLink link, Location location, GuestJoinMethod joinMethod) {
        GuestLocationSubscription subscription = locationSubscriptions
                .findByTenantLinkIdAndLocationId(link.getId(), location.getId())
                .orElseGet(GuestLocationSubscription::new);
        boolean isNew = subscription.getId() == null;
        subscription.setTenantLink(link);
        subscription.setLocation(location);
        subscription.setStatus(GuestTenantLinkStatus.ACTIVE);
        subscription.setJoinedVia(joinMethod);
        if (isNew || subscription.getJoinedAt() == null) {
            subscription.setJoinedAt(Instant.now());
        }
        subscription.setLastUsedAt(Instant.now());
        locationSubscriptions.save(subscription);
    }

    private static String normalizeEmail(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizePhone(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.replaceAll("[^0-9+]", "");
        return normalized.isBlank() ? null : normalized;
    }

    private static String blankToFallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    public record LinkResult(
            GuestTenantLink tenantLink,
            Client client,
            MatchType matchType,
            Long locationId
    ) {}

    public enum MatchType {
        LINKED,
        EMAIL,
        PHONE,
        CREATED
    }

    private record MatchResult(Client client, MatchType matchType) {}
}
