package com.example.app.reminder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.guest.notifications.GuestPushService;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.TenantReservationRulesService;
import com.example.app.settings.TenantSmsQuotaService;
import com.example.app.sms.SmsGateway;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ReminderBookingLocationPresentationTest {

    @Test
    @SuppressWarnings("unchecked")
    void bookingTokensUseEventLocationIdentityAndScopedWidgetUrl() throws Exception {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        LocationPublicPresentationService presentationService = mock(LocationPublicPresentationService.class);
        ReminderService service = new ReminderService(
                null,
                "",
                "https://app.calendra.test",
                "",
                "",
                settings,
                mock(CompanyRepository.class),
                mock(SessionBookingRepository.class),
                mock(SmsGateway.class),
                mock(GuestNotificationService.class),
                mock(GuestPushService.class),
                mock(TenantSmsQuotaService.class),
                null,
                null,
                null,
                mock(TenantReservationRulesService.class),
                presentationService
        );

        Company company = new Company();
        company.setId(1L);
        company.setName("Generic company");
        company.setTenantCode("tenant-one");

        Location location = new Location();
        location.setId(12L);
        location.setCompany(company);
        location.setName("Internal Maribor");
        location.setAddress("Glavni trg 1");
        location.setPostalCode("2000");
        location.setCity("Maribor");
        location.setCountry("SI");
        location.setTimezone("Europe/Ljubljana");

        when(presentationService.resolve(location)).thenReturn(new LocationPublicPresentationService.PublicPresentation(
                12L, 1L, "Avisensa Maribor", "Glavni trg 1, 2000 Maribor", null,
                "+386 2 123 45 67", "maribor@example.test", "/api/public/widget/location-assets?key=logo", "logo",
                true, true, true, true, true, null
        ));

        Client client = new Client();
        client.setFirstName("Ana");
        client.setLastName("Novak");

        SessionBooking booking = new SessionBooking();
        booking.setId(44L);
        booking.setCompany(company);
        booking.setLocation(location);
        booking.setClient(client);
        booking.setStartTime(LocalDateTime.of(2026, 8, 11, 10, 0));
        booking.setEndTime(LocalDateTime.of(2026, 8, 11, 11, 0));

        Method method = ReminderService.class.getDeclaredMethod(
                "buildTemplateTokens", SessionBooking.class, LocalDateTime.class, LocalDateTime.class);
        method.setAccessible(true);
        Map<String, String> tokens = (Map<String, String>) method.invoke(service, booking, null, null);

        assertThat(tokens.get("{{companyName}}")).isEqualTo("Avisensa Maribor");
        assertThat(tokens.get("{{ime_podjetja}}")).isEqualTo("Avisensa Maribor");
        assertThat(tokens.get("{{locationName}}")).isEqualTo("Avisensa Maribor");
        assertThat(tokens.get("{{locationAddress}}")).isEqualTo("Glavni trg 1, 2000 Maribor");
        assertThat(tokens.get("{{locationPhone}}")).isEqualTo("+386 2 123 45 67");
        assertThat(tokens.get("{{locationEmail}}")).isEqualTo("maribor@example.test");
        assertThat(tokens.get("{{fizicni_naslov}}")).isEqualTo("Glavni trg 1, 2000 Maribor, SI");
        assertThat(tokens.get("{{rescheduleLink}}")).isEqualTo("https://app.calendra.test/widget/tenant-one?locationId=12");
    }
}
