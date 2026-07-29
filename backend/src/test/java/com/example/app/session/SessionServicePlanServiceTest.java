package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SessionServicePlanServiceTest {
    @Mock private SessionTypeRepository sessionTypes;
    @Mock private SpaceRepository spaces;

    private SessionServicePlanService service;
    private Company company;
    private SessionType firstType;
    private SessionType secondType;
    private Space firstSpace;
    private Space secondSpace;

    @BeforeEach
    void setUp() {
        service = new SessionServicePlanService(sessionTypes, spaces);
        company = new Company();
        company.setId(1L);

        firstType = type(11L, "First", 30, 10);
        secondType = type(12L, "Second", 45, 5);
        firstSpace = space(21L, "Room 1");
        secondSpace = space(22L, "Room 2");

        when(sessionTypes.findByIdAndCompanyIdWithLinkedServices(11L, 1L)).thenReturn(Optional.of(firstType));
        when(sessionTypes.findByIdAndCompanyIdWithLinkedServices(12L, 1L)).thenReturn(Optional.of(secondType));
        when(spaces.findByIdAndCompanyId(21L, 1L)).thenReturn(Optional.of(firstSpace));
        when(spaces.findByIdAndCompanyId(22L, 1L)).thenReturn(Optional.of(secondSpace));
    }

    @Test
    void resolve_buildsContinuousChainAndUsesOnlyFinalServiceBreak() {
        LocalDateTime start = LocalDateTime.of(2026, 8, 3, 10, 0);
        var request = request(start, List.of(
                new SessionBookingController.BookingServiceRequest(12L, 2, 22L),
                new SessionBookingController.BookingServiceRequest(11L, 1, 21L)
        ));

        SessionServicePlanService.Plan plan = service.resolve(request, 1L, start, start.plusMinutes(1));

        assertEquals(start, plan.startTime());
        assertEquals(LocalDateTime.of(2026, 8, 3, 11, 15), plan.endTime());
        assertEquals(LocalDateTime.of(2026, 8, 3, 11, 20), plan.availabilityEndTime());
        assertEquals(2, plan.segments().size());
        assertSame(firstType, plan.segments().get(0).type());
        assertEquals(LocalDateTime.of(2026, 8, 3, 10, 30), plan.segments().get(1).startTime());

        SessionBooking booking = new SessionBooking();
        booking.setCompany(company);
        service.synchronize(booking, plan);

        assertSame(firstType, booking.getType());
        assertSame(firstSpace, booking.getSpace());
        assertEquals(2, booking.getServices().size());
        assertEquals(plan.endTime(), booking.getEndTime());
        assertEquals(plan.availabilityEndTime(), booking.getAvailabilityEndTime());
    }

    @Test
    void retimeExisting_preservesWholeServiceChainForLegacyEditors() {
        LocalDateTime start = LocalDateTime.of(2026, 8, 3, 10, 0);
        SessionServicePlanService.Plan original = service.resolve(
                request(start, List.of(
                        new SessionBookingController.BookingServiceRequest(11L, 0, 21L),
                        new SessionBookingController.BookingServiceRequest(12L, 1, 22L)
                )),
                1L,
                start,
                start.plusMinutes(1)
        );
        SessionBooking booking = new SessionBooking();
        booking.setCompany(company);
        service.synchronize(booking, original);
        String originalNameSnapshot = booking.getServices().get(0).getServiceNameSnapshot();
        firstType.setName("Renamed after booking");

        LocalDateTime movedStart = LocalDateTime.of(2026, 8, 3, 14, 0);
        SessionServicePlanService.Plan moved = service.retimeExisting(booking, movedStart);
        service.synchronize(booking, moved);

        assertEquals(originalNameSnapshot, booking.getServices().get(0).getServiceNameSnapshot());
        assertEquals(movedStart, moved.segments().get(0).startTime());
        assertEquals(LocalDateTime.of(2026, 8, 3, 14, 30), moved.segments().get(1).startTime());
        assertEquals(LocalDateTime.of(2026, 8, 3, 15, 15), moved.endTime());
        assertEquals(LocalDateTime.of(2026, 8, 3, 15, 20), moved.availabilityEndTime());
    }

    private SessionBookingController.BookingRequest request(
            LocalDateTime start,
            List<SessionBookingController.BookingServiceRequest> services
    ) {
        return new SessionBookingController.BookingRequest(
                100L,
                List.of(100L),
                200L,
                start.toString(),
                null,
                null,
                null,
                "",
                null,
                false,
                null,
                false,
                null,
                null,
                null,
                null,
                null,
                null,
                services
        );
    }

    private SessionType type(Long id, String name, int duration, int breakMinutes) {
        SessionType type = new SessionType();
        type.setId(id);
        type.setCompany(company);
        type.setName(name);
        type.setDurationMinutes(duration);
        type.setBreakMinutes(breakMinutes);
        type.setPriceCalculationMode(SessionPriceCalculationMode.PER_CLIENT);
        type.setActive(true);
        return type;
    }

    private Space space(Long id, String name) {
        Space space = new Space();
        space.setId(id);
        space.setCompany(company);
        space.setName(name);
        return space;
    }
}
