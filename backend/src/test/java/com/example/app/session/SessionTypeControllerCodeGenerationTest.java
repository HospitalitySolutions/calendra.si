package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.example.app.billing.TransactionServiceRepository;
import com.example.app.company.Company;
import com.example.app.user.User;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SessionTypeControllerCodeGenerationTest {

    @Mock
    private SessionTypeRepository repo;
    @Mock
    private TransactionServiceRepository txRepo;
    @Mock
    private SessionBookingRepository bookingRepo;
    @Mock
    private ServiceGroupRepository groupRepo;

    private SessionTypeController controller;
    private User me;
    private Company company;

    @BeforeEach
    void setUp() {
        controller = new SessionTypeController(repo, txRepo, bookingRepo, groupRepo);
        company = new Company();
        company.setId(1L);
        me = new User();
        me.setCompany(company);
    }

    @Test
    void create_generatesInternalCodeFromDescriptionWhenCodeIsMissing() {
        AtomicReference<SessionType> saved = configureSave(101L);
        when(repo.findByCompanyIdAndNameIgnoreCase(1L, "MASAZA"))
                .thenReturn(Optional.empty());

        SessionTypeController.TypeResponse response = controller.create(
                request(null, "Masaža"),
                me
        );

        assertEquals("MASAZA", response.name());
        assertEquals("Masaža", response.description());
        assertEquals("MASAZA", saved.get().getName());
    }

    @Test
    void create_addsSuffixWhenGeneratedCodeAlreadyExists() {
        SessionType existing = new SessionType();
        existing.setId(50L);
        when(repo.findByCompanyIdAndNameIgnoreCase(1L, "MASAZA"))
                .thenReturn(Optional.of(existing));
        when(repo.findByCompanyIdAndNameIgnoreCase(1L, "MASAZA2"))
                .thenReturn(Optional.empty());
        configureSave(102L);

        SessionTypeController.TypeResponse response = controller.create(
                request(null, "Masaža"),
                me
        );

        assertEquals("MASAZA2", response.name());
    }

    @Test
    void update_keepsExistingInternalCodeWhenDescriptionChanges() {
        SessionType existing = baseType(103L, "MASAZA", "Masaža");
        when(repo.findById(103L)).thenReturn(Optional.of(existing));
        when(repo.saveAndFlush(any(SessionType.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(repo.findAllWithLinkedServicesByCompanyId(1L)).thenReturn(List.of(existing));

        SessionTypeController.TypeResponse response = controller.update(
                103L,
                request(null, "Športna masaža"),
                me
        );

        assertEquals("MASAZA", response.name());
        assertEquals("Športna masaža", response.description());
    }

    private AtomicReference<SessionType> configureSave(Long id) {
        AtomicReference<SessionType> saved = new AtomicReference<>();
        when(repo.save(any(SessionType.class))).thenAnswer(invocation -> {
            SessionType type = invocation.getArgument(0);
            type.setId(id);
            saved.set(type);
            return type;
        });
        when(repo.findAllWithLinkedServicesByCompanyId(1L))
                .thenAnswer(invocation -> List.of(saved.get()));
        return saved;
    }

    private SessionTypeController.TypeRequest request(String code, String description) {
        return new SessionTypeController.TypeRequest(
                code,
                description,
                45,
                0,
                null,
                false,
                false,
                true,
                SessionPriceCalculationMode.PER_CLIENT,
                true,
                List.of(),
                List.of()
        );
    }

    private SessionType baseType(Long id, String code, String description) {
        SessionType type = new SessionType();
        type.setId(id);
        type.setCompany(company);
        type.setName(code);
        type.setDescription(description);
        type.setColor("#D7DFF0");
        type.setDurationMinutes(45);
        type.setBreakMinutes(0);
        type.setGuestBookingEnabled(true);
        type.setActive(true);
        return type;
    }
}
