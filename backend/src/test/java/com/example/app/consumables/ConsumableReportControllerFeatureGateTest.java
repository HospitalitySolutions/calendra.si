package com.example.app.consumables;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;

import com.example.app.company.Company;
import com.example.app.settings.GlobalConsumablesFeatureService;
import com.example.app.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class ConsumableReportControllerFeatureGateTest {
    @Mock private ConsumableReportService reports;
    @Mock private GlobalConsumablesFeatureService feature;

    private ConsumableReportController controller;
    private User me;

    @BeforeEach
    void setUp() {
        controller = new ConsumableReportController(reports, feature);
        Company company = new Company();
        company.setId(7L);
        me = new User();
        me.setCompany(company);
    }

    @Test
    void reportsAreBlockedWhenConsumablesFeatureIsOff() {
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Consumables disabled"))
                .when(feature).assertEnabledForUser(me);

        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> controller.report(
                me,
                ConsumableReportService.ReportType.STOCK_VALUATION,
                null, null, null, null, null
        ));

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verifyNoInteractions(reports);
    }
}
