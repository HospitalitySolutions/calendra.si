package com.example.app.fiscal;

import com.example.app.billing.Bill;
import com.example.app.billingissuer.InvoiceSeries;
import com.example.app.billingissuer.LegalEntity;
import com.example.app.location.Location;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingsCryptoService;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class FiscalSettingsService {
    private static final String TEST_INVOICE_DEFAULT = "https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices";
    private static final String TEST_PREMISE_DEFAULT = "https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices/register";
    private static final String PROD_INVOICE_DEFAULT = "https://blagajne.fu.gov.si:9003/v1/cash_registers/invoices";
    private static final String PROD_PREMISE_DEFAULT = "https://blagajne.fu.gov.si:9003/v1/cash_registers/invoices/register";

    private final AppSettingRepository settings;
    private final SettingsCryptoService crypto;
    private final UserRepository users;

    public FiscalSettingsService(AppSettingRepository settings, SettingsCryptoService crypto, UserRepository users) {
        this.settings = settings;
        this.crypto = crypto;
        this.users = users;
    }


    public FiscalSettings forBill(Bill bill, Long companyId) {
        if (bill == null || bill.getLegalEntity() == null) {
            return forCompany(companyId);
        }
        return forLegalEntity(bill.getLegalEntity(), bill.getLocation(), bill.getInvoiceSeries(), companyId,
                bill.getFiscalBusinessPremiseSnapshot(), bill.getFiscalDeviceIdSnapshot());
    }

    public FiscalSettings forLegalEntity(
            LegalEntity issuer,
            Location location,
            InvoiceSeries series,
            Long companyId
    ) {
        return forLegalEntity(issuer, location, series, companyId, null, null);
    }

    private FiscalSettings forLegalEntity(
            LegalEntity issuer,
            Location location,
            InvoiceSeries series,
            Long companyId,
            String premiseSnapshot,
            String deviceSnapshot
    ) {
        if (issuer == null) return forCompany(companyId);
        FiscalEnvironment env = FiscalEnvironment.fromRaw(issuer.getFiscalEnvironment());
        String invoiceUrl = env == FiscalEnvironment.PROD
                ? getGlobal(SettingKey.GLOBAL_FISCAL_PROD_INVOICE_URL, PROD_INVOICE_DEFAULT)
                : getGlobal(SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL, TEST_INVOICE_DEFAULT);
        String premiseUrl = env == FiscalEnvironment.PROD
                ? getGlobal(SettingKey.GLOBAL_FISCAL_PROD_PREMISE_URL, PROD_PREMISE_DEFAULT)
                : getGlobal(SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL, TEST_PREMISE_DEFAULT);
        String address = location != null && location.getAddress() != null ? location.getAddress() : issuer.getAddress();
        String postalCode = location != null && location.getPostalCode() != null ? location.getPostalCode() : issuer.getPostalCode();
        String city = location != null && location.getCity() != null ? location.getCity() : issuer.getCity();
        return new FiscalSettings(
                env,
                normalizeTaxNumber(firstNonBlank(issuer.getTaxNumber(), issuer.getVatId())),
                firstNonBlank(premiseSnapshot,
                        location == null ? null : location.getFiscalBusinessPremiseCode(),
                        series == null ? null : series.getBusinessPremiseCode(),
                        "1"),
                firstNonBlank(deviceSnapshot, series == null ? null : series.getElectronicDeviceId(), "1"),
                firstNonBlank(issuer.getSoftwareSupplierTaxNumber()),
                certificatePasswordFor(issuer),
                get(companyId, SettingKey.FISCAL_CADASTRAL_NUMBER, ""),
                get(companyId, SettingKey.FISCAL_BUILDING_NUMBER, ""),
                get(companyId, SettingKey.FISCAL_BUILDING_SECTION_NUMBER, ""),
                get(companyId, SettingKey.FISCAL_HOUSE_NUMBER, ""),
                get(companyId, SettingKey.FISCAL_HOUSE_NUMBER_ADDITIONAL, ""),
                firstNonBlank(address),
                firstNonBlank(postalCode),
                firstNonBlank(city),
                invoiceUrl,
                premiseUrl
        );
    }

    public String certificatePasswordFor(LegalEntity issuer) {
        return issuer == null ? "" : crypto.decryptIfEncrypted(firstNonBlank(issuer.getCertificatePasswordEncrypted()));
    }

    public FiscalSettings forCompany(Long companyId) {
        FiscalEnvironment env = FiscalEnvironment.fromRaw(get(companyId, SettingKey.FISCAL_ENVIRONMENT, "TEST"));
        String fiscalTaxNumber = normalizeTaxNumber(get(companyId, SettingKey.FISCAL_TAX_NUMBER, ""));
        String invoiceUrl = env == FiscalEnvironment.PROD
                ? getGlobal(SettingKey.GLOBAL_FISCAL_PROD_INVOICE_URL, PROD_INVOICE_DEFAULT)
                : getGlobal(SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL, TEST_INVOICE_DEFAULT);
        String premiseUrl = env == FiscalEnvironment.PROD
                ? getGlobal(SettingKey.GLOBAL_FISCAL_PROD_PREMISE_URL, PROD_PREMISE_DEFAULT)
                : getGlobal(SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL, TEST_PREMISE_DEFAULT);

        return new FiscalSettings(
                env,
                fiscalTaxNumber,
                get(companyId, SettingKey.FISCAL_BUSINESS_PREMISE_ID, ""),
                get(companyId, SettingKey.FISCAL_DEVICE_ID, "1"),
                get(companyId, SettingKey.FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER, ""),
                crypto.decryptIfEncrypted(get(companyId, SettingKey.FISCAL_CERTIFICATE_PASSWORD, "")),
                get(companyId, SettingKey.FISCAL_CADASTRAL_NUMBER, ""),
                get(companyId, SettingKey.FISCAL_BUILDING_NUMBER, ""),
                get(companyId, SettingKey.FISCAL_BUILDING_SECTION_NUMBER, ""),
                get(companyId, SettingKey.FISCAL_HOUSE_NUMBER, ""),
                get(companyId, SettingKey.FISCAL_HOUSE_NUMBER_ADDITIONAL, ""),
                get(companyId, SettingKey.COMPANY_ADDRESS, ""),
                get(companyId, SettingKey.COMPANY_POSTAL_CODE, ""),
                get(companyId, SettingKey.COMPANY_CITY, ""),
                invoiceUrl,
                premiseUrl
        );
    }

    private String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) return value.trim();
        }
        return "";
    }

    private String normalizeTaxNumber(String rawVatId) {
        if (rawVatId == null) return "";
        String value = rawVatId.trim().toUpperCase();
        if (value.startsWith("SI")) {
            value = value.substring(2).trim();
        }
        return value;
    }

    private String get(Long companyId, SettingKey key, String fallback) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(s -> s.getValue() == null ? "" : s.getValue().trim())
                .filter(v -> !v.isBlank())
                .orElse(fallback);
    }

    private String getGlobal(SettingKey key, String fallback) {
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .findFirst()
                .flatMap(u -> settings.findByCompanyIdAndKey(u.getCompany().getId(), key))
                .map(s -> s.getValue() == null ? "" : s.getValue().trim())
                .filter(v -> !v.isBlank())
                .orElse(fallback);
    }
}
