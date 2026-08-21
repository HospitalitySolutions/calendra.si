package com.example.app.company;

import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.location.LocationService;
import com.example.app.workspace.Workspace;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.transaction.Transactional;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CompanyProvisioningService {
    private final CompanyRepository companies;
    private final PaymentMethodRepository paymentMethods;
    private final TenantCodeService tenantCodeService;
    private final AppSettingRepository settings;
    private final LocationService locationService;

    @Autowired
    public CompanyProvisioningService(
            CompanyRepository companies,
            PaymentMethodRepository paymentMethods,
            TenantCodeService tenantCodeService,
            AppSettingRepository settings,
            LocationService locationService
    ) {
        this.companies = companies;
        this.paymentMethods = paymentMethods;
        this.tenantCodeService = tenantCodeService;
        this.settings = settings;
        this.locationService = locationService;
    }

    /** Backwards-compatible constructor for older unit tests. Runtime wiring uses the @Autowired constructor above. */
    public CompanyProvisioningService(
            CompanyRepository companies,
            PaymentMethodRepository paymentMethods,
            TenantCodeService tenantCodeService
    ) {
        this(companies, paymentMethods, tenantCodeService, null, null);
    }

    /** Backwards-compatible constructor for tests that provide settings but not location provisioning. */
    public CompanyProvisioningService(
            CompanyRepository companies,
            PaymentMethodRepository paymentMethods,
            TenantCodeService tenantCodeService,
            AppSettingRepository settings
    ) {
        this(companies, paymentMethods, tenantCodeService, settings, null);
    }

    @Transactional
    public Company createWithTenantCode(String companyName) {
        var company = new Company();
        company.setName(companyName);
        company = companies.saveAndFlush(company);
        company.setTenantCode(tenantCodeService.generate(company.getId(), companyName));
        Company saved = companies.save(company);
        ensureDefaultLocation(saved);
        return saved;
    }

    @Transactional
    public Company createInWorkspace(String companyName, Workspace workspace) {
        if (workspace == null || workspace.getId() == null) {
            throw new IllegalArgumentException("Workspace is required.");
        }
        var company = new Company();
        company.setName(companyName);
        company.setWorkspace(workspace);
        company = companies.saveAndFlush(company);
        company.setTenantCode(tenantCodeService.generate(company.getId(), companyName));
        Company saved = companies.save(company);
        ensureDefaultLocation(saved);
        ensureDefaultPaymentMethods(saved);
        return saved;
    }


    /**
     * Fill the provisioned tenant's default location with the contact/address data
     * captured during signup or manual tenant creation.
     */
    @Transactional
    public void initializeDefaultLocation(
            Company company,
            String name,
            String address,
            String postalCode,
            String city,
            String country,
            String phone,
            String email
    ) {
        if (locationService == null || company == null || company.getId() == null) return;
        locationService.initializeDefaultLocation(company, new LocationService.InitialLocationDetails(
                name, address, postalCode, city, country, phone, email
        ));
    }

    private void ensureDefaultLocation(Company company) {
        if (locationService != null && company != null && company.getId() != null) {
            locationService.requireDefault(company);
        }
    }

    @Transactional
    public Company ensureTenantCode(Company company) {
        if (company == null) {
            return null;
        }
        Company result = company;
        if (company.getTenantCode() == null || company.getTenantCode().isBlank()) {
            company.setTenantCode(tenantCodeService.generate(company.getId(), company.getName()));
            result = companies.save(company);
        }
        ensureDefaultLocation(result);
        return result;
    }

    @Transactional
    public void ensureDefaultPaymentMethods(Company company) {
        if (company == null || company.getId() == null) return;
        List<PaymentMethod> all = paymentMethods.findAllByCompanyIdOrderByNameAsc(company.getId());
        boolean fiscalCashRegisterEnabled = isFiscalCashRegisterEnabled(company.getId());
        ensureDefaultPaymentMethod(all, company, "Cash", PaymentType.CASH, fiscalCashRegisterEnabled, false, false, 0);
        ensureDefaultPaymentMethod(all, company, "Spletno plačilo s kartico", PaymentType.CARD, fiscalCashRegisterEnabled, true, true, 1);
        ensureDefaultPaymentMethod(all, company, "Bank Transfer", PaymentType.BANK_TRANSFER, false, false, true, 2);
        ensureDefaultPaymentMethod(all, company, "Advance", PaymentType.ADVANCE, false, false, false, 4);
    }

    private boolean isFiscalCashRegisterEnabled(Long companyId) {
        if (settings == null || companyId == null) return false;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.BILLING_FISCAL_CASH_REGISTER_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> "true".equalsIgnoreCase(value == null ? "" : value.trim()))
                .orElse(false);
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
                .filter(pm -> pm.getName() != null && (
                        pm.getName().trim().equalsIgnoreCase(name)
                                || (type == PaymentType.CARD && pm.isStripeEnabled())
                ))
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
        if (!method.getName().equals(name)) {
            method.setName(name);
            dirty = true;
        }
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
