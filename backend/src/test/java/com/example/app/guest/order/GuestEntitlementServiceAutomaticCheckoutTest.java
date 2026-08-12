package com.example.app.guest.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsage;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.ProductType;
import com.example.app.location.Location;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionType;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class GuestEntitlementServiceAutomaticCheckoutTest {

    @Test
    void checkoutPrefersMembershipBeforePackAndTicketAndIsIdempotent() {
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = mock(GuestEntitlementUsageRepository.class);
        TimeService timeService = mock(TimeService.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages, timeService);

        Fixture fixture = fixture();
        Instant now = Instant.parse("2026-08-12T12:00:00Z");
        when(timeService.instant(1L)).thenReturn(now);

        GuestEntitlement membership = entitlement(101L, EntitlementType.MEMBERSHIP, ProductType.MEMBERSHIP,
                fixture, null, now.plusSeconds(90 * 86400L));
        GuestEntitlement pack = entitlement(102L, EntitlementType.PACK, ProductType.PACK,
                fixture, 4, now.plusSeconds(10 * 86400L));
        GuestEntitlement ticket = entitlement(103L, EntitlementType.TICKET, ProductType.CLASS_TICKET,
                fixture, 1, now.plusSeconds(2 * 86400L));
        when(entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(
                eq(2L), eq(1L), anyCollection()))
                .thenReturn(List.of(ticket, pack, membership));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<GuestEntitlementUsage> persistedUsages = new ArrayList<>();
        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(10L)).thenAnswer(invocation -> List.copyOf(persistedUsages));
        when(usages.save(any(GuestEntitlementUsage.class))).thenAnswer(invocation -> {
            GuestEntitlementUsage usage = invocation.getArgument(0);
            persistedUsages.add(usage);
            return usage;
        });

        assertThat(service.reconcileAutomaticEntitlementsForCheckedOutBooking(fixture.booking)).isEqualTo(1);
        assertThat(persistedUsages).hasSize(1);
        assertThat(persistedUsages.getFirst().getEntitlement()).isSameAs(membership);
        assertThat(pack.getRemainingUses()).isEqualTo(4);
        assertThat(ticket.getRemainingUses()).isEqualTo(1);

        // Re-saving CHECKED_OUT must never add another visit or consume another entitlement.
        assertThat(service.reconcileAutomaticEntitlementsForCheckedOutBooking(fixture.booking)).isZero();
        assertThat(persistedUsages).hasSize(1);
    }

    @Test
    void checkoutFallsBackToPackAndCancellationRestoresExactVisit() {
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = mock(GuestEntitlementUsageRepository.class);
        TimeService timeService = mock(TimeService.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages, timeService);

        Fixture fixture = fixture();
        Instant now = Instant.parse("2026-08-12T12:00:00Z");
        when(timeService.instant(1L)).thenReturn(now);

        GuestEntitlement pack = entitlement(202L, EntitlementType.PACK, ProductType.PACK,
                fixture, 4, now.plusSeconds(30 * 86400L));
        GuestEntitlement ticket = entitlement(203L, EntitlementType.TICKET, ProductType.CLASS_TICKET,
                fixture, 1, now.plusSeconds(5 * 86400L));
        when(entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(
                eq(2L), eq(1L), anyCollection()))
                .thenReturn(List.of(ticket, pack));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<GuestEntitlementUsage> persistedUsages = new ArrayList<>();
        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(10L)).thenAnswer(invocation -> List.copyOf(persistedUsages));
        when(usages.save(any(GuestEntitlementUsage.class))).thenAnswer(invocation -> {
            GuestEntitlementUsage usage = invocation.getArgument(0);
            persistedUsages.add(usage);
            return usage;
        });
        Mockito.doAnswer(invocation -> {
            persistedUsages.removeAll(invocation.getArgument(0));
            return null;
        }).when(usages).deleteAll(any());

        assertThat(service.reconcileAutomaticEntitlementsForCheckedOutBooking(fixture.booking)).isEqualTo(1);
        assertThat(pack.getRemainingUses()).isEqualTo(3);
        assertThat(persistedUsages.getFirst().getEntitlement()).isSameAs(pack);
        assertThat(persistedUsages.getFirst().getUnitsBefore()).isEqualTo(4);
        assertThat(persistedUsages.getFirst().getUnitsAfter()).isEqualTo(3);

        fixture.booking.setBookingStatus(SessionBookingStatus.CANCELLED);
        assertThat(service.maybeRestoreCreditForBooking(fixture.booking)).isTrue();
        assertThat(pack.getRemainingUses()).isEqualTo(4);
        assertThat(pack.getStatus()).isEqualTo(EntitlementStatus.ACTIVE);
        assertThat(persistedUsages).isEmpty();
    }

    @Test
    void cancellationRemovesMembershipVisitUsageWithoutChangingFiniteBalances() {
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = mock(GuestEntitlementUsageRepository.class);
        TimeService timeService = mock(TimeService.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages, timeService);

        Fixture fixture = fixture();
        Instant now = Instant.parse("2026-08-12T12:00:00Z");
        when(timeService.instant(1L)).thenReturn(now);

        GuestEntitlement membership = entitlement(301L, EntitlementType.MEMBERSHIP, ProductType.MEMBERSHIP,
                fixture, null, now.plusSeconds(30 * 86400L));
        when(entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(
                eq(2L), eq(1L), anyCollection()))
                .thenReturn(List.of(membership));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<GuestEntitlementUsage> persistedUsages = new ArrayList<>();
        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(10L)).thenAnswer(invocation -> List.copyOf(persistedUsages));
        when(usages.save(any(GuestEntitlementUsage.class))).thenAnswer(invocation -> {
            GuestEntitlementUsage usage = invocation.getArgument(0);
            persistedUsages.add(usage);
            return usage;
        });
        Mockito.doAnswer(invocation -> {
            persistedUsages.removeAll(invocation.getArgument(0));
            return null;
        }).when(usages).deleteAll(any());

        assertThat(service.reconcileAutomaticEntitlementsForCheckedOutBooking(fixture.booking)).isEqualTo(1);
        assertThat(persistedUsages).hasSize(1);
        assertThat(membership.getRemainingUses()).isNull();

        fixture.booking.setBookingStatus(SessionBookingStatus.CANCELLED);
        assertThat(service.maybeRestoreCreditForBooking(fixture.booking)).isTrue();
        assertThat(persistedUsages).isEmpty();
        assertThat(membership.getRemainingUses()).isNull();
        assertThat(membership.getStatus()).isEqualTo(EntitlementStatus.ACTIVE);
    }

    @Test
    void checkoutUsesSingleTicketWhenNoMembershipOrPackIsAvailable() {
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = mock(GuestEntitlementUsageRepository.class);
        TimeService timeService = mock(TimeService.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages, timeService);

        Fixture fixture = fixture();
        Instant now = Instant.parse("2026-08-12T12:00:00Z");
        when(timeService.instant(1L)).thenReturn(now);

        GuestEntitlement exhaustedPack = entitlement(401L, EntitlementType.PACK, ProductType.PACK,
                fixture, 0, now.plusSeconds(30 * 86400L));
        GuestEntitlement ticket = entitlement(402L, EntitlementType.TICKET, ProductType.CLASS_TICKET,
                fixture, 1, now.plusSeconds(30 * 86400L));
        when(entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(
                eq(2L), eq(1L), anyCollection()))
                .thenReturn(List.of(exhaustedPack, ticket));
        when(entitlements.save(any(GuestEntitlement.class))).thenAnswer(invocation -> invocation.getArgument(0));

        List<GuestEntitlementUsage> persistedUsages = new ArrayList<>();
        when(usages.findAllBySessionBookingIdOrderByUsedAtAsc(10L)).thenAnswer(invocation -> List.copyOf(persistedUsages));
        when(usages.save(any(GuestEntitlementUsage.class))).thenAnswer(invocation -> {
            GuestEntitlementUsage usage = invocation.getArgument(0);
            persistedUsages.add(usage);
            return usage;
        });

        assertThat(service.reconcileAutomaticEntitlementsForCheckedOutBooking(fixture.booking)).isEqualTo(1);
        assertThat(persistedUsages).hasSize(1);
        assertThat(persistedUsages.getFirst().getEntitlement()).isSameAs(ticket);
        assertThat(ticket.getRemainingUses()).isZero();
        assertThat(ticket.getStatus()).isEqualTo(EntitlementStatus.USED_UP);
    }

    private static Fixture fixture() {
        Company company = new Company();
        company.setId(1L);
        Client client = new Client();
        client.setId(2L);
        client.setCompany(company);
        Location location = new Location();
        location.setId(3L);
        location.setCompany(company);
        SessionType type = new SessionType();
        type.setId(4L);
        type.setCompany(company);
        type.setName("Pilates");

        SessionBooking booking = new SessionBooking();
        booking.setId(10L);
        booking.setCompany(company);
        booking.setClient(client);
        booking.setLocation(location);
        booking.setType(type);
        booking.setBookingStatus(SessionBookingStatus.CHECKED_OUT);
        return new Fixture(company, client, type, booking);
    }

    private static GuestEntitlement entitlement(
            Long id,
            EntitlementType type,
            ProductType productType,
            Fixture fixture,
            Integer remainingUses,
            Instant validUntil
    ) {
        GuestProduct product = new GuestProduct();
        product.setId(id + 1000);
        product.setCompany(fixture.company);
        product.setProductType(productType);
        product.setName(productType.name());
        product.setSessionType(fixture.sessionType);

        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setId(id);
        entitlement.setCompany(fixture.company);
        entitlement.setClient(fixture.client);
        entitlement.setProduct(product);
        entitlement.setEntitlementType(type);
        entitlement.setStatus(EntitlementStatus.ACTIVE);
        entitlement.setRemainingUses(remainingUses);
        entitlement.setValidFrom(Instant.parse("2026-01-01T00:00:00Z"));
        entitlement.setValidUntil(validUntil);
        return entitlement;
    }

    private record Fixture(Company company, Client client, SessionType sessionType, SessionBooking booking) {}
}
