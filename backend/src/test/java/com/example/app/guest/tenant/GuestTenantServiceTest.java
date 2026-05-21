package com.example.app.guest.tenant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.client.ClientAnonymizationService;
import com.example.app.client.ClientRemovalGuard;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestJoinMethod;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.TenantInviteRepository;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class GuestTenantServiceTest {
    @Test
    void searchReturnsOnlyDiscoverableTenantsForRequestedType() {
        Company salon = company(1L, "Luna Hair Studio");
        Company gym = company(2L, "Forma Gym Center");
        Company hiddenSalon = company(3L, "Private Salon");

        CompanyRepository companies = mock(CompanyRepository.class);
        GuestSettingsService settings = mock(GuestSettingsService.class);
        when(companies.findAll()).thenReturn(List.of(salon, gym, hiddenSalon));
        when(settings.publicSettings(1L)).thenReturn(publicSettings(true, true, "salon"));
        when(settings.publicSettings(2L)).thenReturn(publicSettings(true, true, "gym"));
        when(settings.publicSettings(3L)).thenReturn(publicSettings(true, false, "salon"));
        when(settings.bookingRules(1L)).thenReturn(bookingRules());

        GuestTenantService service = new GuestTenantService(
                companies,
                mock(ClientRepository.class),
                mock(UserRepository.class),
                mock(GuestTenantLinkRepository.class),
                mock(TenantInviteRepository.class),
                settings,
                mock(ClientRemovalGuard.class),
                mock(ClientAnonymizationService.class)
        );

        var results = service.search("", "salon");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).companyName()).isEqualTo("Luna Hair Studio");
        assertThat(results.get(0).tenantType()).isEqualTo("salon");
    }

    @Test
    void unsubscribeRequiresNoBlockingSessionsOrEntitlements() {
        Company company = company(1L, "Luna Hair Studio");
        GuestUser guest = guest(10L);
        Client client = client(100L, company, false, true);
        GuestTenantLink link = link(guest, company, client, GuestTenantLinkStatus.ACTIVE);

        GuestTenantLinkRepository links = mock(GuestTenantLinkRepository.class);
        when(links.findByGuestUserIdAndCompanyId(guest.getId(), company.getId())).thenReturn(Optional.of(link));
        ClientRemovalGuard guard = mock(ClientRemovalGuard.class);
        when(guard.isRemovalBlocked(client.getId(), company.getId())).thenReturn(true);

        GuestTenantService service = new GuestTenantService(
                mock(CompanyRepository.class),
                mock(ClientRepository.class),
                mock(UserRepository.class),
                links,
                mock(TenantInviteRepository.class),
                mock(GuestSettingsService.class),
                guard,
                mock(ClientAnonymizationService.class)
        );

        assertThatThrownBy(() -> service.unsubscribe(guest, company.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void unsubscribeMarksLinkLeftAndClientInactive() {
        Company company = company(1L, "Luna Hair Studio");
        GuestUser guest = guest(10L);
        Client client = client(100L, company, false, true);
        GuestTenantLink link = link(guest, company, client, GuestTenantLinkStatus.ACTIVE);

        GuestTenantLinkRepository links = mock(GuestTenantLinkRepository.class);
        when(links.findByGuestUserIdAndCompanyId(guest.getId(), company.getId())).thenReturn(Optional.of(link));
        when(links.save(link)).thenReturn(link);
        ClientRemovalGuard guard = mock(ClientRemovalGuard.class);
        when(guard.isRemovalBlocked(client.getId(), company.getId())).thenReturn(false);

        GuestTenantService service = new GuestTenantService(
                mock(CompanyRepository.class),
                mock(ClientRepository.class),
                mock(UserRepository.class),
                links,
                mock(TenantInviteRepository.class),
                mock(GuestSettingsService.class),
                guard,
                mock(ClientAnonymizationService.class)
        );

        var result = service.unsubscribe(guest, company.getId());

        assertThat(result.status()).isEqualTo(GuestTenantLinkStatus.LEFT.name());
        assertThat(link.getStatus()).isEqualTo(GuestTenantLinkStatus.LEFT);
        assertThat(client.isActive()).isFalse();
    }

    @Test
    void joinReactivatesExistingInactiveClientWhenNotAnonymized() {
        Company company = company(1L, "Luna Hair Studio");
        GuestUser guest = guest(10L);
        guest.setEmail("ana@example.com");
        Client existingClient = client(100L, company, false, false);
        GuestTenantLink existingLink = link(guest, company, existingClient, GuestTenantLinkStatus.LEFT);

        CompanyRepository companies = mock(CompanyRepository.class);
        when(companies.findByTenantCodeIgnoreCase("LUNA-1")).thenReturn(Optional.of(company));
        GuestTenantLinkRepository links = mock(GuestTenantLinkRepository.class);
        when(links.findByGuestUserIdAndCompanyId(guest.getId(), company.getId())).thenReturn(Optional.of(existingLink));
        when(links.save(existingLink)).thenReturn(existingLink);
        GuestSettingsService settings = mock(GuestSettingsService.class);
        when(settings.publicSettings(company.getId())).thenReturn(publicSettings(true, true, "salon"));

        GuestTenantService service = new GuestTenantService(
                companies,
                mock(ClientRepository.class),
                mock(UserRepository.class),
                links,
                mock(TenantInviteRepository.class),
                settings,
                mock(ClientRemovalGuard.class),
                mock(ClientAnonymizationService.class)
        );

        GuestDtos.JoinTenantResponse response = service.join(
                guest,
                new GuestDtos.JoinTenantRequest(GuestJoinMethod.TENANT_CODE.name(), "LUNA-1", null, null)
        );

        assertThat(existingClient.isActive()).isTrue();
        assertThat(existingLink.getStatus()).isEqualTo(GuestTenantLinkStatus.ACTIVE);
        assertThat(response.matchType()).isEqualTo("LINKED");
    }

    @Test
    void joinCreatesNewClientWhenExistingLinkClientWasAnonymized() {
        Company company = company(1L, "Luna Hair Studio");
        GuestUser guest = guest(10L);
        guest.setEmail("ana@example.com");
        guest.setFirstName("Ana");
        guest.setLastName("Novak");
        guest.setPhone("+38640123456");
        Client anonymized = client(100L, company, true, false);
        GuestTenantLink existingLink = link(guest, company, anonymized, GuestTenantLinkStatus.LEFT);

        CompanyRepository companies = mock(CompanyRepository.class);
        when(companies.findByTenantCodeIgnoreCase("LUNA-1")).thenReturn(Optional.of(company));
        GuestTenantLinkRepository links = mock(GuestTenantLinkRepository.class);
        when(links.findByGuestUserIdAndCompanyId(guest.getId(), company.getId())).thenReturn(Optional.of(existingLink));
        when(links.save(existingLink)).thenReturn(existingLink);
        GuestSettingsService settings = mock(GuestSettingsService.class);
        when(settings.publicSettings(company.getId())).thenReturn(publicSettings(true, true, "salon"));
        UserRepository users = mock(UserRepository.class);
        User owner = new User();
        owner.setId(5L);
        owner.setActive(true);
        when(users.findAllByCompanyId(company.getId())).thenReturn(List.of(owner));
        ClientRepository clients = mock(ClientRepository.class);
        when(clients.save(org.mockito.ArgumentMatchers.any(Client.class))).thenAnswer(invocation -> {
            Client created = invocation.getArgument(0);
            created.setId(222L);
            return created;
        });

        GuestTenantService service = new GuestTenantService(
                companies,
                clients,
                users,
                links,
                mock(TenantInviteRepository.class),
                settings,
                mock(ClientRemovalGuard.class),
                mock(ClientAnonymizationService.class)
        );

        GuestDtos.JoinTenantResponse response = service.join(
                guest,
                new GuestDtos.JoinTenantRequest(GuestJoinMethod.TENANT_CODE.name(), "LUNA-1", null, null)
        );

        assertThat(response.matchType()).isEqualTo("CREATED");
        assertThat(existingLink.getClient().getId()).isEqualTo(222L);
    }

    @Test
    void anonymizeMarksLinkLeftAndClientInactive() {
        Company company = company(1L, "Luna Hair Studio");
        GuestUser guest = guest(10L);
        Client client = client(100L, company, false, true);
        GuestTenantLink link = link(guest, company, client, GuestTenantLinkStatus.ACTIVE);

        GuestTenantLinkRepository links = mock(GuestTenantLinkRepository.class);
        when(links.findByGuestUserIdAndCompanyId(guest.getId(), company.getId())).thenReturn(Optional.of(link));
        when(links.save(link)).thenReturn(link);
        ClientRemovalGuard guard = mock(ClientRemovalGuard.class);
        when(guard.isRemovalBlocked(client.getId(), company.getId())).thenReturn(false);
        ClientAnonymizationService anonymizationService = mock(ClientAnonymizationService.class);
        when(anonymizationService.anonymizeForGuest(client, guest.getId())).thenReturn(client);

        GuestTenantService service = new GuestTenantService(
                mock(CompanyRepository.class),
                mock(ClientRepository.class),
                mock(UserRepository.class),
                links,
                mock(TenantInviteRepository.class),
                mock(GuestSettingsService.class),
                guard,
                anonymizationService
        );

        var result = service.anonymize(guest, company.getId());

        verify(anonymizationService).anonymizeForGuest(client, guest.getId());
        assertThat(result.status()).isEqualTo(GuestTenantLinkStatus.LEFT.name());
        assertThat(client.isActive()).isFalse();
    }

    private static GuestUser guest(Long id) {
        GuestUser guest = new GuestUser();
        guest.setId(id);
        guest.setFirstName("Ana");
        guest.setLastName("Novak");
        guest.setEmail("ana@example.com");
        return guest;
    }

    private static Client client(Long id, Company company, boolean anonymized, boolean active) {
        Client client = new Client();
        client.setId(id);
        client.setCompany(company);
        client.setFirstName("Ana");
        client.setLastName("Novak");
        client.setAnonymized(anonymized);
        client.setActive(active);
        return client;
    }

    private static GuestTenantLink link(GuestUser guest, Company company, Client client, GuestTenantLinkStatus status) {
        GuestTenantLink link = new GuestTenantLink();
        link.setGuestUser(guest);
        link.setCompany(company);
        link.setClient(client);
        link.setStatus(status);
        link.setJoinedVia(GuestJoinMethod.TENANT_CODE);
        link.setJoinedAt(Instant.now());
        return link;
    }

    private static Company company(Long id, String name) {
        Company company = new Company();
        company.setId(id);
        company.setName(name);
        return company;
    }

    private static GuestSettingsService.GuestPublicSettings publicSettings(boolean enabled, boolean discoverable, String tenantType) {
        return new GuestSettingsService.GuestPublicSettings(
                enabled,
                discoverable,
                null,
                "Public description",
                "Ljubljana",
                null,
                null,
                null,
                "sl",
                false,
                false,
                tenantType,
                "https://example.com/card.jpg",
                "https://example.com/logo.png",
                "https://example.com/icon.svg"
        );
    }

    private static GuestSettingsService.GuestBookingRules bookingRules() {
        return new GuestSettingsService.GuestBookingRules(
                24,
                12,
                true,
                true,
                false,
                false,
                List.of("PACK", "MEMBERSHIP"),
                List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP"),
                List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP"),
                true,
                "full",
                20
        );
    }
}
