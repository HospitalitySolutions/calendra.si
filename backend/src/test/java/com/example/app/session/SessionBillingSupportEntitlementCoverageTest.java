package com.example.app.session;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import com.example.app.company.Company;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Set;
import org.junit.jupiter.api.Test;

class SessionBillingSupportEntitlementCoverageTest {

    @Test
    void coveredLegacyServicePositionIsOmittedFromBillingProjection() {
        Company company = new Company();
        company.setId(1L);

        TransactionService transaction = new TransactionService();
        transaction.setId(11L);
        transaction.setCompany(company);
        transaction.setCode("PILATES");
        transaction.setDescription("Pilates");
        transaction.setTaxRate(TaxRate.VAT_22);
        transaction.setNetPrice(new BigDecimal("20.0000"));

        SessionType type = new SessionType();
        type.setId(12L);
        type.setCompany(company);
        type.setName("Pilates");
        TypeTransactionService link = new TypeTransactionService();
        link.setSessionType(type);
        link.setTransactionService(transaction);
        link.setPrice(new BigDecimal("20.0000"));
        type.getLinkedServices().add(link);

        SessionBooking booking = new SessionBooking();
        booking.setId(13L);
        booking.setCompany(company);
        booking.setType(type);
        booking.setStartTime(LocalDateTime.of(2026, 8, 12, 10, 0));
        booking.setEndTime(LocalDateTime.of(2026, 8, 12, 11, 0));

        assertThat(SessionBillingSupport.charges(booking, Set.of(), Set.of())).hasSize(1);
        assertThat(SessionBillingSupport.charges(booking, Set.of(), Set.of(0))).isEmpty();
    }
}
