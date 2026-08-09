package com.example.app.guest.scanner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.commerce.CommerceLocationScopeService;
import com.example.app.company.Company;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsage;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.Role;
import com.example.app.user.User;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class WalletEntitlementScannerLocationScopeTest {
    @Mock private GuestEntitlementRepository entitlements;
    @Mock private GuestEntitlementUsageRepository usages;
    @Mock private SessionBookingCreationService bookingCreationService;
    @Mock private SessionBookingRepository sessionBookings;
    @Mock private CommerceLocationScopeService commerceLocations;
    @Mock private LocationRepository locations;

    private WalletEntitlementScannerController controller;
    private User admin;
    private GuestEntitlement entitlement;
    private Location first;
    private Location second;

    @BeforeEach
    void setUp() {
        controller = new WalletEntitlementScannerController(entitlements, usages, bookingCreationService, sessionBookings);
        ReflectionTestUtils.setField(controller, "commerceLocations", commerceLocations);
        ReflectionTestUtils.setField(controller, "locations", locations);

        Company company = new Company();
        company.setId(1L);
        company.setName("Scanner company");

        admin = new User();
        admin.setId(5L);
        admin.setCompany(company);
        admin.setRole(Role.ADMIN);
        admin.setFirstName("Admin");
        admin.setLastName("User");

        first = location(11L, company, "First");
        second = location(12L, company, "Second");

        entitlement = new GuestEntitlement();
        entitlement.setId(20L);
        entitlement.setCompany(company);
        entitlement.setEntitlementCode("PACK-20");
        entitlement.setEntitlementType(EntitlementType.PACK);
        entitlement.setStatus(EntitlementStatus.ACTIVE);
        entitlement.setRemainingUses(3);
        entitlement.setValidFrom(Instant.now().minusSeconds(60));

        when(entitlements.findByEntitlementCode("PACK-20")).thenReturn(Optional.of(entitlement));
        when(usages.existsByEntitlementIdAndReasonAndUsedAtAfter(eq(20L), any(), any())).thenReturn(false);
    }

    @Test
    void standaloneScan_requiresLocationWhenEntitlementIsValidAtMultipleActiveLocations() {
        when(locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(1L))
                .thenReturn(List.of(first, second));
        when(commerceLocations.entitlementAvailableAt(entitlement, 11L)).thenReturn(true);
        when(commerceLocations.entitlementAvailableAt(entitlement, 12L)).thenReturn(true);

        var response = controller.scan(
                new WalletEntitlementScannerController.ScanRequest("PACK-20", "QR", null, null, null, null),
                admin);

        assertThat(response.success()).isFalse();
        assertThat(response.result()).isEqualTo("LOCATION_REQUIRED");
        verify(usages, never()).save(any());
    }

    @Test
    void standaloneScan_rejectsExplicitLocationOutsideEntitlementScope() {
        when(locations.findByIdAndCompanyId(12L, 1L)).thenReturn(Optional.of(second));
        when(commerceLocations.entitlementAvailableAt(entitlement, 12L)).thenReturn(false);

        var response = controller.scan(
                new WalletEntitlementScannerController.ScanRequest("PACK-20", "MANUAL", null, null, null, 12L),
                admin);

        assertThat(response.success()).isFalse();
        assertThat(response.result()).isEqualTo("LOCATION_MISMATCH");
        verify(usages, never()).save(any());
    }

    @Test
    void standaloneScan_persistsResolvedLocationOnUsage() {
        when(locations.findByIdAndCompanyId(11L, 1L)).thenReturn(Optional.of(first));
        when(commerceLocations.entitlementAvailableAt(entitlement, 11L)).thenReturn(true);
        when(usages.save(any(GuestEntitlementUsage.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = controller.scan(
                new WalletEntitlementScannerController.ScanRequest("PACK-20", "QR", null, null, null, 11L),
                admin);

        assertThat(response.success()).isTrue();
        assertThat(response.result()).isEqualTo("VISIT_DEDUCTED");
        assertThat(entitlement.getRemainingUses()).isEqualTo(2);

        ArgumentCaptor<GuestEntitlementUsage> usageCaptor = ArgumentCaptor.forClass(GuestEntitlementUsage.class);
        verify(usages).save(usageCaptor.capture());
        assertThat(usageCaptor.getValue().getLocation()).isSameAs(first);
        assertThat(usageCaptor.getValue().getScannedBy()).isSameAs(admin);
    }

    private static Location location(Long id, Company company, String name) {
        Location location = new Location();
        location.setId(id);
        location.setCompany(company);
        location.setName(name);
        location.setActive(true);
        return location;
    }
}
