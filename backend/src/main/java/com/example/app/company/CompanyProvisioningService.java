package com.example.app.company;

import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

@Service
public class CompanyProvisioningService {
    private final CompanyRepository companies;
    private final TenantCodeService tenantCodeService;

    public CompanyProvisioningService(CompanyRepository companies, TenantCodeService tenantCodeService) {
        this.companies = companies;
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
}
