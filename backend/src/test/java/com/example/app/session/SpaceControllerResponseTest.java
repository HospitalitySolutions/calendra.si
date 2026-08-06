package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.location.LocationService;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SpaceControllerResponseTest {

    @Mock
    private SpaceRepository repo;
    @Mock
    private LocationService locations;

    private SpaceController controller;
    private Company company;
    private User me;

    @BeforeEach
    void setUp() {
        controller = new SpaceController(repo, locations);
        company = new Company();
        company.setId(42L);
        me = new User();
        me.setCompany(company);
    }

    @Test
    void listReturnsApiDtoWithoutSerializingTenantEntityGraph() throws Exception {
        SpaceRepository.SpaceSummary space = mock(SpaceRepository.SpaceSummary.class);
        when(space.getId()).thenReturn(11L);
        when(space.getName()).thenReturn("Soba 1");
        when(space.getDescription()).thenReturn("Prvo nadstropje");
        when(space.getLocationId()).thenReturn(7L);
        when(space.getLocationName()).thenReturn("Glavna lokacija");
        when(space.getLocationTimezone()).thenReturn("Europe/Ljubljana");
        when(space.getLocationActive()).thenReturn(true);
        when(repo.findSummariesByCompanyId(42L)).thenReturn(List.of(space));

        List<SpaceController.SpaceResponse> response = controller.list(me);

        assertEquals(1, response.size());
        assertEquals(11L, response.getFirst().id());
        assertEquals("Soba 1", response.getFirst().name());
        assertEquals(7L, response.getFirst().location().id());
        assertEquals("Glavna lokacija", response.getFirst().location().name());

        String json = new ObjectMapper().writeValueAsString(response);
        assertFalse(json.contains("company"));
        assertFalse(json.contains("workspace"));
    }

    @Test
    void createReturnsSavedSpaceDtoThatCanBeShownImmediately() {
        Location location = location(7L, "Glavna lokacija");
        when(locations.requireForCompany(7L, company)).thenReturn(location);
        when(repo.save(org.mockito.ArgumentMatchers.any(Space.class))).thenAnswer(invocation -> {
            Space saved = invocation.getArgument(0);
            saved.setId(12L);
            return saved;
        });

        SpaceController.SpaceResponse response = controller.create(
                new SpaceController.SpaceInput("  Soba 2  ", "  Miren prostor  ", 7L),
                me
        );

        assertEquals(12L, response.id());
        assertEquals("Soba 2", response.name());
        assertEquals("Miren prostor", response.description());
        assertEquals(7L, response.location().id());
        verify(repo).save(org.mockito.ArgumentMatchers.any(Space.class));
    }

    private static Location location(Long id, String name) {
        Location location = new Location();
        location.setId(id);
        location.setName(name);
        location.setTimezone("Europe/Ljubljana");
        location.setActive(true);
        return location;
    }
}
