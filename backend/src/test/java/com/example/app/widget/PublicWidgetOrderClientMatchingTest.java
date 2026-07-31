package com.example.app.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class PublicWidgetOrderClientMatchingTest {

    @Test
    void onlinePaymentFlowCreatesNewClientWhenOnlyPhoneMatches() throws Exception {
        ClientRepository clients = mock(ClientRepository.class);
        UserRepository users = mock(UserRepository.class);
        PublicWidgetOrderService service = service(null, null, clients, users);
        Company company = company(9L);
        User owner = new User();
        Client samePhoneDifferentEmail = new Client();
        samePhoneDifferentEmail.setEmail("other@example.com");
        samePhoneDifferentEmail.setPhone("040111222");

        when(clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(9L, "new@example.com"))
                .thenReturn(List.of());
        when(clients.findFirstCandidatesByCompanyIdAndNormalizedPhone(9L, "040111222"))
                .thenReturn(List.of(samePhoneDifferentEmail));
        when(users.findFirstByCompanyIdAndActiveTrueOrderByIdAsc(9L)).thenReturn(Optional.of(owner));
        when(clients.save(any(Client.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Client resolved = invokeMatchOrCreate(
                service,
                company,
                "New",
                "Client",
                " New@Example.com ",
                "040111222"
        );

        assertNotSame(samePhoneDifferentEmail, resolved);
        assertEquals("new@example.com", resolved.getEmail());
        assertSame(owner, resolved.getAssignedTo());
        verify(clients, never()).findFirstCandidatesByCompanyIdAndNormalizedPhone(any(), any());
    }

    @Test
    void existingTenantLinkIsCorrectedToClientMatchingGuestEmail() throws Exception {
        CompanyRepository companies = mock(CompanyRepository.class);
        GuestTenantLinkRepository links = mock(GuestTenantLinkRepository.class);
        ClientRepository clients = mock(ClientRepository.class);
        UserRepository users = mock(UserRepository.class);
        PublicWidgetOrderService service = service(companies, links, clients, users);
        Company company = company(9L);
        GuestUser guest = new GuestUser();
        guest.setId(7L);
        guest.setEmail("right@example.com");

        Client wronglyLinked = new Client();
        wronglyLinked.setEmail("wrong@example.com");
        Client correct = new Client();
        correct.setEmail("right@example.com");

        GuestTenantLink existing = new GuestTenantLink();
        existing.setGuestUser(guest);
        existing.setCompany(company);
        existing.setClient(wronglyLinked);

        when(links.findByGuestUserIdAndCompanyId(7L, 9L)).thenReturn(Optional.of(existing));
        when(companies.findByIdForUpdate(9L)).thenReturn(Optional.of(company));
        when(clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(9L, "right@example.com"))
                .thenReturn(List.of(correct));
        when(clients.save(any(Client.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(links.save(any(GuestTenantLink.class))).thenAnswer(invocation -> invocation.getArgument(0));

        invokeEnsureTenantLink(
                service,
                guest,
                company,
                "Right",
                "Person",
                "RIGHT@example.com",
                "040111222",
                null,
                "sl"
        );

        assertSame(correct, existing.getClient());
        verify(companies).findByIdForUpdate(9L);
        verify(links).save(existing);
    }

    private PublicWidgetOrderService service(
            CompanyRepository companies,
            GuestTenantLinkRepository links,
            ClientRepository clients,
            UserRepository users
    ) {
        return new PublicWidgetOrderService(
                companies,
                null,
                null,
                links,
                clients,
                users,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
        );
    }

    private Company company(Long id) {
        Company company = new Company();
        company.setId(id);
        company.setName("Tenant");
        return company;
    }

    private Client invokeMatchOrCreate(
            PublicWidgetOrderService service,
            Company company,
            String firstName,
            String lastName,
            String email,
            String phone
    ) throws Exception {
        Method method = PublicWidgetOrderService.class.getDeclaredMethod(
                "matchOrCreateClient",
                Company.class,
                String.class,
                String.class,
                String.class,
                String.class
        );
        method.setAccessible(true);
        return (Client) method.invoke(service, company, firstName, lastName, email, phone);
    }

    private void invokeEnsureTenantLink(
            PublicWidgetOrderService service,
            GuestUser guestUser,
            Company company,
            String firstName,
            String lastName,
            String email,
            String phone,
            String companyName,
            String locale
    ) throws Exception {
        Method method = PublicWidgetOrderService.class.getDeclaredMethod(
                "ensureTenantLink",
                GuestUser.class,
                Company.class,
                String.class,
                String.class,
                String.class,
                String.class,
                String.class,
                String.class
        );
        method.setAccessible(true);
        method.invoke(service, guestUser, company, firstName, lastName, email, phone, companyName, locale);
    }
}
