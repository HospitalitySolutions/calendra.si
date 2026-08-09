package com.example.app.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.app.location.Location;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashSet;
import org.junit.jupiter.api.Test;

class ConsultantLocationServiceTest {
    private final ConsultantLocationService service = new ConsultantLocationService(new ObjectMapper());

    @Test
    void allLocationConsultantIsAvailableAtAnyLocation() {
        User consultant = consultant(10L);
        consultant.setAvailableAllLocations(true);

        assertThat(service.isAvailableAt(consultant, 100L)).isTrue();
        assertThat(service.isAvailableAt(consultant, 200L)).isTrue();
    }

    @Test
    void selectedLocationConsultantIsOnlyAvailableAtAssignedBranches() {
        User consultant = consultant(10L);
        consultant.setAvailableAllLocations(false);
        Location assigned = location(100L);
        consultant.setLocations(new HashSet<>(java.util.Set.of(assigned)));

        assertThat(service.isAvailableAt(consultant, 100L)).isTrue();
        assertThat(service.isAvailableAt(consultant, 200L)).isFalse();
        assertThat(service.assignedLocationIds(consultant)).containsExactly(100L);
    }

    @Test
    void locationWorkingHoursOverrideFallsBackToGlobalSchedule() {
        User consultant = consultant(10L);
        consultant.setWorkingHoursJson("{\"sameForAllDays\":true,\"allDays\":{\"start\":\"09:00\",\"end\":\"17:00\"}}");
        consultant.setWorkingHoursByLocationJson("{\"100\":{\"sameForAllDays\":true,\"allDays\":{\"start\":\"12:00\",\"end\":\"18:00\"}}}");

        assertThat(service.workingHoursJsonFor(consultant, 100L)).contains("12:00").contains("18:00");
        assertThat(service.workingHoursJsonFor(consultant, 200L)).contains("09:00").contains("17:00");
        assertThat(service.workingHoursOverridesForResponse(consultant)).containsKey("100");
    }

    private User consultant(Long id) {
        User user = new User();
        user.setId(id);
        user.setActive(true);
        user.setConsultant(true);
        user.setLocations(new HashSet<>());
        return user;
    }

    private Location location(Long id) {
        Location location = new Location();
        location.setId(id);
        location.setActive(true);
        return location;
    }
}
