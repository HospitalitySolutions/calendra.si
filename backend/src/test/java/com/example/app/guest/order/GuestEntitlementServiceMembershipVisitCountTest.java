package com.example.app.guest.order;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsage;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.location.Location;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingStatus;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Test;

class GuestEntitlementServiceMembershipVisitCountTest {

    @Test
    void membershipVisitsAreDistinctEffectiveCheckedOutBookingsOnly() {
        GuestEntitlementRepository entitlements = mock(GuestEntitlementRepository.class);
        GuestEntitlementUsageRepository usages = mock(GuestEntitlementUsageRepository.class);
        TimeService timeService = mock(TimeService.class);
        GuestEntitlementService service = new GuestEntitlementService(entitlements, usages, timeService);

        Company company = new Company();
        company.setId(10L);
        Location location = new Location();
        location.setId(20L);
        location.setCompany(company);
        location.setTimezone("Europe/Ljubljana");

        GuestEntitlement membership = new GuestEntitlement();
        membership.setId(100L);
        membership.setCompany(company);
        membership.setEntitlementType(EntitlementType.MEMBERSHIP);
        membership.setVisitCount(99); // legacy stored value must not be authoritative

        LocalDateTime now = LocalDateTime.of(2026, 8, 10, 12, 0);
        when(timeService.localDateTime(eq(ZoneId.of("Europe/Ljubljana")), eq(10L))).thenReturn(now);

        SessionBooking explicitlyCheckedOut = booking(1L, company, location,
                now.minusHours(2), now.minusHours(1), SessionBookingStatus.CHECKED_OUT);
        SessionBooking naturallyCheckedOut = booking(2L, company, location,
                now.minusHours(2), now.minusMinutes(30), SessionBookingStatus.RESERVED);
        SessionBooking cancelled = booking(3L, company, location,
                now.minusHours(2), now.minusMinutes(30), SessionBookingStatus.CANCELLED);
        SessionBooking noShow = booking(4L, company, location,
                now.minusHours(2), now.minusMinutes(30), SessionBookingStatus.NO_SHOW);
        SessionBooking future = booking(5L, company, location,
                now.plusHours(1), now.plusHours(2), SessionBookingStatus.RESERVED);

        // Two usage rows for booking #1 emulate multi-service coverage. It must still be one visit.
        when(usages.findAllByEntitlementIdIn(anyCollection())).thenReturn(List.of(
                usage(membership, explicitlyCheckedOut),
                usage(membership, explicitlyCheckedOut),
                usage(membership, naturallyCheckedOut),
                usage(membership, cancelled),
                usage(membership, noShow),
                usage(membership, future),
                usage(membership, null) // standalone scan never counts as a visit
        ));

        assertThat(service.membershipVisitCount(membership)).isEqualTo(2);

        // If a previously counted booking is later cancelled/no-show/removed, it stops counting.
        explicitlyCheckedOut.setBookingStatus(SessionBookingStatus.CANCELLED);
        assertThat(service.membershipVisitCount(membership)).isEqualTo(1);
    }

    private static SessionBooking booking(
            Long id,
            Company company,
            Location location,
            LocalDateTime start,
            LocalDateTime end,
            String status
    ) {
        SessionBooking booking = new SessionBooking();
        booking.setId(id);
        booking.setCompany(company);
        booking.setLocation(location);
        booking.setStartTime(start);
        booking.setEndTime(end);
        booking.setBookingStatus(status);
        return booking;
    }

    private static GuestEntitlementUsage usage(GuestEntitlement entitlement, SessionBooking booking) {
        GuestEntitlementUsage usage = new GuestEntitlementUsage();
        usage.setEntitlement(entitlement);
        usage.setSessionBooking(booking);
        return usage;
    }
}
