package com.example.app.guest.tenant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
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
import com.example.app.user.UserRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class GuestProviderLinkServiceTest {
    @Test
    void marketplaceActivationReusesProviderClientAndActivatesOnlySelectedLocation() {
        Company company = new Company();
        company.setId(7L);
        Location location = new Location();
        location.setId(31L);
        location.setCompany(company);
        location.setActive(true);

        GuestUser guest = new GuestUser();
        guest.setId(11L);
        guest.setActive(true);
        guest.setEmail("david@example.com");
        guest.setFirstName("David");
        guest.setLastName("Mirc");

        Client client = new Client();
        client.setId(88L);
        client.setCompany(company);
        client.setActive(true);
        client.setEmail("david@example.com");

        CompanyRepository companies = mock(CompanyRepository.class);
        when(companies.findByIdForUpdate(7L)).thenReturn(Optional.of(company));
        ClientRepository clients = mock(ClientRepository.class);
        when(clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(7L, "david@example.com"))
                .thenReturn(List.of(client));
        GuestTenantLinkRepository links = mock(GuestTenantLinkRepository.class);
        when(links.findByGuestUserIdAndCompanyId(11L, 7L)).thenReturn(Optional.empty());
        when(links.save(any(GuestTenantLink.class))).thenAnswer(invocation -> {
            GuestTenantLink link = invocation.getArgument(0);
            link.setId(44L);
            return link;
        });
        GuestLocationSubscriptionRepository subscriptions = mock(GuestLocationSubscriptionRepository.class);
        when(subscriptions.findByTenantLinkIdAndLocationId(44L, 31L)).thenReturn(Optional.empty());
        when(subscriptions.save(any(GuestLocationSubscription.class))).thenAnswer(invocation -> invocation.getArgument(0));

        GuestProviderLinkService service = new GuestProviderLinkService(
                companies, clients, mock(UserRepository.class), links, subscriptions);

        var result = service.activateMarketplaceLocation(guest, company, location, "sl");

        assertThat(result.client()).isSameAs(client);
        assertThat(result.matchType()).isEqualTo(GuestProviderLinkService.MatchType.EMAIL);
        assertThat(result.tenantLink().getStatus()).isEqualTo(GuestTenantLinkStatus.ACTIVE);
        assertThat(result.tenantLink().getJoinedVia()).isEqualTo(GuestJoinMethod.PUBLIC_SEARCH);
        verify(subscriptions).save(any(GuestLocationSubscription.class));
    }

    @Test
    void marketplaceActivationReactivatesExistingLocationSubscriptionWithoutChangingOriginalCompanyJoinSource() {
        Company company = new Company();
        company.setId(7L);
        Location location = new Location();
        location.setId(31L);
        location.setCompany(company);
        location.setActive(true);

        GuestUser guest = new GuestUser();
        guest.setId(11L);
        guest.setActive(true);
        guest.setEmail("david@example.com");

        Client client = new Client();
        client.setId(88L);
        client.setCompany(company);
        client.setActive(true);
        client.setEmail("david@example.com");

        GuestTenantLink existing = new GuestTenantLink();
        existing.setId(44L);
        existing.setGuestUser(guest);
        existing.setCompany(company);
        existing.setClient(client);
        existing.setStatus(GuestTenantLinkStatus.LEFT);
        existing.setJoinedVia(GuestJoinMethod.INVITE_LINK);

        GuestLocationSubscription subscription = new GuestLocationSubscription();
        subscription.setId(55L);
        subscription.setTenantLink(existing);
        subscription.setLocation(location);
        subscription.setStatus(GuestTenantLinkStatus.LEFT);
        subscription.setJoinedVia(GuestJoinMethod.INVITE_LINK);

        CompanyRepository companies = mock(CompanyRepository.class);
        when(companies.findByIdForUpdate(7L)).thenReturn(Optional.of(company));
        ClientRepository clients = mock(ClientRepository.class);
        when(clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(7L, "david@example.com"))
                .thenReturn(List.of(client));
        GuestTenantLinkRepository links = mock(GuestTenantLinkRepository.class);
        when(links.findByGuestUserIdAndCompanyId(11L, 7L)).thenReturn(Optional.of(existing));
        when(links.save(existing)).thenReturn(existing);
        GuestLocationSubscriptionRepository subscriptions = mock(GuestLocationSubscriptionRepository.class);
        when(subscriptions.findByTenantLinkIdAndLocationId(44L, 31L)).thenReturn(Optional.of(subscription));
        when(subscriptions.save(subscription)).thenReturn(subscription);

        GuestProviderLinkService service = new GuestProviderLinkService(
                companies, clients, mock(UserRepository.class), links, subscriptions);

        service.activateMarketplaceLocation(guest, company, location, "sl");

        assertThat(existing.getStatus()).isEqualTo(GuestTenantLinkStatus.ACTIVE);
        assertThat(existing.getJoinedVia()).isEqualTo(GuestJoinMethod.INVITE_LINK);
        assertThat(subscription.getStatus()).isEqualTo(GuestTenantLinkStatus.ACTIVE);
        assertThat(subscription.getJoinedVia()).isEqualTo(GuestJoinMethod.PUBLIC_SEARCH);
    }
}
