package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.user.User;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class SessionTypeControllerInactivationTest {

    @Mock
    private SessionTypeRepository repo;
    @Mock
    private TransactionServiceRepository txRepo;
    @Mock
    private SessionBookingRepository bookingRepo;

    private SessionTypeController controller;
    private User me;
    private SessionType type;

    @BeforeEach
    void setUp() {
        controller = new SessionTypeController(repo, txRepo, bookingRepo);

        Company company = new Company();
        company.setId(1L);

        me = new User();
        me.setCompany(company);

        type = new SessionType();
        type.setId(10L);
        type.setCompany(company);
        type.setName("Yoga");
        type.setDescription("Desc");
        type.setDurationMinutes(60);
        type.setBreakMinutes(0);
        type.setActive(true);
    }

    @Test
    void update_blocksInactivationWhenUpcomingBookingsExist() {
        when(repo.findById(10L)).thenReturn(Optional.of(type));
        when(bookingRepo.existsUpcomingOrOngoingForType(eq(1L), eq(10L), any())).thenReturn(true);

        var req = new SessionTypeController.TypeRequest(
                "Yoga",
                "Desc",
                60,
                0,
                null,
                false,
                false,
                true,
                SessionPriceCalculationMode.PER_CLIENT,
                false,
                List.<String>of(),
                List.<SessionTypeController.TypeServiceItem>of()
        );

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.update(10L, req, me));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    void update_allowsInactivationWhenNoUpcomingBookingsExist() {
        when(repo.findById(10L)).thenReturn(Optional.of(type));
        when(bookingRepo.existsUpcomingOrOngoingForType(eq(1L), eq(10L), any())).thenReturn(false);
        when(repo.saveAndFlush(any(SessionType.class))).thenAnswer(inv -> inv.getArgument(0));
        when(repo.save(any(SessionType.class))).thenAnswer(inv -> inv.getArgument(0));
        when(repo.findAllWithLinkedServicesByCompanyId(1L)).thenReturn(List.of(type));

        var req = new SessionTypeController.TypeRequest(
                "Yoga",
                "Desc",
                60,
                0,
                null,
                false,
                false,
                true,
                SessionPriceCalculationMode.PER_CLIENT,
                false,
                List.<String>of(),
                List.<SessionTypeController.TypeServiceItem>of()
        );

        var updated = controller.update(10L, req, me);

        assertFalse(updated.active());
    }
}
