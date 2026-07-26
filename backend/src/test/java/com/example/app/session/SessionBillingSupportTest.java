package com.example.app.session;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class SessionBillingSupportTest {
    @Test
    void charges_aggregatesSameBillingLineAcrossSelectedServices() {
        TransactionService billingService = new TransactionService();
        billingService.setId(50L);
        billingService.setNetPrice(new BigDecimal("20.0000"));
        billingService.setTaxRate(TaxRate.VAT_22);

        SessionType first = type(11L, billingService, new BigDecimal("25.0000"));
        SessionType second = type(12L, billingService, new BigDecimal("25.0000"));
        SessionBooking booking = booking(first, second);

        List<SessionBillingSupport.Charge> charges = SessionBillingSupport.charges(booking, Set.of());

        assertEquals(1, charges.size());
        assertEquals(2, charges.get(0).quantity());
        assertEquals(new BigDecimal("25.0000"), charges.get(0).netPrice());
        assertEquals(new BigDecimal("61.00"), SessionBillingSupport.grossTotal(booking));
    }

    @Test
    void charges_keepsDifferentPricesAsSeparateInvoiceLines() {
        TransactionService billingService = new TransactionService();
        billingService.setId(50L);
        billingService.setNetPrice(new BigDecimal("20.0000"));
        billingService.setTaxRate(TaxRate.VAT_22);

        SessionBooking booking = booking(
                type(11L, billingService, new BigDecimal("20.0000")),
                type(12L, billingService, new BigDecimal("30.0000"))
        );

        List<SessionBillingSupport.Charge> charges = SessionBillingSupport.charges(booking, Set.of());

        assertEquals(2, charges.size());
        assertEquals(new BigDecimal("61.00"), SessionBillingSupport.grossTotal(booking));
    }

    private SessionType type(Long id, TransactionService transactionService, BigDecimal price) {
        SessionType type = new SessionType();
        type.setId(id);
        type.setName("Type " + id);
        type.setPriceCalculationMode(SessionPriceCalculationMode.PER_CLIENT);
        TypeTransactionService link = new TypeTransactionService();
        link.setSessionType(type);
        link.setTransactionService(transactionService);
        link.setPrice(price);
        type.getLinkedServices().add(link);
        return type;
    }

    private SessionBooking booking(SessionType first, SessionType second) {
        SessionBooking booking = new SessionBooking();
        booking.setStartTime(LocalDateTime.of(2026, 8, 3, 10, 0));
        booking.setEndTime(LocalDateTime.of(2026, 8, 3, 11, 0));
        booking.setAvailabilityEndTime(booking.getEndTime());
        booking.setType(first);
        booking.getServices().add(segment(booking, first, 0, 10, 0));
        booking.getServices().add(segment(booking, second, 1, 10, 30));
        return booking;
    }

    private SessionService segment(
            SessionBooking booking,
            SessionType type,
            int position,
            int hour,
            int minute
    ) {
        SessionService service = new SessionService();
        service.setSessionBooking(booking);
        service.setSessionType(type);
        service.setPosition(position);
        service.setStartTime(LocalDateTime.of(2026, 8, 3, hour, minute));
        service.setEndTime(service.getStartTime().plusMinutes(30));
        service.setDurationMinutesSnapshot(30);
        service.setBreakMinutesSnapshot(0);
        service.setServiceNameSnapshot(type.getName());
        service.setPriceCalculationModeSnapshot(SessionPriceCalculationMode.PER_CLIENT.name());
        return service;
    }
}
