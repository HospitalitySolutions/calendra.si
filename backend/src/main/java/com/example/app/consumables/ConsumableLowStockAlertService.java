package com.example.app.consumables;

import com.example.app.notification.TenantNotification;
import com.example.app.notification.TenantNotificationRepository;
import com.example.app.settings.GlobalConsumablesFeatureService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps at most one active notification per recipient + consumable/location stock row.
 *
 * While an article remains below its minimum, further consumption updates the
 * message but does not make an acknowledged alert unread again. Replenishment
 * resolves that alert and frees the deterministic condition key. A later drop
 * below the threshold creates one fresh unread notification for the new cycle.
 */
@Service
public class ConsumableLowStockAlertService {
    private final TenantNotificationRepository notifications;
    private final UserRepository users;
    private final GlobalConsumablesFeatureService featureService;

    public ConsumableLowStockAlertService(
            TenantNotificationRepository notifications,
            UserRepository users,
            GlobalConsumablesFeatureService featureService
    ) {
        this.notifications = notifications;
        this.users = users;
        this.featureService = featureService;
    }

    @Transactional
    public void sync(ConsumableLocationStock stock) {
        if (stock == null || stock.getId() == null || stock.getCompany() == null || stock.getCompany().getId() == null) return;
        Consumable item = stock.getConsumable();
        if (item == null) return;
        Long companyId = stock.getCompany().getId();
        Instant now = Instant.now();
        boolean low = featureService.isEnabledForCompany(companyId)
                && item.isActive()
                && item.isTrackStock()
                && nz(stock.getCurrentStock()).compareTo(nz(stock.getMinimumStock())) < 0;

        for (User recipient : users.findAllByCompanyId(companyId)) {
            if (!recipient.isActive() || recipient.getId() == null) continue;
            if (recipient.getRole() != Role.ADMIN && recipient.getRole() != Role.SUPER_ADMIN) continue;
            String dedupeKey = "CONSUMABLE_LOW_STOCK:" + stock.getId();
            TenantNotification existing = notifications.findByRecipientIdAndDedupeKey(recipient.getId(), dedupeKey).orElse(null);
            if (!low) {
                resolve(existing, now);
                continue;
            }
            if (existing == null) {
                existing = new TenantNotification();
                existing.setCompany(stock.getCompany());
                existing.setRecipient(recipient);
                existing.setCategory("CONSUMABLES");
                existing.setType("LOW_STOCK");
                existing.setSeverity("WARNING");
                existing.setSource("CONSUMABLES");
                existing.setEntityType("CONSUMABLE_LOCATION_STOCK");
                existing.setEntityId(stock.getId());
                existing.setDedupeKey(dedupeKey);
                existing.setMetadataJson("{}");
            }
            // Do not reset readAt while the same low-stock condition remains active.
            // An acknowledged alert therefore stays acknowledged even if more stock is consumed.
            existing.setTitle("Nizka zaloga");
            existing.setMessage(message(stock));
            existing.setActionUrl(actionUrl(stock));
            existing.setExpiresAt(null);
            notifications.save(existing);
        }
    }

    private void resolve(TenantNotification row, Instant now) {
        if (row == null) return;
        if (row.getExpiresAt() != null && !row.getExpiresAt().isAfter(now)) return;
        if (row.getReadAt() == null) row.setReadAt(now);
        row.setExpiresAt(now);
        // Free the deterministic active-condition key. A later drop below minimum
        // creates a genuinely new notification with a fresh createdAt timestamp.
        if (row.getId() != null && row.getDedupeKey() != null && !row.getDedupeKey().contains(":RESOLVED:")) {
            row.setDedupeKey(row.getDedupeKey() + ":RESOLVED:" + row.getId());
        }
        notifications.save(row);
    }

    private String message(ConsumableLocationStock stock) {
        Consumable item = stock.getConsumable();
        String unit = item.getUnit() == null || item.getUnit().isBlank() ? "kos" : item.getUnit().trim();
        String location = stock.getLocation() == null || stock.getLocation().getName() == null
                ? "poslovalnici" : stock.getLocation().getName();
        return item.getName() + " ima v poslovalnici " + location + " le "
                + number(stock.getCurrentStock()) + " " + unit + " (minimum "
                + number(stock.getMinimumStock()) + " " + unit + ").";
    }

    private String actionUrl(ConsumableLocationStock stock) {
        Long locationId = stock.getLocation() == null ? null : stock.getLocation().getId();
        Long itemId = stock.getConsumable() == null ? null : stock.getConsumable().getId();
        return "/consumables?tab=procurement"
                + (locationId == null ? "" : "&locationId=" + locationId)
                + (itemId == null ? "" : "&lowStockItemId=" + itemId);
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static String number(BigDecimal value) {
        BigDecimal scaled = nz(value).setScale(4, RoundingMode.HALF_UP).stripTrailingZeros();
        return scaled.scale() < 0 ? scaled.setScale(0).toPlainString() : scaled.toPlainString();
    }
}
