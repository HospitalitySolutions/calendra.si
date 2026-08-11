package com.example.app.consumables;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;

import com.example.app.billing.OpenBillSyncService;
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
class ConsumableControllerFeatureGateTest {

    @Mock private ConsumableService service;
    @Mock private GlobalConsumablesFeatureService feature;
    @Mock private OpenBillSyncService openBillSyncService;
    @Mock private ConsumableInventoryService inventoryService;

    private ConsumableController controller;
    private User me;

    @BeforeEach
    void setUp() {
        controller = new ConsumableController(service, feature, openBillSyncService, inventoryService);
        Company company = new Company();
        company.setId(11L);
        me = new User();
        me.setCompany(company);
    }

    @Test
    void itemWriteIsBlockedWhenConsumablesFeatureIsOff() {
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Consumables disabled"))
                .when(feature).assertEnabledForUser(me);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.createItem(null, me)
        );

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verifyNoInteractions(service);
    }

    @Test
    void supplierWriteIsBlockedWhenConsumablesFeatureIsOff() {
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Consumables disabled"))
                .when(feature).assertEnabledForUser(me);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.createSupplier(null, me)
        );

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verifyNoInteractions(service);
    }
    @Test
    void inventoryWriteIsBlockedWhenConsumablesFeatureIsOff() {
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Consumables disabled"))
                .when(feature).assertEnabledForUser(me);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> controller.startInventory(new ConsumableController.InventoryStartRequest(3L, null), me)
        );

        assertEquals(HttpStatus.FORBIDDEN, error.getStatusCode());
        verifyNoInteractions(inventoryService);
    }

}
