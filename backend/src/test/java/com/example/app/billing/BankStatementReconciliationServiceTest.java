package com.example.app.billing;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
class BankStatementReconciliationServiceTest {

    @Mock
    private BillRepository billRepo;

    @Mock
    private ApplicationEventPublisher events;

    /** OTP corporate export: credit must come from DOBRO column, not IBAN digit noise. */
    @Test
    void otpCsvUsesDobroColumnAmount() throws Exception {
        String header = "ŠT. IZPISKA;POGODBA;RAÈUN;DATUM KNJIŽENJA;DATUM VALUTE;DOBRO;BREME;VALUTA;NAMEN;SKLIC V DOBRO\n";
        String payment =
                "0;SI56040000280821828;SI56040000280821828;05.04.2026;05.04.2026;1,00;;EUR;PLACILO FOLIA 68;RF1168\n";
        byte[] csv = (header + payment).getBytes(StandardCharsets.UTF_8);

        Bill bill = new Bill();
        bill.setId(100L);
        bill.setBillNumber("68");
        bill.setTotalGross(new BigDecimal("1.00"));
        bill.setPaymentStatus(BillPaymentStatus.OPEN);
        PaymentMethod pm = new PaymentMethod();
        pm.setPaymentType(PaymentType.BANK_TRANSFER);
        bill.setPaymentMethod(pm);

        when(billRepo.findAllByCompanyId(1L)).thenReturn(List.of(bill));
        when(billRepo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));

        var service = new BankStatementReconciliationService(billRepo, events);
        var file = new MockMultipartFile("file", "promet.csv", "text/csv", csv);
        BankStatementReconciliationService.ReconciliationResult result = service.importStatement(1L, file);

        assertEquals(1, result.matchedCount());
        assertEquals(BillPaymentStatus.PAID, bill.getPaymentStatus());
        assertNotNull(bill.getPaidAt());
        verify(billRepo).saveAll(any());
    }
}
