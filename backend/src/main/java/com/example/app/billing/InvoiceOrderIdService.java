package com.example.app.billing;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Assigns the public tenant/client/counter order id used on invoices and wallet order lists. */
@Service
public class InvoiceOrderIdService {
    private final AppSettingRepository settings;

    public InvoiceOrderIdService(AppSettingRepository settings) {
        this.settings = settings;
    }

    @Transactional
    public void assignIfMissing(Bill bill) {
        if (bill == null || hasText(bill.getOrderId())) {
            return;
        }
        Company company = bill.getCompany();
        if (company == null || company.getId() == null) {
            throw new IllegalStateException("Bill company is required before assigning orderId.");
        }
        Long clientId = bill.getClient() == null ? null : bill.getClient().getId();
        Long recipientCompanyId = bill.getRecipientCompanyIdSnapshot();
        OrderIdParts parts = nextOrderIdParts(company, clientId, recipientCompanyId);
        bill.setOrderCounter(parts.counter());
        bill.setOrderId(parts.orderId());
    }

    /**
     * Reserves the same public tenant/client/counter id used on invoices, without creating
     * a Bill/invoice row. Used for external checkout orders before payment succeeds.
     */
    @Transactional
    public String nextOrderId(Company company, Client client) {
        Long clientId = client == null ? null : client.getId();
        return nextOrderIdParts(company, clientId, null).orderId();
    }

    private OrderIdParts nextOrderIdParts(Company company, Long clientId, Long recipientCompanyId) {
        if (company == null || company.getId() == null) {
            throw new IllegalStateException("Company is required before assigning orderId.");
        }
        AppSetting counter = settings.findForUpdateByCompanyIdAndKey(company.getId(), SettingKey.ORDER_COUNTER)
                .orElseGet(() -> createCounterSetting(company));
        long next = parseCounter(counter.getValue());
        String orderId = formatOrderId(company, clientId, recipientCompanyId, next);
        counter.setValue(String.valueOf(next + 1));
        settings.save(counter);
        return new OrderIdParts(next, orderId);
    }

    private AppSetting createCounterSetting(Company company) {
        AppSetting setting = new AppSetting();
        setting.setCompany(company);
        setting.setKey(SettingKey.ORDER_COUNTER.name());
        setting.setValue("1");
        return settings.saveAndFlush(setting);
    }

    private long parseCounter(String value) {
        if (value == null || value.isBlank()) {
            return 1L;
        }
        try {
            long parsed = Long.parseLong(value.trim());
            return parsed > 0 ? parsed : 1L;
        } catch (NumberFormatException ignored) {
            return 1L;
        }
    }

    private String formatOrderId(Company company, Long clientId, Long recipientCompanyId, long counter) {
        String tenantCode = company.getTenantCode();
        if (!hasText(tenantCode)) {
            tenantCode = String.valueOf(company.getId());
        }
        String normalizedTenant = tenantCode.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (!hasText(normalizedTenant)) {
            normalizedTenant = String.valueOf(company.getId());
        }
        String clientToken;
        if (clientId != null) {
            clientToken = String.valueOf(clientId);
        } else if (recipientCompanyId != null) {
            clientToken = String.valueOf(recipientCompanyId);
        } else {
            clientToken = "0";
        }
        return normalizedTenant + "-" + clientToken + "-" + counter;
    }

    private record OrderIdParts(long counter, String orderId) {}

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
