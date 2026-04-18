package com.example.app.guest.tenant;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.*;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
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

    public GuestTenantService(
            CompanyRepository companies,
            ClientRepository clients,
            UserRepository users,
            GuestTenantLinkRepository links,
            TenantInviteRepository invites,
            GuestSettingsService guestSettings
    ) {
        this.companies = companies;
        this.clients = clients;
        this.users = users;
        this.links = links;
        this.invites = invites;
        this.guestSettings = guestSettings;
    }

    public GuestDtos.TenantLookupResponse resolveByCode(String tenantCode) {
        Company company = companies.findByTenantCodeIgnoreCase(tenantCode)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
        var settings = guestSettings.publicSettings(company.getId());
        return new GuestDtos.TenantLookupResponse(
                String.valueOf(company.getId()),
                GuestMapper.displayCompanyName(company, settings),
                settings.publicDescription(),
                settings.publicCity(),
                settings.publicPhone(),
                GuestMapper.displayCompanyAddressLine(settings),
                GuestJoinMethod.TENANT_CODE.name(),
                settings.guestAppEnabled()
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
                settings.publicDescription(),
                settings.publicCity(),
                settings.publicPhone(),
                GuestMapper.displayCompanyAddressLine(settings),
                GuestJoinMethod.INVITE_LINK.name(),
                settings.guestAppEnabled()
        );
    }

    public List<GuestDtos.TenantSummaryResponse> search(String query) {
        if (query == null || query.isBlank()) return List.of();
        List<Company> candidates = companies.findAllByNameContainingIgnoreCase(query.trim());
        List<GuestDtos.TenantSummaryResponse> out = new ArrayList<>();
        for (Company company : candidates) {
            var settings = guestSettings.publicSettings(company.getId());
            if (!settings.guestAppEnabled() || !settings.publicDiscoverable()) continue;
            out.add(GuestMapper.toTenantSummary(company, settings));
        }
        out.sort(Comparator.comparing(GuestDtos.TenantSummaryResponse::companyName, String.CASE_INSENSITIVE_ORDER));
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

        GuestTenantLink existing = links.findByGuestUserIdAndCompanyId(guestUser.getId(), company.getId()).orElse(null);
        MatchResult match = matchOrCreateClient(company, guestUser);
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
                match.matchType().name()
        );
    }

    public List<GuestDtos.TenantSummaryResponse> linkedTenants(GuestUser guestUser) {
        return links.findAllByGuestUserIdOrderByUpdatedAtDesc(guestUser.getId()).stream()
                .map(link -> {
                    var settings = guestSettings.publicSettings(link.getCompany().getId());
                    return GuestMapper.toTenantSummary(link, settings);
                })
                .toList();
    }

    public GuestTenantLink requireLink(GuestUser guestUser, Long companyId) {
        return links.findByGuestUserIdAndCompanyId(guestUser.getId(), companyId)
                .filter(link -> link.getStatus() == GuestTenantLinkStatus.ACTIVE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant membership not found."));
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
        List<Client> companyClients = clients.findAllByCompanyId(company.getId());
        List<Client> emailMatches = findByEmail(companyClients, guestUser.getEmail());
        List<Client> phoneMatches = findByPhone(companyClients, guestUser.getPhone());

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

        User assigned = users.findAllByCompanyId(company.getId()).stream()
                .filter(User::isActive)
                .min(Comparator.comparing(User::getId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "No active tenant staff user is available to own new clients."));
        Client client = new Client();
        client.setCompany(company);
        client.setAssignedTo(assigned);
        client.setFirstName(blankToFallback(guestUser.getFirstName(), "Guest"));
        client.setLastName(blankToFallback(guestUser.getLastName(), "User"));
        client.setEmail(normalizeEmail(guestUser.getEmail()));
        client.setPhone(normalizePhone(guestUser.getPhone()));
        client.setActive(true);
        client = clients.save(client);
        return new MatchResult(client, MatchType.CREATED);
    }

    private static String blankToFallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static List<Client> findByEmail(List<Client> companyClients, String email) {
        String normalized = normalizeEmail(email);
        if (normalized == null) return List.of();
        return companyClients.stream()
                .filter(c -> normalized.equals(normalizeEmail(c.getEmail())))
                .toList();
    }

    private static List<Client> findByPhone(List<Client> companyClients, String phone) {
        String normalized = normalizePhone(phone);
        if (normalized == null) return List.of();
        return companyClients.stream()
                .filter(c -> normalized.equals(normalizePhone(c.getPhone())))
                .toList();
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
    private enum MatchType { EMAIL, PHONE, CREATED }
}
