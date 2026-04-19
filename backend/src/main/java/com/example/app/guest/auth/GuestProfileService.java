package com.example.app.guest.auth;

import com.example.app.client.Client;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestMapper;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestProfileService {
    private final GuestUserRepository guestUsers;
    private final GuestTenantLinkRepository links;
    private final ClientCompanyRepository clientCompanies;
    private final GuestSettingsService guestSettings;

    public GuestProfileService(
            GuestUserRepository guestUsers,
            GuestTenantLinkRepository links,
            ClientCompanyRepository clientCompanies,
            GuestSettingsService guestSettings
    ) {
        this.guestUsers = guestUsers;
        this.links = links;
        this.clientCompanies = clientCompanies;
        this.guestSettings = guestSettings;
    }

    @Transactional(readOnly = true)
    public GuestDtos.GuestProfileSettingsResponse settings(GuestUser guestUser, String companyId) {
        GuestTenantLink link = resolveLink(guestUser, companyId);
        return toSettingsResponse(guestUser, link);
    }

    @Transactional
    public GuestDtos.GuestProfileSettingsResponse update(GuestUser guestUser, GuestDtos.UpdateGuestProfileSettingsRequest request) {
        String email = normalizeEmail(request.email());
        if (email == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email is required.");
        }
        Long guestUserId = guestUser.getId();
        guestUsers.findByEmailIgnoreCase(email)
                .filter(existing -> !existing.getId().equals(guestUserId))
                .ifPresent(existing -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "A guest account with this email already exists.");
                });

        guestUser.setFirstName(requiredName(request.firstName(), "First name is required."));
        guestUser.setLastName(requiredName(request.lastName(), "Last name is required."));
        guestUser.setEmail(email);
        guestUser.setPhone(blankToNull(request.phone()));
        guestUser.setLanguage(blankToDefault(request.language(), "sl"));
        guestUsers.save(guestUser);

        List<GuestTenantLink> allLinks = links.findAllByGuestUserIdOrderByUpdatedAtDesc(guestUser.getId());
        for (GuestTenantLink link : allLinks) {
            syncClientProfile(link.getClient(), guestUser);
        }

        GuestTenantLink activeLink = resolveLinkFromList(allLinks, request.companyId());
        if (activeLink != null) {
            Client client = activeLink.getClient();
            if (request.batchPaymentEnabled() != null) {
                client.setBatchPaymentEnabled(request.batchPaymentEnabled());
            }
            client.setBillingCompany(resolveBillingCompany(request.linkedCompanyId(), activeLink.getCompany().getId()));
            syncClientProfile(client, guestUser);
        }

        return toSettingsResponse(guestUser, activeLink);
    }

    private GuestDtos.GuestProfileSettingsResponse toSettingsResponse(GuestUser guestUser, GuestTenantLink link) {
        Client client = link == null ? null : link.getClient();
        List<GuestDtos.LinkedCompanyOptionResponse> companyOptions = link == null
                ? List.of()
                : clientCompanies.findAllByOwnerCompanyIdOrderByNameAsc(link.getCompany().getId()).stream()
                .filter(company -> company.isActive() || (client != null && client.getBillingCompany() != null && company.getId().equals(client.getBillingCompany().getId())))
                .map(company -> new GuestDtos.LinkedCompanyOptionResponse(String.valueOf(company.getId()), company.getName()))
                .toList();

        String companyName = null;
        if (link != null) {
            var publicSettings = guestSettings.publicSettings(link.getCompany().getId());
            companyName = GuestMapper.displayCompanyName(link.getCompany(), publicSettings);
        }

        return new GuestDtos.GuestProfileSettingsResponse(
                GuestMapper.toGuestUser(guestUser),
                link == null ? null : String.valueOf(link.getCompany().getId()),
                companyName,
                client == null || client.getBillingCompany() == null ? null : String.valueOf(client.getBillingCompany().getId()),
                client == null || client.getBillingCompany() == null ? null : client.getBillingCompany().getName(),
                client != null && client.isBatchPaymentEnabled(),
                companyOptions
        );
    }

    private GuestTenantLink resolveLink(GuestUser guestUser, String companyId) {
        return resolveLinkFromList(links.findAllByGuestUserIdOrderByUpdatedAtDesc(guestUser.getId()), companyId);
    }

    private GuestTenantLink resolveLinkFromList(List<GuestTenantLink> availableLinks, String companyId) {
        if (availableLinks == null || availableLinks.isEmpty()) {
            return null;
        }
        if (companyId == null || companyId.isBlank()) {
            return availableLinks.get(0);
        }
        Long tenantId = parseId(companyId);
        return availableLinks.stream()
                .filter(link -> link.getCompany() != null && tenantId.equals(link.getCompany().getId()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant membership not found."));
    }

    private ClientCompany resolveBillingCompany(String linkedCompanyId, Long ownerCompanyId) {
        if (linkedCompanyId == null || linkedCompanyId.isBlank()) {
            return null;
        }
        Long companyId = parseId(linkedCompanyId);
        return clientCompanies.findByIdAndOwnerCompanyId(companyId, ownerCompanyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected linked company was not found."));
    }

    private void syncClientProfile(Client client, GuestUser guestUser) {
        if (client == null) return;
        client.setFirstName(guestUser.getFirstName());
        client.setLastName(guestUser.getLastName());
        client.setEmail(guestUser.getEmail());
        client.setPhone(guestUser.getPhone());
        client.setWhatsappPhone(guestUser.getPhone());
    }

    private static Long parseId(String raw) {
        try {
            return Long.parseLong(raw.trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid company identifier.");
        }
    }

    private static String requiredName(String value, String message) {
        if (value == null || value.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        return value.trim();
    }

    private static String normalizeEmail(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
