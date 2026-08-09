package com.example.app.widget.manage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.billing.OpenBillSyncService;
import com.example.app.client.Client;
import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.group.ClientGroup;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.reminder.ReminderService;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.BookingChangePublisher;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionServicePlanService;
import com.example.app.session.SessionType;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.TenantReservationRulesService;
import com.example.app.widget.WebsiteWidgetSettingsService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class PublicBookingManageLocationScopeTest {

    @Test
    void getUsesBookingLocationRulesPresentationAndTimezone() {
        Fixture f = fixture();
        SessionBooking booking = f.booking(f.maribor, false);
        f.token.setBooking(booking);

        TenantReservationRulesService.TenantReservationRules locationRules = rules(true, false);
        when(f.rules.resolve(f.company.getId(), f.maribor.getId())).thenReturn(locationRules);
        when(f.time.localDateTime(ZoneId.of("Europe/Ljubljana")))
                .thenReturn(LocalDateTime.of(2026, 8, 9, 10, 0));
        when(f.presentation.resolve(f.maribor)).thenReturn(new LocationPublicPresentationService.PublicPresentation(
                f.maribor.getId(),
                f.company.getId(),
                "Calendra Maribor",
                "Glavni trg 1, 2000 Maribor",
                "Maribor branch",
                "+386 2 555 0101",
                "maribor@example.test",
                "/api/public/widget/location-assets?key=maribor-logo",
                "maribor-logo",
                true,
                true,
                true,
                true,
                true,
                "place-maribor"
        ));

        PublicBookingManageController.BookingManageResponse response = f.service.get("token");

        assertThat(response.locationId()).isEqualTo(f.maribor.getId());
        assertThat(response.tenantName()).isEqualTo("Calendra Maribor");
        assertThat(response.tenantLogoUrl()).contains("maribor-logo");
        assertThat(response.locationAddress()).isEqualTo("Glavni trg 1, 2000 Maribor");
        assertThat(response.locationPhone()).isEqualTo("+386 2 555 0101");
        assertThat(response.locationEmail()).isEqualTo("maribor@example.test");
        assertThat(response.timezone()).isEqualTo("Europe/Ljubljana");
        assertThat(response.canCancel()).isTrue();
        assertThat(response.canModify()).isFalse();
        verify(f.rules).resolve(f.company.getId(), f.maribor.getId());
        verify(f.presentation).resolve(f.maribor);
    }

    @Test
    void groupAvailabilityOnlyOffersOriginalBookingLocation() {
        Fixture f = fixture();
        SessionBooking booking = f.booking(f.maribor, true);
        f.token.setBooking(booking);
        when(f.rules.resolve(f.company.getId(), f.maribor.getId())).thenReturn(rules(true, true));
        when(f.time.localDateTime(ZoneId.of("Europe/Ljubljana")))
                .thenReturn(LocalDateTime.of(2026, 8, 9, 10, 0));
        when(f.time.localDate(ZoneId.of("Europe/Ljubljana"))).thenReturn(LocalDate.of(2026, 8, 9));

        SessionBooking mariborTarget = f.groupTarget(101L, "group-maribor", f.maribor, LocalDateTime.of(2026, 8, 10, 11, 0));
        SessionBooking koperTarget = f.groupTarget(102L, "group-koper", f.koper, LocalDateTime.of(2026, 8, 10, 12, 0));
        when(f.bookings.findPublicGroupSessionCandidates(
                f.company.getId(), booking.getType().getId(),
                LocalDateTime.of(2026, 8, 10, 0, 0),
                LocalDateTime.of(2026, 8, 11, 0, 0)))
                .thenReturn(List.of(koperTarget, mariborTarget));

        PublicBookingManageController.AvailabilityResponse response = f.service.availability("token", "2026-08-10");

        assertThat(response.slots()).extracting(PublicBookingManageController.AvailabilitySlotResponse::slotId)
                .containsExactly("101");
        verify(f.bookingCreation).validateExistingBookingWindow(
                eq(mariborTarget), any(), any(), any(), any(), any(), anyBoolean(), anyBoolean(),
                eq(true), anyBoolean(), eq(false));
        verify(f.bookingCreation, never()).validateExistingBookingWindow(
                eq(koperTarget), any(), any(), any(), any(), any(), anyBoolean(), anyBoolean(),
                eq(true), anyBoolean(), eq(false));
    }

    @Test
    void groupRescheduleRejectsCrossLocationTargetEvenWhenCalledDirectly() {
        Fixture f = fixture();
        SessionBooking booking = f.booking(f.maribor, true);
        f.token.setBooking(booking);
        SessionBooking koperTarget = f.groupTarget(102L, "group-koper", f.koper, LocalDateTime.of(2026, 8, 10, 12, 0));

        when(f.rules.resolve(f.company.getId(), f.maribor.getId())).thenReturn(rules(true, true));
        when(f.time.localDateTime(ZoneId.of("Europe/Ljubljana")))
                .thenReturn(LocalDateTime.of(2026, 8, 9, 10, 0));
        when(f.bookings.findByIdAndCompanyId(booking.getId(), f.company.getId())).thenReturn(Optional.of(booking));
        when(f.bookings.findByIdAndCompanyId(koperTarget.getId(), f.company.getId())).thenReturn(Optional.of(koperTarget));
        when(f.companies.findByIdForUpdate(f.company.getId())).thenReturn(Optional.of(f.company));

        assertThatThrownBy(() -> f.service.reschedule(
                "token", new PublicBookingManageController.RescheduleRequest(null, koperTarget.getId())))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException response = (ResponseStatusException) ex;
                    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(response.getReason()).isEqualTo("Select a group session at the original booking location.");
                });

        assertThat(booking.getLocation()).isSameAs(f.maribor);
        verify(f.bookings, never()).save(booking);
    }

    private static TenantReservationRulesService.TenantReservationRules rules(
            boolean cancellationAllowed,
            boolean modificationAllowed
    ) {
        return new TenantReservationRulesService.TenantReservationRules(
                0,
                60,
                12,
                24,
                true,
                cancellationAllowed,
                modificationAllowed,
                TenantReservationRulesService.NO_SHOW_MANUAL,
                15
        );
    }

    private static Fixture fixture() {
        PublicBookingManageTokenService tokenService = mock(PublicBookingManageTokenService.class);
        CompanyRepository companies = mock(CompanyRepository.class);
        AppSettingRepository settings = mock(AppSettingRepository.class);
        SessionBookingRepository bookings = mock(SessionBookingRepository.class);
        BookableSlotRepository slots = mock(BookableSlotRepository.class);
        SessionBookingCreationService bookingCreation = mock(SessionBookingCreationService.class);
        SessionServicePlanService servicePlans = mock(SessionServicePlanService.class);
        ReminderService reminders = mock(ReminderService.class);
        BookingChangePublisher publisher = mock(BookingChangePublisher.class);
        OpenBillSyncService openBills = mock(OpenBillSyncService.class);
        WebsiteWidgetSettingsService widgetSettings = mock(WebsiteWidgetSettingsService.class);
        TenantReservationRulesService rules = mock(TenantReservationRulesService.class);
        LocationPublicPresentationService presentation = mock(LocationPublicPresentationService.class);
        TimeService time = mock(TimeService.class);

        PublicBookingManageService service = new PublicBookingManageService(
                tokenService,
                companies,
                settings,
                bookings,
                slots,
                bookingCreation,
                servicePlans,
                reminders,
                publisher,
                openBills,
                widgetSettings,
                rules,
                presentation,
                time,
                "Europe/Ljubljana"
        );

        Company company = new Company();
        company.setId(1L);
        company.setName("Calendra");
        company.setTenantCode("calendra");

        Location maribor = location(11L, company, "Maribor", "Europe/Ljubljana");
        Location koper = location(12L, company, "Koper", "Europe/Ljubljana");

        PublicBookingManageToken token = new PublicBookingManageToken();
        token.setId(501L);
        token.setCompany(company);
        when(tokenService.resolve("token")).thenReturn(token);

        return new Fixture(
                service, tokenService, companies, bookings, bookingCreation, rules, presentation, time,
                company, maribor, koper, token
        );
    }

    private static Location location(Long id, Company company, String name, String timezone) {
        Location location = new Location();
        location.setId(id);
        location.setCompany(company);
        location.setName(name);
        location.setTimezone(timezone);
        location.setActive(true);
        location.setPublicBookingEnabled(true);
        return location;
    }

    private record Fixture(
            PublicBookingManageService service,
            PublicBookingManageTokenService tokenService,
            CompanyRepository companies,
            SessionBookingRepository bookings,
            SessionBookingCreationService bookingCreation,
            TenantReservationRulesService rules,
            LocationPublicPresentationService presentation,
            TimeService time,
            Company company,
            Location maribor,
            Location koper,
            PublicBookingManageToken token
    ) {
        SessionBooking booking(Location location, boolean group) {
            SessionType type = new SessionType();
            type.setId(31L);
            type.setName("Consultation");
            type.setDurationMinutes(60);
            type.setMaxParticipantsPerSession(10);

            Client client = new Client();
            client.setId(41L);
            client.setFirstName("Ana");

            SessionBooking booking = new SessionBooking();
            booking.setId(51L);
            booking.setCompany(company);
            booking.setLocation(location);
            booking.setClient(client);
            booking.setType(type);
            booking.setStartTime(LocalDateTime.of(2026, 8, 11, 10, 0));
            booking.setEndTime(LocalDateTime.of(2026, 8, 11, 11, 0));
            booking.setBookingStatus(SessionBookingStatus.RESERVED);
            booking.setBookingGroupKey("group-current");
            if (group) {
                ClientGroup clientGroup = new ClientGroup();
                clientGroup.setId(61L);
                clientGroup.setCompany(company);
                clientGroup.setName("Group");
                booking.setClientGroup(clientGroup);
            }
            return booking;
        }

        SessionBooking groupTarget(Long id, String groupKey, Location location, LocalDateTime start) {
            SessionType type = new SessionType();
            type.setId(31L);
            type.setName("Consultation");
            type.setDurationMinutes(60);
            type.setMaxParticipantsPerSession(10);

            ClientGroup clientGroup = new ClientGroup();
            clientGroup.setId(id + 1000);
            clientGroup.setCompany(company);
            clientGroup.setName("Target group");

            SessionBooking target = new SessionBooking();
            target.setId(id);
            target.setCompany(company);
            target.setLocation(location);
            target.setType(type);
            target.setClientGroup(clientGroup);
            target.setBookingGroupKey(groupKey);
            target.setStartTime(start);
            target.setEndTime(start.plusHours(1));
            target.setBookingStatus(SessionBookingStatus.RESERVED);
            return target;
        }
    }
}
