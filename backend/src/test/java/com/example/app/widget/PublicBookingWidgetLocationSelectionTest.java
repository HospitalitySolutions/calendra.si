package com.example.app.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class PublicBookingWidgetLocationSelectionTest {

    @Test
    void autoSelectsTheOnlyBookableLocation() throws Exception {
        Company company = company(42L);
        Location only = location(10L, company, "Maribor");
        LocationRepository locations = mock(LocationRepository.class);
        when(locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(42L))
                .thenReturn(List.of(only));

        Location resolved = invokeRequirePublicLocation(service(locations), company, null, false);

        assertSame(only, resolved);
    }

    @Test
    void requiresExplicitSelectionWhenMultipleBookableLocationsExist() throws Exception {
        Company company = company(42L);
        Location first = location(10L, company, "Maribor");
        Location second = location(11L, company, "Ljubljana");
        LocationRepository locations = mock(LocationRepository.class);
        when(locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(42L))
                .thenReturn(List.of(first, second));

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> invokeRequirePublicLocation(service(locations), company, null, false)
        );

        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
        assertEquals("Location selection is required.", error.getReason());
    }

    @Test
    void resolvesExplicitBookableLocationForMultiLocationTenant() throws Exception {
        Company company = company(42L);
        Location selected = location(11L, company, "Ljubljana");
        LocationRepository locations = mock(LocationRepository.class);
        when(locations.findByIdAndCompanyId(11L, 42L)).thenReturn(Optional.of(selected));

        Location resolved = invokeRequirePublicLocation(service(locations), company, 11L, false);

        assertSame(selected, resolved);
    }

    @Test
    void rejectsExplicitLocationThatIsNotPubliclyBookable() throws Exception {
        Company company = company(42L);
        Location hidden = location(11L, company, "Ljubljana");
        hidden.setPublicBookingEnabled(false);
        LocationRepository locations = mock(LocationRepository.class);
        when(locations.findByIdAndCompanyId(11L, 42L)).thenReturn(Optional.of(hidden));

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> invokeRequirePublicLocation(service(locations), company, 11L, true)
        );

        assertEquals(HttpStatus.BAD_REQUEST.value(), error.getStatusCode().value());
        assertEquals("Invalid location.", error.getReason());
    }

    private PublicBookingWidgetService service(LocationRepository locations) throws Exception {
        PublicBookingWidgetService service = new PublicBookingWidgetService(
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "Europe/Ljubljana"
        );
        Field field = PublicBookingWidgetService.class.getDeclaredField("locations");
        field.setAccessible(true);
        field.set(service, locations);
        return service;
    }

    private Location invokeRequirePublicLocation(
            PublicBookingWidgetService service,
            Company company,
            Long locationId,
            boolean bookingMutation
    ) throws Exception {
        Method method = PublicBookingWidgetService.class.getDeclaredMethod(
                "requirePublicLocation",
                Company.class,
                Long.class,
                boolean.class
        );
        method.setAccessible(true);
        try {
            return (Location) method.invoke(service, company, locationId, bookingMutation);
        } catch (InvocationTargetException ex) {
            if (ex.getCause() instanceof ResponseStatusException responseStatusException) {
                throw responseStatusException;
            }
            throw ex;
        }
    }

    private Company company(Long id) {
        Company company = new Company();
        company.setId(id);
        company.setName("Tenant");
        return company;
    }

    private Location location(Long id, Company company, String name) {
        Location location = new Location();
        location.setId(id);
        location.setCompany(company);
        location.setName(name);
        location.setActive(true);
        location.setPublicBookingEnabled(true);
        return location;
    }
}
