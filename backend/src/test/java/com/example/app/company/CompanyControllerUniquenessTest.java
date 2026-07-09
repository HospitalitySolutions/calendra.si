package com.example.app.company;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.billing.BillRepository;
import com.example.app.files.CompanyFileRepository;
import com.example.app.files.TenantFileS3Service;
import com.example.app.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class CompanyControllerUniquenessTest {

    @Mock
    private ClientCompanyRepository companies;

    @Mock
    private BillRepository bills;

    @Mock
    private CompanyFileRepository companyFiles;

    @Mock
    private TenantFileS3Service fileStorage;

    @Mock
    private PlatformTenantAccountLinkService platformTenantAccountLinkService;

    private CompanyController controller;

    private Company ownerCompany;
    private User me;

    @BeforeEach
    void setUp() {
        controller = new CompanyController(companies, bills, companyFiles, fileStorage, platformTenantAccountLinkService);
        ownerCompany = new Company();
        ownerCompany.setId(42L);
        me = new User();
        me.setCompany(ownerCompany);
    }

    @Test
    void create_conflictWhenDuplicateEmail() {
        when(companies.existsOtherWithNormalizedEmail(eq(42L), eq("dup@example.com"), isNull())).thenReturn(true);

        var req = new CompanyController.CompanyRequest(
                "Acme",
                null,
                null,
                null,
                "VAT123",
                null,
                "dup@example.com",
                null,
                null,
                null);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.create(req, me));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(companies, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void create_conflictWhenDuplicateVatId() {
        when(companies.existsOtherWithNormalizedEmail(eq(42L), eq("x@y.z"), isNull())).thenReturn(false);
        when(companies.existsOtherWithSameVatId(eq(42L), eq("10550631"), isNull())).thenReturn(true);

        var req = new CompanyController.CompanyRequest(
                "Other",
                null,
                null,
                null,
                "10550631",
                null,
                "x@y.z",
                null,
                null,
                null);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.create(req, me));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(companies, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void create_allowsMultipleCompaniesWithBlankEmailAndVat() {
        when(companies.save(org.mockito.ArgumentMatchers.any(ClientCompany.class))).thenAnswer(inv -> inv.getArgument(0));

        var req = new CompanyController.CompanyRequest("No billing ids", null, null, null, null, null, null, null, null, null);

        assertDoesNotThrow(() -> controller.create(req, me));
        assertDoesNotThrow(() -> controller.create(req, me));
        verify(companies, never()).existsOtherWithNormalizedEmail(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(companies, never()).existsOtherWithSameVatId(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void update_sameRowAllowedWhenEmailUnchanged() {
        ClientCompany existing = new ClientCompany();
        existing.setId(7L);
        existing.setOwnerCompany(ownerCompany);
        existing.setName("Acme");
        existing.setEmail("same@example.com");
        existing.setVatId("VAT999");

        when(companies.findByIdAndOwnerCompanyId(7L, 42L)).thenReturn(java.util.Optional.of(existing));
        when(companies.existsOtherWithNormalizedEmail(eq(42L), eq("same@example.com"), eq(7L))).thenReturn(false);
        when(companies.existsOtherWithSameVatId(eq(42L), eq("VAT999"), eq(7L))).thenReturn(false);
        when(companies.save(org.mockito.ArgumentMatchers.any(ClientCompany.class))).thenAnswer(inv -> inv.getArgument(0));

        var req = new CompanyController.CompanyRequest(
                "Acme",
                null,
                null,
                null,
                "VAT999",
                null,
                "same@example.com",
                null,
                null,
                null);

        assertDoesNotThrow(() -> controller.update(7L, req, me));
    }
}
