package com.example.app.admin;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.persistence.EntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PlatformTenancyDeletionService {

    static final String PLATFORM_ADMIN_COMPANY_NAME = "Platform Admin";
    private static final String PLATFORM_SUBSCRIPTION_REFERENCE_PREFIX = "CALENDRA-SUBSCRIPTION:";

    private final CompanyRepository companies;
    private final UserRepository users;
    private final PlatformTenancyAdminAuditLogRepository tenancyAdminAuditLogs;
    private final JdbcTemplate jdbc;
    private final EntityManager entityManager;

    public PlatformTenancyDeletionService(
            CompanyRepository companies,
            UserRepository users,
            PlatformTenancyAdminAuditLogRepository tenancyAdminAuditLogs,
            JdbcTemplate jdbc,
            EntityManager entityManager) {
        this.companies = companies;
        this.users = users;
        this.tenancyAdminAuditLogs = tenancyAdminAuditLogs;
        this.jdbc = jdbc;
        this.entityManager = entityManager;
    }

    @Transactional
    public void deleteTenancy(long companyId, User actor, String reason) {
        Company company = companies.findById(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found"));
        assertDeletable(company);
        try {
            appendAuditLog(company, actor, reason);
            purgeCompanyData(companyId);
            companies.delete(company);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This tenant cannot be deleted because it is still referenced by other records.",
                    ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This tenant could not be deleted. Remove dependent data or contact engineering.",
                    ex);
        }
    }

    static void assertDeletable(Company company) {
        String name = company.getName() == null ? "" : company.getName().trim();
        if (PLATFORM_ADMIN_COMPANY_NAME.equalsIgnoreCase(name)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "The Platform Admin tenant cannot be deleted.");
        }
    }

    private void appendAuditLog(Company company, User actor, String reason) {
        String summary = "Delete permanently";
        String reasonText = reason == null ? "" : reason.trim();
        PlatformTenancyAdminAuditLog row = new PlatformTenancyAdminAuditLog();
        row.setCompany(company);
        row.setActorUser(resolveActor(actor));
        row.setActionType("DELETE_TENANT");
        row.setSummary(summary);
        row.setDetail(null);
        row.setReason(reasonText.isBlank() ? null : reasonText);
        tenancyAdminAuditLogs.saveAndFlush(row);
        // We purge this row later with JDBC; detach to keep Hibernate from re-checking
        // an in-memory association to a company entity that is being deleted.
        entityManager.detach(row);
    }

    private User resolveActor(User actor) {
        Long actorId = actor == null ? null : actor.getId();
        if (actorId == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This tenant could not be deleted because the acting platform user is missing.");
        }
        return users.getReferenceById(actorId);
    }

    private void purgeCompanyData(long companyId) {
        purgePlatformSubscriptionLinkage(companyId);

        // Billing
        exec("DELETE FROM advance_allocations WHERE company_id = ?", companyId);
        exec(
                """
                DELETE FROM open_bill_payments
                WHERE open_bill_id IN (SELECT id FROM open_bills WHERE company_id = ?)
                """,
                companyId);
        exec(
                """
                DELETE FROM open_bill_items
                WHERE open_bill_id IN (SELECT id FROM open_bills WHERE company_id = ?)
                """,
                companyId);
        exec("DELETE FROM open_bills WHERE company_id = ?", companyId);
        exec(
                """
                DELETE FROM bill_payments
                WHERE bill_id IN (SELECT id FROM bills WHERE company_id = ?)
                """,
                companyId);
        exec(
                """
                DELETE FROM bill_item
                WHERE bill_id IN (SELECT id FROM bills WHERE company_id = ?)
                """,
                companyId);
        exec("DELETE FROM bills WHERE company_id = ?", companyId);

        // Guest commerce
        exec(
                """
                DELETE FROM guest_entitlement_usages
                WHERE entitlement_id IN (SELECT id FROM guest_entitlements WHERE company_id = ?)
                   OR session_booking_id IN (SELECT id FROM session_booking WHERE company_id = ?)
                """,
                companyId,
                companyId);
        exec("DELETE FROM guest_entitlements WHERE company_id = ?", companyId);
        exec(
                """
                DELETE FROM guest_order_items
                WHERE order_id IN (SELECT id FROM guest_orders WHERE company_id = ?)
                """,
                companyId);
        exec("DELETE FROM guest_orders WHERE company_id = ?", companyId);
        exec("DELETE FROM guest_notifications WHERE company_id = ?", companyId);
        exec("DELETE FROM tenant_notifications WHERE company_id = ?", companyId);
        exec("DELETE FROM guest_tenant_links WHERE company_id = ?", companyId);
        exec("DELETE FROM guest_products WHERE company_id = ?", companyId);
        exec("DELETE FROM tenant_invites WHERE company_id = ?", companyId);

        // Waitlist (canonical schema)
        exec("DELETE FROM waitlist_events WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_slot_skips WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_booking_holds WHERE company_id = ?", companyId);
        exec("DELETE FROM waitlist_offers WHERE company_id = ?", companyId);
        exec("DELETE FROM waitlist_request_services WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_request_employees WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_request_windows WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_requests WHERE company_id = ?", companyId);

        // Sessions and calendar
        exec("DELETE FROM session_booking WHERE company_id = ?", companyId);
        exec("DELETE FROM bookable_slot WHERE company_id = ?", companyId);
        exec("DELETE FROM personal_calendar_block WHERE company_id = ?", companyId);
        exec("DELETE FROM calendar_todos WHERE company_id = ?", companyId);

        // CRM
        exec("DELETE FROM custom_field_values WHERE company_id = ?", companyId);
        exec("DELETE FROM custom_field_definitions WHERE company_id = ?", companyId);
        exec("DELETE FROM client_messages WHERE company_id = ?", companyId);
        exec(
                """
                DELETE FROM client_group_members
                WHERE group_id IN (SELECT id FROM client_groups WHERE company_id = ?)
                """,
                companyId);
        exec("DELETE FROM client_groups WHERE company_id = ?", companyId);
        exec(
                """
                DELETE FROM client_files
                WHERE owner_company_id = ?
                   OR client_id IN (SELECT id FROM clients WHERE company_id = ?)
                """,
                companyId,
                companyId);
        exec("DELETE FROM clients WHERE company_id = ?", companyId);
        exec(
                """
                DELETE FROM company_files
                WHERE owner_company_id = ? OR company_id IN (
                    SELECT id FROM client_companies WHERE owner_company_id = ?
                )
                """,
                companyId,
                companyId);
        exec("DELETE FROM client_companies WHERE owner_company_id = ?", companyId);

        // Files and fiscal
        exec("DELETE FROM fiscal_certificates WHERE company_id = ?", companyId);
        exec("DELETE FROM widget_booking_idempotency WHERE company_id = ?", companyId);

        // Catalog / config (session types before join table)
        exec(
                """
                DELETE FROM type_transaction_services
                WHERE session_type_id IN (SELECT id FROM session_type WHERE company_id = ?)
                   OR transaction_service_id IN (
                       SELECT id FROM transaction_service WHERE company_id = ?
                   )
                """,
                companyId,
                companyId);
        exec("DELETE FROM user_spaces WHERE space_id IN (SELECT id FROM space WHERE company_id = ?)", companyId);
        exec(
                "DELETE FROM user_types WHERE type_id IN (SELECT id FROM session_type WHERE company_id = ?)",
                companyId);
        exec("DELETE FROM session_type WHERE company_id = ?", companyId);
        exec("DELETE FROM service_group WHERE company_id = ?", companyId);
        exec("DELETE FROM space WHERE company_id = ?", companyId);
        exec("DELETE FROM payment_methods WHERE company_id = ?", companyId);
        exec("DELETE FROM transaction_service WHERE company_id = ?", companyId);
        exec("DELETE FROM app_settings WHERE company_id = ?", companyId);

        // Users and security artifacts
        purgeUsersForCompany(companyId);

        // Platform audit trail for this tenant (after user purge; actor is another tenant's user)
        exec("DELETE FROM platform_tenancy_admin_audit_logs WHERE company_id = ?", companyId);
    }


    private void purgePlatformSubscriptionLinkage(long companyId) {
        String subscriptionReference = PLATFORM_SUBSCRIPTION_REFERENCE_PREFIX + companyId;

        // Remove only the unfinished Platform Admin subscription draft for this tenant. Issued invoices remain
        // immutable accounting history and are isolated by their tenant-specific subscription reference.
        exec(
                """
                DELETE FROM open_bill_payments
                WHERE open_bill_id IN (SELECT id FROM open_bills WHERE reference = ?)
                """,
                subscriptionReference);
        exec(
                """
                DELETE FROM open_bill_items
                WHERE open_bill_id IN (SELECT id FROM open_bills WHERE reference = ?)
                """,
                subscriptionReference);
        exec("DELETE FROM open_bills WHERE reference = ?", subscriptionReference);

        // Preserve historical Platform Admin invoices, but archive the tenant-specific recipient records so they
        // can never be reused when a later tenant registers with the same email, VAT number or company name.
        exec(
                """
                UPDATE clients
                SET active = FALSE,
                    batch_payment_enabled = FALSE,
                    suppress_invoice_emails = TRUE
                WHERE billing_company_id IN (
                    SELECT id FROM client_companies WHERE platform_tenant_company_id = ?
                )
                """,
                companyId);
        exec(
                """
                UPDATE client_companies
                SET platform_tenant_company_id = NULL,
                    active = FALSE,
                    batch_payment_enabled = FALSE,
                    suppress_invoice_emails = TRUE
                WHERE platform_tenant_company_id = ?
                """,
                companyId);
    }

    private void purgeUsersForCompany(long companyId) {
        exec(
                """
                DELETE FROM security_activity_events
                WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
                """,
                companyId);
        exec(
                """
                DELETE FROM security_alert_preferences
                WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
                """,
                companyId);
        exec(
                """
                DELETE FROM user_security_sessions
                WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
                """,
                companyId);
        exec(
                """
                DELETE FROM webauthn_credentials
                WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
                """,
                companyId);
        exec(
                """
                DELETE FROM recovery_codes
                WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
                """,
                companyId);
        exec(
                """
                DELETE FROM password_reset_tokens
                WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
                """,
                companyId);
        exec(
                """
                DELETE FROM google_oauth_tokens
                WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
                """,
                companyId);
        exec(
                """
                DELETE FROM zoom_oauth_tokens
                WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)
                """,
                companyId);
        exec(
                "DELETE FROM user_spaces WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)",
                companyId);
        exec(
                "DELETE FROM user_types WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)",
                companyId);
        exec("DELETE FROM users WHERE company_id = ?", companyId);
    }

    private void exec(String sql, Object... args) {
        jdbc.update(sql, args);
    }
}
