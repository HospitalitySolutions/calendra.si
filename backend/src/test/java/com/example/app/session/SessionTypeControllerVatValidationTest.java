package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.company.Company;
import com.example.app.user.User;
import java.math.BigDecimal;
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
class SessionTypeControllerVatValidationTest {

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
    void create_blocksMixedVatRatesAcrossLinkedServices() {
        SessionType savedType = new SessionType();
        savedType.setId(99L);
        savedType.setCompany(company);
        savedType.setName("Combo service");
        savedType.setDescription("desc");
        savedType.setDurationMinutes(60);
        savedType.setBreakMinutes(0);
        savedType.setGuestBookingEnabled(true);
        savedType.setActive(true);
        when(repo.save(any(SessionType.class))).thenReturn(savedType);

        TransactionService txNineFive = tx(10L, TaxRate.VAT_9_5);
        TransactionService txTwentyTwo = tx(11L, TaxRate.VAT_22);
        when(txRepo.findByIdAndCompanyId(10L, 1L)).thenReturn(Optional.of(txNineFive));
        when(txRepo.findByIdAndCompanyId(11L, 1L)).thenReturn(Optional.of(txTwentyTwo));

        SessionTypeController.TypeRequest req = new SessionTypeController.TypeRequest(
                "Combo service",
                "desc",
                60,
                0,
                null,
                false,
                false,
                true,
                SessionPriceCalculationMode.PER_CLIENT,
                true,
                List.<String>of(),
                List.of(
                        new SessionTypeController.TypeServiceItem(10L, new BigDecimal("35.00")),
                        new SessionTypeController.TypeServiceItem(11L, new BigDecimal("45.00"))
                )
        );

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> controller.create(req, me));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void create_allowsSameVatRatesAcrossLinkedServices() {
        SessionType savedType = new SessionType();
        savedType.setId(100L);
        savedType.setCompany(company);
        savedType.setName("Valid bundle");
        savedType.setDescription("desc");
        savedType.setDurationMinutes(60);
        savedType.setBreakMinutes(0);
        savedType.setGuestBookingEnabled(true);
        savedType.setActive(true);
        when(repo.save(any(SessionType.class))).thenReturn(savedType);
        when(repo.findAllWithLinkedServicesByCompanyId(1L)).thenReturn(List.of(savedType));

        TransactionService txOne = tx(20L, TaxRate.VAT_22);
        TransactionService txTwo = tx(21L, TaxRate.VAT_22);
        when(txRepo.findByIdAndCompanyId(20L, 1L)).thenReturn(Optional.of(txOne));
        when(txRepo.findByIdAndCompanyId(21L, 1L)).thenReturn(Optional.of(txTwo));

        SessionTypeController.TypeRequest req = new SessionTypeController.TypeRequest(
                "Valid bundle",
                "desc",
                60,
                0,
                null,
                false,
                false,
                true,
                SessionPriceCalculationMode.PER_CLIENT,
                true,
                List.<String>of(),
                List.of(
                        new SessionTypeController.TypeServiceItem(20L, new BigDecimal("35.00")),
                        new SessionTypeController.TypeServiceItem(21L, new BigDecimal("45.00"))
                )
        );

        SessionTypeController.TypeResponse response = controller.create(req, me);
        assertEquals("Valid bundle", response.name());
    }

    private TransactionService tx(Long id, TaxRate rate) {
        TransactionService tx = new TransactionService();
        tx.setId(id);
        tx.setCompany(company);
        tx.setCode("S-" + id);
        tx.setDescription("Service " + id);
        tx.setTaxRate(rate);
        tx.setNetPrice(new BigDecimal("10.00"));
        tx.setActive(true);
        return tx;
    }
}
