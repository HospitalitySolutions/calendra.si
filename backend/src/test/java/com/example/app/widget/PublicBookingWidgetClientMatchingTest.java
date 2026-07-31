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
import com.example.app.user.User;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.Test;

class PublicBookingWidgetClientMatchingTest {

    @Test
    void reusesExistingTenantClientByNormalizedEmail() throws Exception {
        ClientRepository clients = mock(ClientRepository.class);
        PublicBookingWidgetService service = service(clients);
        Company company = company(42L);
        User actor = new User();
        Client existing = new Client();
        existing.setCompany(company);
        existing.setFirstName("Existing");
        existing.setLastName("Client");
        existing.setEmail("known@example.com");

        when(clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(42L, "known@example.com"))
                .thenReturn(List.of(existing));
        when(clients.save(any(Client.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Client resolved = invokeFindOrCreate(
                service,
                company,
                actor,
                "New",
                "Name",
                "  Known@Example.COM ",
                "+38640111222"
        );

        assertSame(existing, resolved);
        assertSame(actor, resolved.getAssignedTo());
        assertEquals("+38640111222", resolved.getPhone());
        verify(clients, never()).findFirstCandidatesByCompanyIdAndNormalizedPhone(any(), any());
    }

    @Test
    void createsNewClientWhenEmailDoesNotExistEvenIfPhoneAlreadyExists() throws Exception {
        ClientRepository clients = mock(ClientRepository.class);
        PublicBookingWidgetService service = service(clients);
        Company company = company(42L);
        User actor = new User();
        Client samePhoneDifferentEmail = new Client();
        samePhoneDifferentEmail.setCompany(company);
        samePhoneDifferentEmail.setFirstName("Other");
        samePhoneDifferentEmail.setLastName("Person");
        samePhoneDifferentEmail.setEmail("other@example.com");
        samePhoneDifferentEmail.setPhone("+38640111222");

        when(clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(42L, "new@example.com"))
                .thenReturn(List.of());
        when(clients.findFirstCandidatesByCompanyIdAndNormalizedPhone(42L, "+38640111222"))
                .thenReturn(List.of(samePhoneDifferentEmail));
        when(clients.save(any(Client.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Client resolved = invokeFindOrCreate(
                service,
                company,
                actor,
                "New",
                "Client",
                "NEW@example.com",
                "+38640111222"
        );

        assertNotSame(samePhoneDifferentEmail, resolved);
        assertEquals("new@example.com", resolved.getEmail());
        assertEquals("New", resolved.getFirstName());
        assertEquals("Client", resolved.getLastName());
        assertSame(company, resolved.getCompany());
        assertSame(actor, resolved.getAssignedTo());
        verify(clients, never()).findFirstCandidatesByCompanyIdAndNormalizedPhone(any(), any());
    }

    private PublicBookingWidgetService service(ClientRepository clients) {
        return new PublicBookingWidgetService(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                clients,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "Europe/Ljubljana"
        );
    }

    private Company company(Long id) {
        Company company = new Company();
        company.setId(id);
        company.setName("Tenant");
        return company;
    }

    private Client invokeFindOrCreate(
            PublicBookingWidgetService service,
            Company company,
            User actor,
            String firstName,
            String lastName,
            String email,
            String phone
    ) throws Exception {
        Method method = PublicBookingWidgetService.class.getDeclaredMethod(
                "findOrCreateClient",
                Company.class,
                User.class,
                String.class,
                String.class,
                String.class,
                String.class
        );
        method.setAccessible(true);
        return (Client) method.invoke(service, company, actor, firstName, lastName, email, phone);
    }
}
