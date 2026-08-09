package com.example.app.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.location.LocationPublicPresentationService;
import com.example.app.settings.AppSettingRepository;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class BillingEmailLocationPresentationTest {

    @Test
    void invoiceDeliveryTokensUseBillLocationPublicIdentity() throws Exception {
        AppSettingRepository settings = mock(AppSettingRepository.class);
        BillingEmailService service = new BillingEmailService(
                null,
                settings,
                mock(ClientCompanyRepository.class),
                null,
                null,
                "",
                "",
                "",
                "https://app.calendra.test"
        );
        LocationPublicPresentationService presentations = mock(LocationPublicPresentationService.class);
        ReflectionTestUtils.setField(service, "locationPresentationService", presentations);

        Company company = new Company();
        company.setId(1L);
        company.setName("Legal Company d.o.o.");

        Location location = new Location();
        location.setId(12L);
        location.setCompany(company);
        location.setName("Internal Maribor");

        when(presentations.resolve(location)).thenReturn(new LocationPublicPresentationService.PublicPresentation(
                12L, 1L, "Calendra Maribor", "Glavni trg 1, 2000 Maribor", null,
                "+386 2 123 45 67", "maribor@example.test", "/location-logo.png", "location-logo",
                true, true, true, true, true, null
        ));

        Bill bill = new Bill();
        bill.setCompany(company);
        bill.setLocation(location);
        bill.setBillNumber("R-1");
        bill.setIssueDate(LocalDate.of(2026, 8, 9));
        bill.setTotalGross(new BigDecimal("50.00"));

        Method method = BillingEmailService.class.getDeclaredMethod("applyInvoiceTokens", String.class, Bill.class);
        method.setAccessible(true);
        String result = (String) method.invoke(service,
                "{{companyName}}|{{locationName}}|{{locationAddress}}|{{locationPhone}}|{{locationEmail}}", bill);

        assertThat(result).isEqualTo(
                "Calendra Maribor|Calendra Maribor|Glavni trg 1, 2000 Maribor|+386 2 123 45 67|maribor@example.test");
    }
}
