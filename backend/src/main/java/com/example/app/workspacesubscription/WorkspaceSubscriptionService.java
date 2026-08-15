package com.example.app.workspacesubscription;

import com.example.app.billingissuer.LegalEntity;
import com.example.app.billingissuer.LegalEntityRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.entitlement.PackageAccessService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkspaceSubscriptionService {
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final WorkspaceSubscriptionRepository subscriptions;
    private final WorkspaceSubscriptionAuditLogRepository auditLogs;
    private final CompanyRepository companies;
    private final UserRepository users;
    private final LegalEntityRepository legalEntities;
    private final AppSettingRepository settings;
    private final PackageAccessService packageAccessService;
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public WorkspaceSubscriptionService(
            WorkspaceSubscriptionRepository subscriptions,
            WorkspaceSubscriptionAuditLogRepository auditLogs,
            CompanyRepository companies,
            UserRepository users,
            LegalEntityRepository legalEntities,
            AppSettingRepository settings,
            PackageAccessService packageAccessService,
            NamedParameterJdbcTemplate jdbc,
            ObjectMapper objectMapper
    ) {
        this.subscriptions = subscriptions;
        this.auditLogs = auditLogs;
        this.companies = companies;
        this.users = users;
        this.legalEntities = legalEntities;
        this.settings = settings;
        this.packageAccessService = packageAccessService;
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public WorkspaceSubscription requireFor(User actor) {
        Long workspaceId = workspaceId(actor);
        return subscriptions.findByWorkspaceId(workspaceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Workspace subscription is not provisioned."));
    }

    @Transactional(readOnly = true)
    public WorkspaceSubscription requireForWorkspace(Long workspaceId) {
        if (workspaceId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Workspace is required.");
        return subscriptions.findByWorkspaceId(workspaceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Workspace subscription is not provisioned."));
    }

    @Transactional(readOnly = true)
    public Company billingOwnerCompany(User actor) {
        WorkspaceSubscription subscription = requireFor(actor);
        if (subscription.getLegacyPrimaryCompany() != null) return subscription.getLegacyPrimaryCompany();
        return companies.findAllByWorkspaceIdOrderByNameAscIdAsc(workspaceId(actor)).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Workspace has no operating unit."));
    }


    @Transactional(readOnly = true)
    public WorkspaceBillingProfile billingProfileForCompany(Long companyId) {
        if (companyId == null) return null;
        Company company = companies.findById(companyId).orElse(null);
        if (company == null || company.getWorkspace() == null) return null;
        WorkspaceSubscription row = subscriptions.findByWorkspaceId(company.getWorkspace().getId()).orElse(null);
        if (row == null) return null;
        LegalEntity payer = row.getPayerLegalEntity();
        String payerTax = payer == null ? null : firstNonBlank(payer.getVatId(), payer.getTaxNumber());
        return new WorkspaceBillingProfile(
                payer == null ? null : payer.getName(),
                firstNonBlank(row.getBillingTaxId(), payerTax),
                firstNonBlank(row.getBillingAddress(), payer == null ? null : payer.getAddress()),
                firstNonBlank(row.getBillingPostalCode(), payer == null ? null : payer.getPostalCode()),
                firstNonBlank(row.getBillingCity(), payer == null ? null : payer.getCity()),
                firstNonBlank(row.getBillingEmail(), payer == null ? null : payer.getEmail()),
                payer == null ? null : payer.getTelephone(),
                row.getBillingContactName(),
                row.getPurchaseOrderReference()
        );
    }

    @Transactional(readOnly = true)
    public boolean isBillingOwnerCompany(Long companyId) {
        if (companyId == null) return false;
        Company company = companies.findById(companyId).orElse(null);
        if (company == null || company.getWorkspace() == null) return false;
        return subscriptions.findByWorkspaceId(company.getWorkspace().getId())
                .map(row -> row.getLegacyPrimaryCompany() == null || Objects.equals(row.getLegacyPrimaryCompany().getId(), companyId))
                .orElse(true);
    }

    @Transactional(readOnly = true)
    public SubscriptionView view(User actor) {
        WorkspaceSubscription subscription = requireFor(actor);
        requireWorkspaceAdministrator(actor, subscription.getWorkspace().getId());
        UsageView usage = usage(subscription.getWorkspace().getId());
        List<UnitUsageView> unitUsage = unitUsage(subscription.getWorkspace().getId());
        return toView(subscription, usage, unitUsage);
    }

    @Transactional
    public SubscriptionView updateBillingDetails(User actor, BillingDetailsUpdate request) {
        WorkspaceSubscription subscription = requireFor(actor);
        requireWorkspaceAdministrator(actor, subscription.getWorkspace().getId());
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Billing details are required.");
        subscription.setBillingContactName(trim(request.contactName(), 255));
        subscription.setBillingEmail(trim(request.email(), 320));
        subscription.setBillingAddress(trim(request.address(), 512));
        subscription.setBillingPostalCode(trim(request.postalCode(), 64));
        subscription.setBillingCity(trim(request.city(), 255));
        subscription.setBillingCountry(normalizeCountry(request.country()));
        subscription.setBillingTaxId(trim(request.taxId(), 64));
        subscription.setPurchaseOrderReference(trim(request.purchaseOrderReference(), 255));
        WorkspaceSubscription saved = subscriptions.save(subscription);
        audit(saved, actor, "UPDATE_BILLING_DETAILS", "Workspace subscription billing details updated.");
        return toView(saved, usage(saved.getWorkspace().getId()), unitUsage(saved.getWorkspace().getId()));
    }

    @Transactional
    public SubscriptionView updatePayer(User actor, Long legalEntityId) {
        WorkspaceSubscription subscription = requireFor(actor);
        requireWorkspaceAdministrator(actor, subscription.getWorkspace().getId());
        LegalEntity payer = null;
        if (legalEntityId != null) {
            payer = legalEntities.findByIdAndWorkspaceId(legalEntityId, subscription.getWorkspace().getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "The payer must belong to this workspace."));
        }
        subscription.setPayerLegalEntity(payer);
        WorkspaceSubscription saved = subscriptions.save(subscription);
        audit(saved, actor, "CHANGE_PAYER", payer == null ? "Subscription payer cleared." : "Subscription payer set to legal entity " + payer.getId() + ".");
        return toView(saved, usage(saved.getWorkspace().getId()), unitUsage(saved.getWorkspace().getId()));
    }

    @Transactional
    public SubscriptionView updateCapacity(User actor, CapacityUpdate request) {
        WorkspaceSubscription subscription = requireFor(actor);
        requireWorkspaceAdministrator(actor, subscription.getWorkspace().getId());
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Capacity is required.");
        UsageView current = usage(subscription.getWorkspace().getId());
        subscription.setMaxOperatingUnits(requireAtLeast("Operating units", request.operatingUnits(), current.operatingUnits()));
        subscription.setMaxLocations(requireAtLeast("Locations", request.locations(), current.locations()));
        subscription.setMaxActiveUsers(requireAtLeast("Active users", request.activeUsers(), current.activeUsers()));
        subscription.setMaxConsultants(requireAtLeast("Consultants", request.consultants(), current.consultants()));
        subscription.setIncludedSmsParts(nonNegative(request.smsParts(), subscription.getIncludedSmsParts()));
        subscription.setIncludedEmailMessages(nonNegative(request.emailMessages(), subscription.getIncludedEmailMessages()));
        subscription.setStorageLimitMb(nonNegativeLong(request.storageMb(), subscription.getStorageLimitMb()));
        subscription.setMaxPublicBookingPages(requireAtLeast("Public booking pages", request.publicBookingPages(), current.publicBookingPages()));
        subscription.setAllowSmsOverage(Boolean.TRUE.equals(request.allowSmsOverage()));
        subscription.setAllowEmailOverage(request.allowEmailOverage() == null || request.allowEmailOverage());
        subscription.setAllowBookingOverage(request.allowBookingOverage() == null || request.allowBookingOverage());
        WorkspaceSubscription saved = subscriptions.save(subscription);
        projectLegacyCapacity(saved);
        audit(saved, actor, "UPDATE_CAPACITY", "Workspace subscription capacity updated.");
        return toView(saved, usage(saved.getWorkspace().getId()), unitUsage(saved.getWorkspace().getId()));
    }

    @Transactional
    public WorkspaceSubscription syncFromLegacyCompany(Long companyId) {
        if (companyId == null) return null;
        Company requestedCompany = companies.findById(companyId).orElse(null);
        if (requestedCompany == null || requestedCompany.getWorkspace() == null) return null;
        WorkspaceSubscription subscription = subscriptions.findByWorkspaceId(requestedCompany.getWorkspace().getId()).orElse(null);
        if (subscription == null) return null;

        // Subscription settings are owned by the retained billing-owner operating unit. Callers may
        // originate from any unit in the workspace, so always project from the billing owner when set.
        Company company = subscription.getLegacyPrimaryCompany() == null
                ? requestedCompany
                : subscription.getLegacyPrimaryCompany();
        Long sourceCompanyId = company.getId();
        subscription.setLegacyPrimaryCompany(company);
        subscription.setPlanKey(normalizePlan(setting(sourceCompanyId, SettingKey.SIGNUP_PACKAGE_NAME, subscription.getPlanKey())));
        subscription.setBillingInterval(normalizeInterval(setting(sourceCompanyId, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, subscription.getBillingInterval())));
        subscription.setStatus(normalizeStatus(setting(sourceCompanyId, SettingKey.BILLING_SUBSCRIPTION_STATUS, subscription.getStatus().name()), subscription.getPlanKey()));
        subscription.setCurrentPeriodStart(parseDate(setting(sourceCompanyId, SettingKey.BILLING_SUBSCRIPTION_START, null)));
        subscription.setCurrentPeriodEnd(parseDate(setting(sourceCompanyId, SettingKey.BILLING_SUBSCRIPTION_END, null)));

        // Use the same entitlement calculation as POST /api/users: paid/base users plus any
        // current-cycle user additions. This keeps the DB trigger and application quota aligned.
        int configuredUsers = packageAccessService.userQuota(sourceCompanyId);
        subscription.setMaxActiveUsers(capacityAtLeastCurrent(configuredUsers, currentUsage(subscription.getWorkspace().getId()).activeUsers()));
        subscription.setIncludedSmsParts(Math.max(0, parseInt(setting(sourceCompanyId, SettingKey.SIGNUP_SMS_COUNT, null), subscription.getIncludedSmsParts())));
        List<String> addons = parseCsv(setting(sourceCompanyId, SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS,
                setting(sourceCompanyId, SettingKey.SIGNUP_ADDON_KEYS, "")));
        subscription.setAddonsJson(writeStringList(addons));
        applyPlanCapacity(subscription, configuredUsers);
        applyPlanFeatures(subscription, addons);
        return subscriptions.save(subscription);
    }


    @Transactional
    public WorkspaceSubscription syncFromLegacyCompanyAndFlush(Long companyId) {
        WorkspaceSubscription subscription = syncFromLegacyCompany(companyId);
        if (subscription != null) {
            subscriptions.flush();
        }
        return subscription;
    }

    @Transactional
    public void selectBillingOwner(Long workspaceId, Long companyId, User actor) {
        WorkspaceSubscription subscription = requireForWorkspace(workspaceId);
        requireWorkspaceAdministrator(actor, workspaceId);
        Company company = companies.findById(companyId)
                .filter(value -> value.getWorkspace() != null && Objects.equals(value.getWorkspace().getId(), workspaceId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Billing owner must belong to this workspace."));
        subscription.setLegacyPrimaryCompany(company);
        subscriptions.save(subscription);
        MapSqlParameterSource ownerParams = new MapSqlParameterSource()
                .addValue("companyId", companyId)
                .addValue("subscriptionId", subscription.getId());
        jdbc.update("update workspace_subscription_legacy_sources set retained_billing_owner = false where workspace_subscription_id = :subscriptionId",
                ownerParams);
        jdbc.update("update workspace_subscription_legacy_sources set retained_billing_owner = true where workspace_subscription_id = :subscriptionId and company_id = :companyId",
                ownerParams);
        syncFromLegacyCompany(companyId);
        audit(subscription, actor, "CHANGE_BILLING_OWNER", "Retained billing owner changed to operating unit " + companyId + ".");
    }

    @Transactional(readOnly = true)
    public void requireWorkspaceAdministrator(User actor, Long workspaceId) {
        if (actor == null || actor.getLoginAccount() == null || workspaceId == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        List<User> memberships = users.findActiveWorkspaceMemberships(actor.getLoginAccount().getId(), workspaceId);
        if (memberships.isEmpty() || memberships.stream().anyMatch(row -> row.getRole() != Role.ADMIN && row.getRole() != Role.SUPER_ADMIN)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator access is required in every workspace operating unit.");
        }
    }

    @Transactional(readOnly = true)
    public EntitlementSnapshot entitlementSnapshot(User actor) {
        WorkspaceSubscription row = requireFor(actor);
        return new EntitlementSnapshot(row.getPlanKey(), row.getStatus().name(), List.copyOf(featureNames(row)),
                new LimitsView(row.getMaxOperatingUnits(), row.getMaxLocations(), row.getMaxActiveUsers(), row.getMaxConsultants(),
                        row.getMaxClients(), row.getMaxMonthlyBookings(), row.getIncludedSmsParts(), row.getIncludedEmailMessages(),
                        row.getStorageLimitMb(), row.getMaxPublicBookingPages(), row.getAnalyticsRetentionDays(),
                        row.isAllowSmsOverage(), row.isAllowEmailOverage(), row.isAllowBookingOverage(), row.isApiAccess()));
    }

    private SubscriptionView toView(WorkspaceSubscription row, UsageView usage, List<UnitUsageView> unitUsage) {
        Set<String> features = featureNames(row);
        LegalEntity payer = row.getPayerLegalEntity();
        Company owner = row.getLegacyPrimaryCompany();
        return new SubscriptionView(
                row.getId(), row.getWorkspace().getId(), row.getWorkspace().getName(),
                row.getPlanKey(), row.getBillingInterval(), row.getStatus().name(),
                row.getCurrentPeriodStart(), row.getCurrentPeriodEnd(), row.getTrialEndsAt(), row.getGraceUntil(),
                owner == null ? null : owner.getId(), owner == null ? null : owner.getName(),
                payer == null ? null : payer.getId(), payer == null ? null : payer.getName(),
                row.getBillingContactName(), row.getBillingEmail(), row.getBillingAddress(), row.getBillingPostalCode(),
                row.getBillingCity(), row.getBillingCountry(), row.getBillingTaxId(), row.getPurchaseOrderReference(),
                new LimitsView(row.getMaxOperatingUnits(), row.getMaxLocations(), row.getMaxActiveUsers(), row.getMaxConsultants(),
                        row.getMaxClients(), row.getMaxMonthlyBookings(), row.getIncludedSmsParts(), row.getIncludedEmailMessages(),
                        row.getStorageLimitMb(), row.getMaxPublicBookingPages(), row.getAnalyticsRetentionDays(),
                        row.isAllowSmsOverage(), row.isAllowEmailOverage(), row.isAllowBookingOverage(), row.isApiAccess()),
                usage, unitUsage, List.copyOf(features), readStringList(row.getAddonsJson())
        );
    }

    public UsageView usage(Long workspaceId) {
        YearMonth month = YearMonth.now();
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("workspaceId", workspaceId)
                .addValue("start", month.atDay(1).atStartOfDay())
                .addValue("end", month.plusMonths(1).atDay(1).atStartOfDay())
                .addValue("usageMonth", month.atDay(1));
        return new UsageView(
                scalar("select count(*) from company where workspace_id = :workspaceId", params),
                scalar("select count(*) from locations l join company c on c.id=l.company_id where c.workspace_id=:workspaceId", params),
                scalar("select count(distinct u.login_account_id) from users u join company c on c.id=u.company_id where c.workspace_id=:workspaceId and u.active", params),
                scalar("select count(distinct u.login_account_id) from users u join company c on c.id=u.company_id where c.workspace_id=:workspaceId and u.active and u.consultant", params),
                scalar("select count(distinct coalesce(cl.workspace_client_id, cl.id)) from clients cl join company c on c.id=cl.company_id where c.workspace_id=:workspaceId", params),
                scalar("select count(*) from session_booking sb join company c on c.id=sb.company_id where c.workspace_id=:workspaceId and sb.start_time>=:start and sb.start_time<:end", params),
                scalar("select coalesce(sum(quantity),0) from workspace_usage_monthly where workspace_id=:workspaceId and usage_month=:usageMonth and metric='SMS_PARTS'", params),
                scalar("select coalesce(sum(quantity),0) from workspace_usage_monthly where workspace_id=:workspaceId and usage_month=:usageMonth and metric='EMAIL_MESSAGES'", params),
                scalar("select coalesce(sum(quantity),0) from workspace_usage_monthly where workspace_id=:workspaceId and usage_month=:usageMonth and metric='API_CALLS'", params),
                scalar("select coalesce(sum(quantity),0) from workspace_usage_monthly where workspace_id=:workspaceId and usage_month=:usageMonth and metric='PAYMENT_TRANSACTIONS'", params),
                scalar("select coalesce(sum(size_bytes),0) from client_files f join company c on c.id=f.owner_company_id where c.workspace_id=:workspaceId", params)
                        + scalar("select coalesce(sum(size_bytes),0) from company_files f join company c on c.id=f.owner_company_id where c.workspace_id=:workspaceId", params),
                scalar("select count(*) from company where workspace_id=:workspaceId and workspace_public_booking_enabled=true", params)
                        + scalar("select count(*) from workspace_public_booking_settings where workspace_id=:workspaceId and enabled=true", params)
        );
    }

    private List<UnitUsageView> unitUsage(Long workspaceId) {
        String sql = """
                select c.id, c.name,
                       (select count(*) from locations l where l.company_id=c.id) locations,
                       (select count(*) from users u where u.company_id=c.id and u.active) memberships,
                       (select count(*) from users u where u.company_id=c.id and u.active and u.consultant) consultants,
                       (select count(*) from clients cl where cl.company_id=c.id) clients,
                       (select count(*) from session_booking sb where sb.company_id=c.id and sb.start_time>=:start and sb.start_time<:end) bookings,
                       (select coalesce(sum(wu.quantity),0) from workspace_usage_monthly wu where wu.company_id=c.id and wu.usage_month=:usageMonth and wu.metric='SMS_PARTS') sms,
                       (select coalesce(sum(wu.quantity),0) from workspace_usage_monthly wu where wu.company_id=c.id and wu.usage_month=:usageMonth and wu.metric='EMAIL_MESSAGES') email_messages,
                       (select coalesce(sum(f.size_bytes),0) from client_files f where f.owner_company_id=c.id)
                         + (select coalesce(sum(f.size_bytes),0) from company_files f where f.owner_company_id=c.id) storage_bytes,
                       (select coalesce(sum(wu.quantity),0) from workspace_usage_monthly wu where wu.company_id=c.id and wu.usage_month=:usageMonth and wu.metric='API_CALLS') api_calls,
                       (select coalesce(sum(wu.quantity),0) from workspace_usage_monthly wu where wu.company_id=c.id and wu.usage_month=:usageMonth and wu.metric='PAYMENT_TRANSACTIONS') payment_transactions
                  from company c where c.workspace_id=:workspaceId order by lower(c.name), c.id
                """;
        YearMonth month = YearMonth.now();
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("workspaceId", workspaceId)
                .addValue("start", month.atDay(1).atStartOfDay())
                .addValue("end", month.plusMonths(1).atDay(1).atStartOfDay())
                .addValue("usageMonth", month.atDay(1));
        return jdbc.query(sql, params, (rs, rowNum) -> new UnitUsageView(
                rs.getLong("id"), rs.getString("name"), rs.getLong("locations"),
                rs.getLong("memberships"), rs.getLong("consultants"), rs.getLong("clients"),
                rs.getLong("bookings"), rs.getLong("sms"), rs.getLong("email_messages"),
                rs.getLong("storage_bytes"), rs.getLong("api_calls"), rs.getLong("payment_transactions")));
    }

    private long scalar(String sql, MapSqlParameterSource params) {
        Long value = jdbc.queryForObject(sql, params, Long.class);
        return value == null ? 0L : value;
    }

    private void projectLegacyCapacity(WorkspaceSubscription subscription) {
        Company owner = subscription.getLegacyPrimaryCompany();
        if (owner == null) return;
        upsert(owner, SettingKey.SIGNUP_USER_COUNT, String.valueOf(subscription.getMaxActiveUsers()));
        upsert(owner, SettingKey.SIGNUP_SMS_COUNT, String.valueOf(subscription.getIncludedSmsParts()));
    }

    private void upsert(Company company, SettingKey key, String value) {
        AppSetting row = settings.findByCompanyIdAndKey(company.getId(), key).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(company);
            created.setKey(key.name());
            return created;
        });
        row.setValue(value == null ? "" : value);
        settings.save(row);
    }

    private void audit(WorkspaceSubscription subscription, User actor, String action, String details) {
        WorkspaceSubscriptionAuditLog row = new WorkspaceSubscriptionAuditLog();
        row.setSubscription(subscription);
        row.setActorMembership(actor);
        row.setActorLoginAccount(actor == null ? null : actor.getLoginAccount());
        row.setAction(action);
        row.setDetails(details);
        auditLogs.save(row);
    }

    private Long workspaceId(User actor) {
        if (actor == null || actor.getCompany() == null || actor.getCompany().getWorkspace() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No active workspace.");
        }
        return actor.getCompany().getWorkspace().getId();
    }

    private Set<String> featureNames(WorkspaceSubscription row) {
        LinkedHashSet<String> values = new LinkedHashSet<>(readStringList(row.getFeaturesJson()));
        if (row.isApiAccess()) values.add(WorkspaceFeature.API_ACCESS.name());
        values.add(WorkspaceFeature.CORE.name());
        return values;
    }

    public boolean hasFeature(WorkspaceSubscription row, WorkspaceFeature feature) {
        if (row == null || feature == null) return false;
        if (row.getStatus() == WorkspaceSubscriptionStatus.SUSPENDED || row.getStatus() == WorkspaceSubscriptionStatus.CANCELLED) return false;
        return featureNames(row).contains(feature.name());
    }

    private List<String> readStringList(String json) {
        try {
            if (json == null || json.isBlank()) return List.of();
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception ignored) {
            return List.of();
        }
    }


    private UsageView currentUsage(Long workspaceId) {
        return usage(workspaceId);
    }

    private void applyPlanCapacity(WorkspaceSubscription subscription, int configuredUsers) {
        UsageView current = currentUsage(subscription.getWorkspace().getId());
        String plan = normalizePlan(subscription.getPlanKey());
        int unitDefault = switch (plan) {
            case "PROFESSIONAL" -> 3;
            case "PREMIUM" -> 0;
            case "CUSTOM" -> subscription.getMaxOperatingUnits();
            default -> 1;
        };
        int locationDefault = switch (plan) {
            case "PROFESSIONAL" -> 10;
            case "PREMIUM" -> 0;
            case "CUSTOM" -> subscription.getMaxLocations();
            default -> 2;
        };
        int publicPageDefault = switch (plan) {
            case "PROFESSIONAL" -> 3;
            case "PREMIUM" -> 0;
            case "CUSTOM" -> subscription.getMaxPublicBookingPages();
            default -> 1;
        };
        subscription.setMaxOperatingUnits(capacityAtLeastCurrent(unitDefault, current.operatingUnits()));
        subscription.setMaxLocations(capacityAtLeastCurrent(locationDefault, current.locations()));
        subscription.setMaxPublicBookingPages(capacityAtLeastCurrent(publicPageDefault, current.publicBookingPages()));
        subscription.setMaxActiveUsers(subscription.getMaxActiveUsers() == 0
                ? 0
                : Math.max(configuredUsers, capacityAtLeastCurrent(subscription.getMaxActiveUsers(), current.activeUsers())));
        subscription.setMaxConsultants(subscription.getMaxConsultants() == 0
                ? 0
                : capacityAtLeastCurrent(Math.max(1, configuredUsers), current.consultants()));
    }

    private static int capacityAtLeastCurrent(int configured, long current) {
        if (configured == 0) return 0;
        return Math.max(configured, Math.toIntExact(Math.min(Integer.MAX_VALUE, current)));
    }

    private void applyPlanFeatures(WorkspaceSubscription subscription, List<String> addons) {
        List<String> values = new ArrayList<>();
        values.add(WorkspaceFeature.CORE.name());
        switch (normalizePlan(subscription.getPlanKey())) {
            case "PREMIUM", "CUSTOM" -> {
                values.add(WorkspaceFeature.MULTI_UNIT.name());
                values.add(WorkspaceFeature.WORKSPACE_ANALYTICS.name());
                values.add(WorkspaceFeature.WORKSPACE_PUBLIC_BOOKING.name());
                values.add(WorkspaceFeature.CONFIGURATION_COPY.name());
                values.add(WorkspaceFeature.API_ACCESS.name());
                subscription.setApiAccess(true);
            }
            case "PROFESSIONAL" -> {
                values.add(WorkspaceFeature.MULTI_UNIT.name());
                values.add(WorkspaceFeature.WORKSPACE_ANALYTICS.name());
                values.add(WorkspaceFeature.WORKSPACE_PUBLIC_BOOKING.name());
                values.add(WorkspaceFeature.CONFIGURATION_COPY.name());
                subscription.setApiAccess(false);
            }
            default -> subscription.setApiAccess(false);
        }
        for (String addon : addons == null ? List.<String>of() : addons) {
            String key = addon == null ? "" : addon.toLowerCase(Locale.ROOT).replace('_', '-');
            if (key.contains("multi") || key.contains("location") || key.contains("unit")) values.add(WorkspaceFeature.MULTI_UNIT.name());
            if (key.contains("analytics") || key.contains("report")) values.add(WorkspaceFeature.WORKSPACE_ANALYTICS.name());
            if (key.contains("public-booking") || key.contains("workspace-booking")) values.add(WorkspaceFeature.WORKSPACE_PUBLIC_BOOKING.name());
            if (key.contains("config") || key.contains("copy")) values.add(WorkspaceFeature.CONFIGURATION_COPY.name());
            if (key.contains("api")) {
                values.add(WorkspaceFeature.API_ACCESS.name());
                subscription.setApiAccess(true);
            }
        }
        UsageView current = usage(subscription.getWorkspace().getId());
        if (current.operatingUnits() > 1) {
            values.add(WorkspaceFeature.MULTI_UNIT.name());
            values.add(WorkspaceFeature.WORKSPACE_ANALYTICS.name());
            values.add(WorkspaceFeature.CONFIGURATION_COPY.name());
        }
        if (current.publicBookingPages() > 0) {
            values.add(WorkspaceFeature.WORKSPACE_PUBLIC_BOOKING.name());
        }
        try {
            subscription.setFeaturesJson(objectMapper.writeValueAsString(new LinkedHashSet<>(values)));
        } catch (Exception ignored) {
            subscription.setFeaturesJson("[\"CORE\"]");
        }
    }


    private List<String> parseCsv(String value) {
        if (value == null || value.isBlank()) return List.of();
        return java.util.Arrays.stream(value.split(","))
                .map(String::trim).filter(item -> !item.isBlank()).distinct().toList();
    }

    private String writeStringList(List<String> values) {
        try { return objectMapper.writeValueAsString(values == null ? List.of() : values); }
        catch (Exception ignored) { return "[]"; }
    }

    private String setting(Long companyId, SettingKey key, String fallback) {
        return settings.findByCompanyIdAndKey(companyId, key).map(AppSetting::getValue).orElse(fallback);
    }

    private static String normalizePlan(String value) {
        String normalized = value == null ? "PROFESSIONAL" : value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if ("PRO".equals(normalized)) return "PROFESSIONAL";
        return Set.of("TRIAL", "BASIC", "PROFESSIONAL", "PREMIUM", "CUSTOM").contains(normalized) ? normalized : "CUSTOM";
    }

    private static String normalizeInterval(String value) {
        return "YEARLY".equalsIgnoreCase(value == null ? "" : value.trim()) ? "YEARLY" : "MONTHLY";
    }

    private static WorkspaceSubscriptionStatus normalizeStatus(String value, String plan) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "PENDING_PAYMENT" -> WorkspaceSubscriptionStatus.PENDING_PAYMENT;
            case "PAST_DUE" -> WorkspaceSubscriptionStatus.PAST_DUE;
            case "GRACE" -> WorkspaceSubscriptionStatus.GRACE;
            case "SUSPENDED" -> WorkspaceSubscriptionStatus.SUSPENDED;
            case "CANCELLED" -> WorkspaceSubscriptionStatus.CANCELLED;
            case "TRIAL" -> WorkspaceSubscriptionStatus.TRIAL;
            default -> "TRIAL".equals(plan) ? WorkspaceSubscriptionStatus.TRIAL : WorkspaceSubscriptionStatus.ACTIVE;
        };
    }

    private static LocalDate parseDate(String value) {
        try { return value == null || value.isBlank() ? null : LocalDate.parse(value.trim()); }
        catch (Exception ignored) { return null; }
    }

    private static int parseInt(String value, int fallback) {
        try { return value == null || value.isBlank() ? fallback : Integer.parseInt(value.trim()); }
        catch (Exception ignored) { return fallback; }
    }

    private static int requireAtLeast(String label, Integer requested, long current) {
        int value = requested == null ? Math.toIntExact(Math.min(Integer.MAX_VALUE, current)) : Math.max(0, requested);
        if (value > 0 && value < current) throw new ResponseStatusException(HttpStatus.CONFLICT, label + " limit cannot be below current usage (" + current + ").");
        return value;
    }

    private static int nonNegative(Integer requested, int fallback) {
        return requested == null ? fallback : Math.max(0, requested);
    }

    private static long nonNegativeLong(Long requested, long fallback) {
        return requested == null ? fallback : Math.max(0L, requested);
    }


    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return null;
    }

    private static String trim(String value, int max) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.isBlank()) return null;
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    private static String normalizeCountry(String value) {
        String country = value == null ? "SI" : value.trim().toUpperCase(Locale.ROOT);
        return country.length() == 2 ? country : "SI";
    }

    public record WorkspaceBillingProfile(String companyName, String taxId, String address, String postalCode,
                                          String city, String email, String phone, String contactName,
                                          String purchaseOrderReference) {}
    public record BillingDetailsUpdate(String contactName, String email, String address, String postalCode,
                                       String city, String country, String taxId, String purchaseOrderReference) {}
    public record CapacityUpdate(Integer operatingUnits, Integer locations, Integer activeUsers, Integer consultants,
                                 Integer smsParts, Integer emailMessages, Long storageMb, Integer publicBookingPages,
                                 Boolean allowSmsOverage, Boolean allowEmailOverage, Boolean allowBookingOverage) {}
    public record LimitsView(int operatingUnits, int locations, int activeUsers, int consultants, int clients,
                             int monthlyBookings, int smsParts, int emailMessages, long storageMb,
                             int publicBookingPages, int analyticsRetentionDays, boolean allowSmsOverage,
                             boolean allowEmailOverage, boolean allowBookingOverage, boolean apiAccess) {}
    public record UsageView(long operatingUnits, long locations, long activeUsers, long consultants, long clients,
                            long monthlyBookings, long smsParts, long emailMessages, long apiCalls,
                            long paymentTransactions, long storageBytes, long publicBookingPages) {}
    public record UnitUsageView(Long companyId, String companyName, long locations, long memberships,
                                long consultants, long clients, long monthlyBookings, long smsParts,
                                long emailMessages, long storageBytes, long apiCalls, long paymentTransactions) {}
    public record EntitlementSnapshot(String planKey, String status, List<String> features, LimitsView limits) {}
    public record SubscriptionView(Long id, Long workspaceId, String workspaceName, String planKey,
                                   String billingInterval, String status, LocalDate currentPeriodStart,
                                   LocalDate currentPeriodEnd, LocalDate trialEndsAt, LocalDate graceUntil,
                                   Long billingOwnerCompanyId, String billingOwnerCompanyName,
                                   Long payerLegalEntityId, String payerLegalEntityName,
                                   String billingContactName, String billingEmail, String billingAddress,
                                   String billingPostalCode, String billingCity, String billingCountry,
                                   String billingTaxId, String purchaseOrderReference, LimitsView limits,
                                   UsageView usage, List<UnitUsageView> units, List<String> features,
                                   List<String> addons) {}
}
