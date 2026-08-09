package com.example.app.widget.manage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.session.SessionBooking;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class PublicBookingManageTokenLocationTimezoneTest {

    @Test
    void tokenExpiryUsesBookingLocationTimezoneBeforeConfiguredFallback() {
        PublicBookingManageTokenRepository repository = mock(PublicBookingManageTokenRepository.class);
        when(repository.save(any(PublicBookingManageToken.class))).thenAnswer(invocation -> invocation.getArgument(0));
        PublicBookingManageTokenService service = new PublicBookingManageTokenService(repository);

        Company company = new Company();
        company.setId(1L);
        Location location = new Location();
        location.setId(11L);
        location.setCompany(company);
        location.setName("New York");
        location.setTimezone("America/New_York");

        SessionBooking booking = new SessionBooking();
        booking.setId(51L);
        booking.setCompany(company);
        booking.setLocation(location);
        booking.setEndTime(LocalDateTime.of(2026, 8, 10, 10, 0));

        service.createToken(booking, ZoneId.of("Europe/Ljubljana"));

        org.mockito.ArgumentCaptor<PublicBookingManageToken> captor = org.mockito.ArgumentCaptor.forClass(PublicBookingManageToken.class);
        org.mockito.Mockito.verify(repository).save(captor.capture());
        assertThat(captor.getValue().getExpiresAt())
                .isEqualTo(LocalDateTime.of(2026, 8, 10, 10, 0).atZone(ZoneId.of("America/New_York")).toInstant());
    }
}
