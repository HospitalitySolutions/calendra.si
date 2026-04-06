package com.example.app.fiscal;

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

    public FiscalSettings forCompany(Long companyId) {
        FiscalEnvironment env = FiscalEnvironment.fromRaw(get(companyId, SettingKey.FISCAL_ENVIRONMENT, "TEST"));
        String companyVatId = normalizeTaxNumber(get(companyId, SettingKey.COMPANY_VAT_ID, ""));
        String invoiceUrl = env == FiscalEnvironment.PROD
                ? get(companyId, SettingKey.FISCAL_PROD_INVOICE_URL, PROD_INVOICE_DEFAULT)
                : getGlobal(SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL, TEST_INVOICE_DEFAULT);
        String premiseUrl = env == FiscalEnvironment.PROD
                ? get(companyId, SettingKey.FISCAL_PROD_PREMISE_URL, PROD_PREMISE_DEFAULT)
                : getGlobal(SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL, TEST_PREMISE_DEFAULT);

        return new FiscalSettings(
                env,
                companyVatId,
                get(companyId, SettingKey.FISCAL_BUSINESS_PREMISE_ID, ""),
                get(companyId, SettingKey.FISCAL_DEVICE_ID, ""),
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
