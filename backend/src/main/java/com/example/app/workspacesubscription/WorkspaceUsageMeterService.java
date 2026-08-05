package com.example.app.workspacesubscription;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import java.time.LocalDate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkspaceUsageMeterService {
    public static final String SMS_PARTS = "SMS_PARTS";
    public static final String EMAIL_MESSAGES = "EMAIL_MESSAGES";
    public static final String API_CALLS = "API_CALLS";
    public static final String PAYMENT_TRANSACTIONS = "PAYMENT_TRANSACTIONS";

    private final CompanyRepository companies;
    private final NamedParameterJdbcTemplate jdbc;

    public WorkspaceUsageMeterService(CompanyRepository companies, NamedParameterJdbcTemplate jdbc) {
        this.companies = companies;
        this.jdbc = jdbc;
    }

    @Transactional
    public void increment(Long companyId, String metric, long amount) {
        if (companyId == null || metric == null || metric.isBlank() || amount <= 0) return;
        Company company = companies.findById(companyId).orElse(null);
        if (company == null || company.getWorkspace() == null) return;
        LocalDate month = LocalDate.now().withDayOfMonth(1);
        jdbc.update("""
                insert into workspace_usage_monthly
                    (created_at, updated_at, workspace_id, company_id, usage_month, metric, quantity)
                values (current_timestamp, current_timestamp, :workspaceId, :companyId, :usageMonth, :metric, :amount)
                on conflict (workspace_id, company_id, usage_month, metric)
                do update set quantity = workspace_usage_monthly.quantity + excluded.quantity,
                              updated_at = current_timestamp
                """, new MapSqlParameterSource()
                .addValue("workspaceId", company.getWorkspace().getId())
                .addValue("companyId", companyId)
                .addValue("usageMonth", month)
                .addValue("metric", metric.trim().toUpperCase())
                .addValue("amount", amount));
    }
    @Transactional
    public void incrementOnce(Long companyId, String metric, long amount, String sourceType, Object sourceId) {
        if (companyId == null || metric == null || metric.isBlank() || amount <= 0
                || sourceType == null || sourceType.isBlank() || sourceId == null) return;
        Company company = companies.findById(companyId).orElse(null);
        if (company == null || company.getWorkspace() == null) return;
        LocalDate month = LocalDate.now().withDayOfMonth(1);
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("workspaceId", company.getWorkspace().getId())
                .addValue("companyId", companyId)
                .addValue("usageMonth", month)
                .addValue("metric", metric.trim().toUpperCase())
                .addValue("sourceType", sourceType.trim().toUpperCase())
                .addValue("sourceId", String.valueOf(sourceId))
                .addValue("amount", amount);
        int inserted = jdbc.update("""
                insert into workspace_usage_events
                    (created_at, workspace_id, company_id, usage_month, metric, source_type, source_id, quantity)
                values (current_timestamp, :workspaceId, :companyId, :usageMonth, :metric, :sourceType, :sourceId, :amount)
                on conflict (workspace_id, metric, source_type, source_id) do nothing
                """, params);
        if (inserted > 0) increment(companyId, metric, amount);
    }

}
