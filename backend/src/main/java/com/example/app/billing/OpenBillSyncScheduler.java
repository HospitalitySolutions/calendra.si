package com.example.app.billing;

import com.example.app.company.CompanyRepository;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OpenBillSyncScheduler {
    private static final Logger log = LoggerFactory.getLogger(OpenBillSyncScheduler.class);

    private final CompanyRepository companies;
    private final OpenBillSyncService openBillSyncService;

    public OpenBillSyncScheduler(CompanyRepository companies, OpenBillSyncService openBillSyncService) {
        this.companies = companies;
        this.openBillSyncService = openBillSyncService;
    }

    @Scheduled(cron = "${app.open-bills.sync-cron:0 */10 * * * *}")
    @SchedulerLock(name = "openBillSyncScheduler_syncDueOpenBills", lockAtMostFor = "PT20M", lockAtLeastFor = "PT30S")
    public void syncDueOpenBills() {
        for (Long companyId : companies.findAllIds()) {
            try {
                openBillSyncService.syncCompany(companyId);
            } catch (Exception ex) {
                log.warn("Open bill sync failed for companyId={}", companyId, ex);
            }
        }
    }
}
