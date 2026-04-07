package com.example.app.company;

import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantCodeService {
    private static final Pattern NON_ALNUM = Pattern.compile("[^A-Za-z0-9]");

    private final CompanyRepository companies;

    public TenantCodeService(CompanyRepository companies) {
        this.companies = companies;
    }

    public String buildTenantCode(long numericId, String companyName) {
        String raw = companyName == null ? "" : NON_ALNUM.matcher(companyName.trim()).replaceAll("");
        String suffix = raw.isBlank() ? "TEN" : raw.substring(0, Math.min(3, raw.length())).toUpperCase(Locale.ROOT);
        return numericId + suffix;
    }

    @Transactional
    public Company assignIfMissing(Long companyId) {
        Company company = companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new IllegalArgumentException("Company not found: " + companyId));
        if (needsFinalTenantCode(company)) {
            company.setTenantCode(buildTenantCode(company.getId(), company.getName()));
            company = companies.save(company);
        }
        return company;
    }

    private static boolean needsFinalTenantCode(Company company) {
        String tc = company.getTenantCode();
        if (tc == null || tc.isBlank()) {
            return true;
        }
        return tc.startsWith(Company.TENANT_CODE_PROVISIONAL_PREFIX);
    }

    public String tenantCodeOrFallback(Company company) {
        if (company == null) {
            return "";
        }
        if (company.getTenantCode() != null && !company.getTenantCode().isBlank()) {
            return company.getTenantCode();
        }
        Long id = company.getId();
        return id == null ? "" : buildTenantCode(id, company.getName());
    }

    public Optional<String> tenantCodeForCompanyId(Long companyId) {
        if (companyId == null) {
            return Optional.empty();
        }
        return companies.findById(companyId).map(this::tenantCodeOrFallback);
    }
}
