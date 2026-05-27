package com.example.app.billing;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Assigns the public tenant/client/counter order id used on invoices and wallet order lists. */
@Service
public class InvoiceOrderIdService {
    private static final int MAX_CONFLICT_ATTEMPTS = 10_000;

    private final AppSettingRepository settings;
    private final BillRepository bills;
    private final GuestOrderRepository guestOrders;

    public InvoiceOrderIdService(AppSettingRepository settings, BillRepository bills, GuestOrderRepository guestOrders) {
        this.settings = settings;
        this.bills = bills;
        this.guestOrders = guestOrders;
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
        long storedBillMax = maxStoredBillCounter(company.getId());
        if (next <= storedBillMax) {
            next = storedBillMax + 1;
        }

        String firstCandidate = formatOrderId(company, clientId, recipientCompanyId, next);
        if (orderIdAlreadyUsed(company.getId(), firstCandidate)) {
            long publicIdMax = Math.max(storedBillMax, maxCounterFromStoredPublicIds(company));
            if (next <= publicIdMax) {
                next = publicIdMax + 1;
            } else {
                next++;
            }
        }

        for (int attempt = 0; attempt < MAX_CONFLICT_ATTEMPTS; attempt++) {
            String orderId = formatOrderId(company, clientId, recipientCompanyId, next);
            if (!orderIdAlreadyUsed(company.getId(), orderId)) {
                counter.setValue(String.valueOf(next + 1));
                settings.save(counter);
                return new OrderIdParts(next, orderId);
            }
            next++;
        }
        throw new IllegalStateException("Could not reserve a unique order id for tenant " + company.getId() + ".");
    }

    private boolean orderIdAlreadyUsed(Long companyId, String orderId) {
        if (!hasText(orderId)) {
            return true;
        }
        return bills.existsByCompanyIdAndOrderId(companyId, orderId) || guestOrders.existsByReferenceCode(orderId);
    }

    private long maxStoredBillCounter(Long companyId) {
        Long billCounterMax = bills.findMaxOrderCounterByCompanyId(companyId);
        return billCounterMax == null ? 0L : Math.max(0L, billCounterMax);
    }

    private long maxCounterFromStoredPublicIds(Company company) {
        String normalizedTenant = normalizedTenantCode(company);
        long max = 0L;
        max = Math.max(max, maxCounterFromPublicIds(bills.findAllOrderIdsByCompanyId(company.getId()), normalizedTenant));
        max = Math.max(max, maxCounterFromPublicIds(guestOrders.findAllReferenceCodesByCompanyId(company.getId()), normalizedTenant));
        return max;
    }

    private long maxCounterFromPublicIds(List<String> values, String normalizedTenant) {
        if (values == null || values.isEmpty() || !hasText(normalizedTenant)) {
            return 0L;
        }
        Pattern pattern = Pattern.compile("^" + Pattern.quote(normalizedTenant) + "-[^-]+-([0-9]+)$");
        long max = 0L;
        for (String value : values) {
            if (!hasText(value)) {
                continue;
            }
            Matcher matcher = pattern.matcher(value.trim().toUpperCase(Locale.ROOT));
            if (!matcher.matches()) {
                continue;
            }
            try {
                long parsed = Long.parseLong(matcher.group(1));
                if (parsed > max) {
                    max = parsed;
                }
            } catch (NumberFormatException ignored) {
                // Ignore malformed legacy values.
            }
        }
        return max;
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
        String clientToken;
        if (clientId != null) {
            clientToken = String.valueOf(clientId);
        } else if (recipientCompanyId != null) {
            clientToken = String.valueOf(recipientCompanyId);
        } else {
            clientToken = "0";
        }
        return normalizedTenantCode(company) + "-" + clientToken + "-" + counter;
    }

    private String normalizedTenantCode(Company company) {
        String tenantCode = company.getTenantCode();
        if (!hasText(tenantCode)) {
            tenantCode = String.valueOf(company.getId());
        }
        String normalizedTenant = tenantCode.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (!hasText(normalizedTenant)) {
            normalizedTenant = String.valueOf(company.getId());
        }
        return normalizedTenant;
    }

    private record OrderIdParts(long counter, String orderId) {}

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
