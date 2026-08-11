package com.example.app.consumables;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.notification.TenantNotification;
import com.example.app.notification.TenantNotificationRepository;
import com.example.app.settings.GlobalConsumablesFeatureService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ConsumableLowStockAlertServiceTest {
    @Mock private TenantNotificationRepository notifications;
    @Mock private UserRepository users;
    @Mock private GlobalConsumablesFeatureService featureService;

    private ConsumableLowStockAlertService service;
    private ConsumableLocationStock stock;
    private User admin;

    @BeforeEach
    void setUp() {
        service = new ConsumableLowStockAlertService(notifications, users, featureService);
        Company company = new Company(); company.setId(1L);
        Location location = new Location(); location.setId(2L); location.setName("Maribor"); location.setCompany(company);
        Consumable item = new Consumable(); item.setId(3L); item.setCompany(company); item.setName("Rokavice"); item.setUnit("kos"); item.setActive(true); item.setTrackStock(true);
        stock = new ConsumableLocationStock(); stock.setId(4L); stock.setCompany(company); stock.setLocation(location); stock.setConsumable(item); stock.setMinimumStock(new BigDecimal("10")); stock.setCurrentStock(new BigDecimal("5"));
        admin = new User(); admin.setId(10L); admin.setCompany(company); admin.setRole(Role.ADMIN); admin.setActive(true);
        when(users.findAllByCompanyId(1L)).thenReturn(List.of(admin));
        when(featureService.isEnabledForCompany(1L)).thenReturn(true);
    }

    @Test
    void createsOneActionableAlertWhenStockIsLow() {
        when(notifications.findByRecipientIdAndDedupeKey(10L, "CONSUMABLE_LOW_STOCK:4")).thenReturn(Optional.empty());
        when(notifications.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.sync(stock);

        var captor = org.mockito.ArgumentCaptor.forClass(TenantNotification.class);
        verify(notifications).save(captor.capture());
        TenantNotification row = captor.getValue();
        assertEquals("CONSUMABLES", row.getCategory());
        assertEquals("LOW_STOCK", row.getType());
        assertEquals("WARNING", row.getSeverity());
        assertEquals("/consumables?tab=procurement&locationId=2&lowStockItemId=3", row.getActionUrl());
        org.junit.jupiter.api.Assertions.assertNull(row.getExpiresAt());
    }

    @Test
    void acknowledgedAlertDoesNotBecomeUnreadAgainWhileSameLowStockConditionContinues() {
        TenantNotification existing = existing();
        existing.setReadAt(Instant.now().minusSeconds(60));
        existing.setExpiresAt(Instant.now().plusSeconds(3600));
        when(notifications.findByRecipientIdAndDedupeKey(10L, "CONSUMABLE_LOW_STOCK:4")).thenReturn(Optional.of(existing));

        service.sync(stock);

        assertNotNull(existing.getReadAt());
        verify(notifications, times(1)).save(existing);
    }

    @Test
    void replenishmentResolvesAlertAndLaterDropReactivatesSameRow() {
        TenantNotification existing = existing();
        existing.setExpiresAt(Instant.now().plusSeconds(3600));
        when(notifications.findByRecipientIdAndDedupeKey(10L, "CONSUMABLE_LOW_STOCK:4")).thenReturn(Optional.of(existing));

        existing.setId(77L);
        stock.setCurrentStock(new BigDecimal("12"));
        service.sync(stock);
        assertNotNull(existing.getReadAt());
        assertNotNull(existing.getExpiresAt());
        assertEquals("CONSUMABLE_LOW_STOCK:4:RESOLVED:77", existing.getDedupeKey());

        // The resolved row no longer occupies the active-condition key. A later
        // low-stock cycle therefore creates a fresh unread notification row.
        when(notifications.findByRecipientIdAndDedupeKey(10L, "CONSUMABLE_LOW_STOCK:4")).thenReturn(Optional.empty());
        stock.setCurrentStock(new BigDecimal("4"));
        service.sync(stock);
        verify(notifications, times(2)).save(any(TenantNotification.class));
    }

    private TenantNotification existing() {
        TenantNotification row = new TenantNotification();
        row.setCompany(stock.getCompany()); row.setRecipient(admin); row.setCategory("CONSUMABLES"); row.setType("LOW_STOCK");
        row.setSeverity("WARNING"); row.setTitle("Nizka zaloga"); row.setMessage("old"); row.setDedupeKey("CONSUMABLE_LOW_STOCK:4");
        return row;
    }
}
