package com.example.app.company;

import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import jakarta.transaction.Transactional;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CompanyProvisioningService {
    private final CompanyRepository companies;
    private final PaymentMethodRepository paymentMethods;
    private final TenantCodeService tenantCodeService;

    public CompanyProvisioningService(
            CompanyRepository companies,
            PaymentMethodRepository paymentMethods,
            TenantCodeService tenantCodeService
    ) {
        this.companies = companies;
        this.paymentMethods = paymentMethods;
        this.tenantCodeService = tenantCodeService;
    }

    @Transactional
    public Company createWithTenantCode(String companyName) {
        var company = new Company();
        company.setName(companyName);
        company = companies.saveAndFlush(company);
        company.setTenantCode(tenantCodeService.generate(company.getId(), companyName));
        return companies.save(company);
    }

    @Transactional
    public Company ensureTenantCode(Company company) {
        if (company == null) {
            return null;
        }
        if (company.getTenantCode() == null || company.getTenantCode().isBlank()) {
            company.setTenantCode(tenantCodeService.generate(company.getId(), company.getName()));
            return companies.save(company);
        }
        return company;
    }

    @Transactional
    public void ensureDefaultPaymentMethods(Company company) {
        if (company == null || company.getId() == null) return;
        List<PaymentMethod> all = paymentMethods.findAllByCompanyIdOrderByNameAsc(company.getId());
        ensureDefaultPaymentMethod(all, company, "Cash", PaymentType.CASH, true, false, false, 0);
        ensureDefaultPaymentMethod(all, company, "Stripe", PaymentType.CARD, true, true, true, 1);
        ensureDefaultPaymentMethod(all, company, "Bank Transfer", PaymentType.BANK_TRANSFER, false, false, true, 2);
        ensureDefaultPaymentMethod(all, company, "PayPal", PaymentType.OTHER, false, false, true, 3);
        ensureDefaultPaymentMethod(all, company, "Advance", PaymentType.ADVANCE, false, false, false, 4);
    }

    private void ensureDefaultPaymentMethod(
            List<PaymentMethod> existing,
            Company company,
            String name,
            PaymentType type,
            boolean fiscalized,
            boolean stripeEnabled,
            boolean guestEnabled,
            int guestDisplayOrder
    ) {
        PaymentMethod method = existing.stream()
                .filter(pm -> pm.getPaymentType() == type)
                .filter(pm -> pm.getName() != null && pm.getName().trim().equalsIgnoreCase(name))
                .findFirst()
                .orElse(null);

        if (method == null) {
            method = new PaymentMethod();
            method.setCompany(company);
            method.setName(name);
            method.setPaymentType(type);
            method.setFiscalized(fiscalized);
            method.setStripeEnabled(stripeEnabled);
            method.setGuestEnabled(guestEnabled);
            method.setGuestDisplayOrder(guestDisplayOrder);
            existing.add(paymentMethods.save(method));
            return;
        }

        boolean dirty = false;
        if (method.isFiscalized() != fiscalized) {
            method.setFiscalized(fiscalized);
            dirty = true;
        }
        if (method.isStripeEnabled() != stripeEnabled) {
            method.setStripeEnabled(stripeEnabled);
            dirty = true;
        }
        if (method.isGuestEnabled() != guestEnabled) {
            method.setGuestEnabled(guestEnabled);
            dirty = true;
        }
        if (method.getGuestDisplayOrder() != guestDisplayOrder) {
            method.setGuestDisplayOrder(guestDisplayOrder);
            dirty = true;
        }
        if (dirty) {
            paymentMethods.save(method);
        }
    }
}
