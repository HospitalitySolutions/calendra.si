package com.example.app.guest.tenant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.SessionType;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class GuestLocationAccessServiceTest {

    @Test
    void multipleBookableLocationsRequireExplicitSelection() {
        LocationRepository locations = mock(LocationRepository.class);
        when(locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(7L))
                .thenReturn(List.of(location(11L, true, true), location(12L, true, true)));

        GuestLocationAccessService service = new GuestLocationAccessService(locations);

        assertThatThrownBy(() -> service.resolveBookable(7L, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException response = (ResponseStatusException) ex;
                    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(response.getReason()).isEqualTo("Location selection is required.");
                });
    }

    @Test
    void soleBookableLocationIsAutoSelected() {
        Location selected = location(11L, true, true);
        LocationRepository locations = mock(LocationRepository.class);
        when(locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(7L))
                .thenReturn(List.of(selected));

        GuestLocationAccessService service = new GuestLocationAccessService(locations);

        assertThat(service.resolveBookable(7L, null)).isSameAs(selected);
    }

    @Test
    void hiddenLocationCannotBeSelectedExplicitly() {
        Location hidden = location(11L, false, true);
        LocationRepository locations = mock(LocationRepository.class);
        when(locations.findByIdAndCompanyId(11L, 7L)).thenReturn(Optional.of(hidden));

        GuestLocationAccessService service = new GuestLocationAccessService(locations);

        assertThatThrownBy(() -> service.resolveBookable(7L, 11L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void serviceLocationAllowlistIsEnforced() {
        Location maribor = location(11L, true, true);
        Location ljubljana = location(12L, true, true);
        SessionType type = new SessionType();
        type.setAvailableAllLocations(false);
        type.setLocations(Set.of(maribor));

        GuestLocationAccessService service = new GuestLocationAccessService(mock(LocationRepository.class));

        assertThat(service.isServiceAvailableAt(type, maribor.getId())).isTrue();
        assertThat(service.isServiceAvailableAt(type, ljubljana.getId())).isFalse();
        assertThatThrownBy(() -> service.requireServiceAvailableAt(type, ljubljana))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    private static Location location(Long id, boolean discoverable, boolean publicBookingEnabled) {
        Location location = new Location();
        location.setId(id);
        location.setActive(true);
        location.setGuestAppDiscoverable(discoverable);
        location.setPublicBookingEnabled(publicBookingEnabled);
        return location;
    }
}
