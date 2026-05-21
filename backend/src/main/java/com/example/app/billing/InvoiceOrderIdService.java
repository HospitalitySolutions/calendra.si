package com.example.app.billing;

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
        AppSetting counter = settings.findForUpdateByCompanyIdAndKey(company.getId(), SettingKey.ORDER_COUNTER)
                .orElseGet(() -> createCounterSetting(company));
        long next = parseCounter(counter.getValue());
        bill.setOrderCounter(next);
        bill.setOrderId(formatOrderId(company, bill, next));
        counter.setValue(String.valueOf(next + 1));
        settings.save(counter);
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

    private String formatOrderId(Company company, Bill bill, long counter) {
        String tenantCode = company.getTenantCode();
        if (!hasText(tenantCode)) {
            tenantCode = String.valueOf(company.getId());
        }
        String normalizedTenant = tenantCode.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (!hasText(normalizedTenant)) {
            normalizedTenant = String.valueOf(company.getId());
        }
        String clientToken;
        if (bill.getClient() != null && bill.getClient().getId() != null) {
            clientToken = String.valueOf(bill.getClient().getId());
        } else if (bill.getRecipientCompanyIdSnapshot() != null) {
            clientToken = String.valueOf(bill.getRecipientCompanyIdSnapshot());
        } else {
            clientToken = "0";
        }
        return normalizedTenant + "-" + clientToken + "-" + counter;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
