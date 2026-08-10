package com.example.app.admin;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.course.BunnyMediaService;
import com.example.app.files.TenantFileS3Service;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private static final Logger log = LoggerFactory.getLogger(PlatformTenancyDeletionService.class);

    private static final Set<String> COMPANY_REFERENCE_COLUMNS = Set.of(
            "company_id",
            "owner_company_id",
            "platform_tenant_company_id",
            "referrer_company_id",
            "referred_company_id",
            "actor_company_id",
            "source_company_id",
            "target_company_id",
            "legacy_primary_company_id",
            "last_selected_company_id");

    private final CompanyRepository companies;
    private final UserRepository users;
    private final PlatformTenancyAdminAuditLogRepository tenancyAdminAuditLogs;
    private final JdbcTemplate jdbc;
    private final EntityManager entityManager;
    private final TenantFileS3Service fileStorage;
    private final BunnyMediaService bunnyMediaService;

    public PlatformTenancyDeletionService(
            CompanyRepository companies,
            UserRepository users,
            PlatformTenancyAdminAuditLogRepository tenancyAdminAuditLogs,
            JdbcTemplate jdbc,
            EntityManager entityManager,
            TenantFileS3Service fileStorage,
            BunnyMediaService bunnyMediaService) {
        this.companies = companies;
        this.users = users;
        this.tenancyAdminAuditLogs = tenancyAdminAuditLogs;
        this.jdbc = jdbc;
        this.entityManager = entityManager;
        this.fileStorage = fileStorage;
        this.bunnyMediaService = bunnyMediaService;
    }

    /**
     * Permanently deletes one Platform Admin tenant/operating unit.
     *
     * <p>All unit-owned operational data is removed. Workspace-shared identities are removed only when they become
     * orphaned; if this is the last company in the workspace, workspace-owned data and the workspace itself are also
     * removed. Login accounts and guest accounts are deleted only when no surviving tenant still references them.</p>
     *
     * <p>External tenant storage is deleted strictly before the database transaction commits. S3 deletion includes
     * historical object versions. Bunny course media is also removed. External deletion is retry-safe: a failed
     * request keeps the database transaction uncommitted so the admin can retry the same delete operation.</p>
     */
    @Transactional
    public void deleteTenancy(long companyId, User actor, String reason) {
        Company company = companies.findById(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found"));
        assertDeletable(company);

        Long workspaceId = resolveWorkspaceId(company, companyId);
        Long survivingCompanyId = workspaceId == null ? null : firstSurvivingCompanyId(workspaceId, companyId);
        ExternalDeletionPlan external = collectExternalDeletionPlan(companyId);
        Set<Long> guestUserCandidates = collectGuestUserCandidates(companyId);
        Set<Long> loginAccountCandidates = collectLoginAccountCandidates(companyId);

        try {
            appendAuditLog(company, actor, reason);
            purgePlatformSubscriptionLinkage(companyId, external);
            purgeCompanyData(companyId, workspaceId, survivingCompanyId);
            purgeOrphanGuestUsers(guestUserCandidates, external);
            purgeOrphanLoginAccounts(loginAccountCandidates, external.deletedIdentityEmails());
            purgeSignupIntentsForDeletedIdentities(external.deletedIdentityEmails());
            assertNoCompanyReferences(companyId);

            boolean deleteWorkspace = workspaceId != null && survivingCompanyId == null;
            if (deleteWorkspace) {
                // Prepare and validate every workspace-owned row before touching external storage. Afterwards only
                // the target company.workspace_id reference is allowed to remain, so the final two DELETE statements
                // cannot be surprised by an undiscovered workspace dependency.
                purgeWorkspaceData(workspaceId);
                assertNoWorkspaceReferences(workspaceId, companyId);
            }

            // External storage cannot participate in the PostgreSQL transaction. Do it only after the database purge
            // has been preflighted. If an external delete fails, the DB transaction rolls back and the operation can
            // be retried; external deletes are idempotent.
            entityManager.detach(company);
            purgeExternalAssets(company, external);

            exec("DELETE FROM company WHERE id = ?", companyId);
            if (deleteWorkspace) {
                exec("DELETE FROM workspaces WHERE id = ?", workspaceId);
            }
            entityManager.clear();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (DataIntegrityViolationException ex) {
            log.warn("Permanent tenant deletion hit a database integrity constraint companyId={}", companyId, ex);
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This tenant cannot be deleted because tenant data is still referenced by another record. No database deletion was committed.",
                    ex);
        } catch (RuntimeException ex) {
            log.warn("Permanent tenant deletion failed companyId={}", companyId, ex);
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This tenant could not be deleted completely. No database deletion was committed; fix the reported dependency or external-storage problem and retry.",
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

    private Long resolveWorkspaceId(Company company, long companyId) {
        if (company.getWorkspace() != null && company.getWorkspace().getId() != null) {
            return company.getWorkspace().getId();
        }
        List<Long> ids = jdbc.query(
                "SELECT workspace_id FROM company WHERE id = ?",
                (rs, rowNum) -> rs.getLong(1),
                companyId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private Long firstSurvivingCompanyId(long workspaceId, long deletingCompanyId) {
        List<Long> ids = jdbc.query(
                "SELECT id FROM company WHERE workspace_id = ? AND id <> ? ORDER BY id LIMIT 1",
                (rs, rowNum) -> rs.getLong(1),
                workspaceId,
                deletingCompanyId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private void appendAuditLog(Company company, User actor, String reason) {
        String reasonText = reason == null ? "" : reason.trim();
        PlatformTenancyAdminAuditLog row = new PlatformTenancyAdminAuditLog();
        row.setCompany(company);
        row.setActorUser(resolveActor(actor));
        row.setActionType("DELETE_TENANT");
        row.setSummary("Delete permanently");
        row.setDetail(null);
        row.setReason(reasonText.isBlank() ? null : reasonText);
        tenancyAdminAuditLogs.saveAndFlush(row);
        // Permanent deletion removes the tenant audit rows too. Detach this just-created row so Hibernate does not
        // later re-check the in-memory association after the JDBC purge.
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

    private ExternalDeletionPlan collectExternalDeletionPlan(long companyId) {
        ExternalDeletionPlan plan = new ExternalDeletionPlan();
        plan.s3ObjectKeys().addAll(queryStrings(
                "SELECT invoice_pdf_object_key FROM bills WHERE company_id = ? AND invoice_pdf_object_key IS NOT NULL AND btrim(invoice_pdf_object_key) <> ''",
                companyId));
        plan.s3ObjectKeys().addAll(queryStrings(
                "SELECT s3_object_key FROM client_files WHERE owner_company_id = ?",
                companyId));
        plan.s3ObjectKeys().addAll(queryStrings(
                "SELECT s3_object_key FROM company_files WHERE owner_company_id = ?",
                companyId));
        plan.s3ObjectKeys().addAll(queryStrings(
                "SELECT avatar_s3_key FROM users WHERE company_id = ? AND avatar_s3_key IS NOT NULL AND btrim(avatar_s3_key) <> ''",
                companyId));
        plan.s3ObjectKeys().addAll(queryStrings(
                "SELECT public_logo_s3_key FROM locations WHERE company_id = ? AND public_logo_s3_key IS NOT NULL AND btrim(public_logo_s3_key) <> ''",
                companyId));

        plan.courseMedia().addAll(jdbc.query(
                """
                SELECT bunny_library_id, bunny_library_name, bunny_video_id, bunny_storage_path
                  FROM courses
                 WHERE company_id = ?
                """,
                (rs, rowNum) -> new CourseMedia(
                        rs.getString("bunny_library_id"),
                        rs.getString("bunny_library_name"),
                        rs.getString("bunny_video_id"),
                        rs.getString("bunny_storage_path")),
                companyId));
        plan.bunnyLibraryIds().addAll(queryStrings(
                """
                SELECT DISTINCT c.bunny_library_id
                  FROM courses c
                 WHERE c.company_id = ?
                   AND c.bunny_library_id IS NOT NULL
                   AND btrim(c.bunny_library_id) <> ''
                   AND NOT EXISTS (
                       SELECT 1
                         FROM courses other
                        WHERE other.company_id <> ?
                          AND other.bunny_library_id = c.bunny_library_id
                   )
                """,
                companyId,
                companyId));
        return plan;
    }

    private Set<Long> collectGuestUserCandidates(long companyId) {
        Set<Long> ids = new LinkedHashSet<>();
        ids.addAll(queryLongs("SELECT guest_user_id FROM guest_tenant_links WHERE company_id = ?", companyId));
        ids.addAll(queryLongs("SELECT guest_user_id FROM guest_orders WHERE company_id = ?", companyId));
        ids.addAll(queryLongs("SELECT guest_user_id FROM guest_notifications WHERE company_id = ?", companyId));
        ids.addAll(queryLongs("SELECT guest_user_id FROM client_messages WHERE company_id = ? AND guest_user_id IS NOT NULL", companyId));
        ids.addAll(queryLongs("SELECT guest_user_id FROM booking_push_reminders WHERE company_id = ?", companyId));
        ids.addAll(queryLongs("SELECT guest_user_id FROM waitlist_requests WHERE company_id = ? AND guest_user_id IS NOT NULL", companyId));
        ids.addAll(queryLongs("SELECT uploaded_by_guest_user_id FROM client_files WHERE owner_company_id = ? AND uploaded_by_guest_user_id IS NOT NULL", companyId));
        ids.addAll(queryLongs("SELECT guest_user_id FROM message_delivery_logs WHERE company_id = ? AND guest_user_id IS NOT NULL", companyId));
        return ids;
    }

    private Set<Long> collectLoginAccountCandidates(long companyId) {
        return new LinkedHashSet<>(queryLongs(
                "SELECT DISTINCT login_account_id FROM users WHERE company_id = ? AND login_account_id IS NOT NULL",
                companyId));
    }

    private void purgePlatformSubscriptionLinkage(long companyId, ExternalDeletionPlan external) {
        String subscriptionReference = PLATFORM_SUBSCRIPTION_REFERENCE_PREFIX + companyId;

        // Platform Admin invoices and file attachments live under the Platform Admin S3 prefix rather than the
        // deleted tenant prefix, so remember their exact keys before removing the database rows.
        external.s3ObjectKeys().addAll(queryStrings(
                """
                SELECT DISTINCT b.invoice_pdf_object_key
                  FROM bills b
                 WHERE b.invoice_pdf_object_key IS NOT NULL
                   AND btrim(b.invoice_pdf_object_key) <> ''
                   AND (
                        b.client_id IN (
                            SELECT c.id
                              FROM clients c
                             WHERE c.billing_company_id IN (
                                   SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                             )
                        )
                        OR b.recipient_company_id_snapshot IN (
                            SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                        )
                   )
                """,
                companyId,
                companyId));
        external.s3ObjectKeys().addAll(queryStrings(
                """
                SELECT cf.s3_object_key
                  FROM client_files cf
                 WHERE cf.client_id IN (
                       SELECT c.id
                         FROM clients c
                        WHERE c.billing_company_id IN (
                              SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                        )
                 )
                """,
                companyId));
        external.s3ObjectKeys().addAll(queryStrings(
                """
                SELECT f.s3_object_key
                  FROM company_files f
                 WHERE f.company_id IN (
                       SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                 )
                """,
                companyId));
        external.platformWorkspaceIds().addAll(queryLongs(
                """
                SELECT DISTINCT wc.workspace_id
                  FROM clients c
                  JOIN workspace_clients wc ON wc.id = c.workspace_client_id
                 WHERE c.billing_company_id IN (
                       SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                 )
                   AND c.workspace_client_id IS NOT NULL
                """,
                companyId));

        // Open subscription bill(s).
        exec(
                """
                DELETE FROM advance_allocations
                 WHERE open_bill_id IN (
                       SELECT id FROM open_bills
                        WHERE reference = ?
                           OR batch_target_company_id IN (
                               SELECT id FROM client_companies WHERE platform_tenant_company_id = ?
                           )
                 )
                """,
                subscriptionReference,
                companyId);
        exec(
                """
                DELETE FROM open_bill_payments
                 WHERE open_bill_id IN (
                       SELECT id FROM open_bills
                        WHERE reference = ?
                           OR batch_target_company_id IN (
                               SELECT id FROM client_companies WHERE platform_tenant_company_id = ?
                           )
                 )
                """,
                subscriptionReference,
                companyId);
        exec(
                """
                DELETE FROM open_bill_items
                 WHERE open_bill_id IN (
                       SELECT id FROM open_bills
                        WHERE reference = ?
                           OR batch_target_company_id IN (
                               SELECT id FROM client_companies WHERE platform_tenant_company_id = ?
                           )
                 )
                """,
                subscriptionReference,
                companyId);
        exec(
                """
                DELETE FROM open_bills
                 WHERE reference = ?
                    OR batch_target_company_id IN (
                        SELECT id FROM client_companies WHERE platform_tenant_company_id = ?
                    )
                """,
                subscriptionReference,
                companyId);

        // Issued Platform Admin invoices for the tenant payee.
        exec(
                """
                DELETE FROM advance_allocations
                 WHERE advance_bill_id IN (
                       SELECT b.id FROM bills b
                        WHERE b.client_id IN (
                              SELECT c.id FROM clients c
                               WHERE c.billing_company_id IN (
                                     SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                               )
                        )
                           OR b.recipient_company_id_snapshot IN (
                              SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                           )
                 )
                """,
                companyId,
                companyId);
        exec(
                """
                DELETE FROM bill_payments
                 WHERE bill_id IN (
                       SELECT b.id FROM bills b
                        WHERE b.client_id IN (
                              SELECT c.id FROM clients c
                               WHERE c.billing_company_id IN (
                                     SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                               )
                        )
                           OR b.recipient_company_id_snapshot IN (
                              SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                           )
                 )
                """,
                companyId,
                companyId);
        exec(
                """
                DELETE FROM bill_item
                 WHERE bill_id IN (
                       SELECT b.id FROM bills b
                        WHERE b.client_id IN (
                              SELECT c.id FROM clients c
                               WHERE c.billing_company_id IN (
                                     SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                               )
                        )
                           OR b.recipient_company_id_snapshot IN (
                              SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                           )
                 )
                """,
                companyId,
                companyId);
        exec(
                """
                DELETE FROM bills
                 WHERE client_id IN (
                       SELECT c.id FROM clients c
                        WHERE c.billing_company_id IN (
                              SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                        )
                 )
                    OR recipient_company_id_snapshot IN (
                       SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                    )
                """,
                companyId,
                companyId);

        // Remove the dedicated Platform Admin payee client and its auxiliary data.
        exec(
                """
                DELETE FROM client_message_attachments
                 WHERE message_id IN (
                       SELECT m.id FROM client_messages m
                        WHERE m.client_id IN (
                              SELECT c.id FROM clients c
                               WHERE c.billing_company_id IN (
                                     SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                               )
                        )
                 )
                    OR client_file_id IN (
                       SELECT f.id FROM client_files f
                        WHERE f.client_id IN (
                              SELECT c.id FROM clients c
                               WHERE c.billing_company_id IN (
                                     SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?
                               )
                        )
                 )
                """,
                companyId,
                companyId);
        exec(
                "DELETE FROM scheduled_messages WHERE client_id IN (SELECT c.id FROM clients c WHERE c.billing_company_id IN (SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?))",
                companyId);
        exec(
                "DELETE FROM client_messages WHERE client_id IN (SELECT c.id FROM clients c WHERE c.billing_company_id IN (SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?))",
                companyId);
        exec(
                "DELETE FROM preferred_slot WHERE client_id IN (SELECT c.id FROM clients c WHERE c.billing_company_id IN (SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?))",
                companyId);
        exec(
                "DELETE FROM client_assigned_users WHERE client_id IN (SELECT c.id FROM clients c WHERE c.billing_company_id IN (SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?))",
                companyId);
        exec(
                "DELETE FROM client_assigned_locations WHERE client_id IN (SELECT c.id FROM clients c WHERE c.billing_company_id IN (SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?))",
                companyId);
        exec(
                "DELETE FROM client_group_members WHERE client_id IN (SELECT c.id FROM clients c WHERE c.billing_company_id IN (SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?))",
                companyId);
        exec(
                "DELETE FROM client_files WHERE client_id IN (SELECT c.id FROM clients c WHERE c.billing_company_id IN (SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?))",
                companyId);
        exec(
                "DELETE FROM company_files WHERE company_id IN (SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?)",
                companyId);
        exec(
                "DELETE FROM clients WHERE billing_company_id IN (SELECT cc.id FROM client_companies cc WHERE cc.platform_tenant_company_id = ?)",
                companyId);
        exec("DELETE FROM client_companies WHERE platform_tenant_company_id = ?", companyId);
        for (Long platformWorkspaceId : external.platformWorkspaceIds()) {
            if (platformWorkspaceId != null && platformWorkspaceId > 0) {
                purgeOrphanWorkspaceClients(platformWorkspaceId);
            }
        }
    }

    private void purgeCompanyData(long companyId, Long workspaceId, Long survivingCompanyId) {
        // Workspace audit rows that directly expose this company must go before the company FK is removed.
        exec("DELETE FROM configuration_copy_audit_log WHERE source_company_id = ? OR target_company_id = ?", companyId, companyId);
        exec(
                "DELETE FROM workspace_service_audit_log WHERE actor_company_id = ? OR session_type_id IN (SELECT id FROM session_type WHERE company_id = ?)",
                companyId,
                companyId);
        exec(
                "DELETE FROM workspace_client_audit_log WHERE actor_company_id = ? OR client_id IN (SELECT id FROM clients WHERE company_id = ?)",
                companyId,
                companyId);
        exec("DELETE FROM activity_logs WHERE company_id = ?", companyId);
        exec("DELETE FROM workspace_subscription_legacy_sources WHERE company_id = ?", companyId);
        exec("DELETE FROM workspace_usage_events WHERE company_id = ?", companyId);
        exec("DELETE FROM workspace_usage_monthly WHERE company_id = ?", companyId);
        exec("UPDATE login_accounts SET last_selected_company_id = NULL WHERE last_selected_company_id = ?", companyId);

        if (survivingCompanyId != null) {
            exec(
                    "UPDATE workspace_subscriptions SET legacy_primary_company_id = ? WHERE legacy_primary_company_id = ?",
                    survivingCompanyId,
                    companyId);
        } else {
            exec("UPDATE workspace_subscriptions SET legacy_primary_company_id = NULL WHERE legacy_primary_company_id = ?", companyId);
        }

        // Messaging, notifications and integration jobs.
        exec("DELETE FROM tenant_notifications WHERE company_id = ?", companyId);
        exec("DELETE FROM message_delivery_logs WHERE company_id = ?", companyId);
        exec("DELETE FROM scheduled_messages WHERE company_id = ?", companyId);
        exec(
                "DELETE FROM client_message_attachments WHERE message_id IN (SELECT id FROM client_messages WHERE company_id = ?)",
                companyId);
        exec("DELETE FROM client_messages WHERE company_id = ?", companyId);
        exec("DELETE FROM google_calendar_event_links WHERE company_id = ?", companyId);
        exec("DELETE FROM google_calendar_sync_jobs WHERE company_id = ?", companyId);
        exec("DELETE FROM google_calendar_connections WHERE company_id = ?", companyId);

        // Billing and commerce. Delete usage/line rows before their parent bills/products/services.
        exec("DELETE FROM advance_allocations WHERE company_id = ?", companyId);
        exec("DELETE FROM open_bill_payments WHERE open_bill_id IN (SELECT id FROM open_bills WHERE company_id = ?)", companyId);
        exec("DELETE FROM open_bill_items WHERE open_bill_id IN (SELECT id FROM open_bills WHERE company_id = ?)", companyId);
        exec("DELETE FROM open_bills WHERE company_id = ?", companyId);

        exec("DELETE FROM guest_entitlement_usages WHERE entitlement_id IN (SELECT id FROM guest_entitlements WHERE company_id = ?) OR session_booking_id IN (SELECT id FROM session_booking WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM course_access_progress WHERE entitlement_id IN (SELECT id FROM guest_entitlements WHERE company_id = ?) OR course_id IN (SELECT id FROM courses WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM membership_courses WHERE company_id = ?", companyId);
        exec("DELETE FROM guest_order_items WHERE order_id IN (SELECT id FROM guest_orders WHERE company_id = ?) OR product_id IN (SELECT id FROM guest_products WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM guest_entitlement_locations WHERE entitlement_id IN (SELECT id FROM guest_entitlements WHERE company_id = ?) OR location_id IN (SELECT id FROM locations WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM guest_entitlements WHERE company_id = ?", companyId);
        exec("DELETE FROM guest_orders WHERE company_id = ?", companyId);
        exec("DELETE FROM guest_notifications WHERE company_id = ?", companyId);
        exec("DELETE FROM guest_tenant_links WHERE company_id = ?", companyId);
        exec("DELETE FROM guest_product_voucher_session_types WHERE product_id IN (SELECT id FROM guest_products WHERE company_id = ?) OR session_type_id IN (SELECT id FROM session_type WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM guest_product_session_types WHERE product_id IN (SELECT id FROM guest_products WHERE company_id = ?) OR session_type_id IN (SELECT id FROM session_type WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM guest_product_locations WHERE product_id IN (SELECT id FROM guest_products WHERE company_id = ?) OR location_id IN (SELECT id FROM locations WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM courses WHERE company_id = ?", companyId);
        exec("DELETE FROM guest_products WHERE company_id = ?", companyId);
        exec("DELETE FROM tenant_invites WHERE company_id = ?", companyId);

        exec("DELETE FROM bill_payments WHERE bill_id IN (SELECT id FROM bills WHERE company_id = ?)", companyId);
        exec("DELETE FROM bill_item WHERE bill_id IN (SELECT id FROM bills WHERE company_id = ?)", companyId);
        exec("DELETE FROM bills WHERE company_id = ?", companyId);

        // Waitlist and booking adjuncts.
        exec("DELETE FROM waitlist_events WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_slot_skips WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_booking_holds WHERE company_id = ?", companyId);
        exec("DELETE FROM waitlist_offers WHERE company_id = ?", companyId);
        exec("DELETE FROM waitlist_request_services WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_request_employees WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_request_windows WHERE waitlist_request_id IN (SELECT id FROM waitlist_requests WHERE company_id = ?)", companyId);
        exec("DELETE FROM waitlist_requests WHERE company_id = ?", companyId);
        exec("DELETE FROM booking_slot_holds WHERE company_id = ?", companyId);
        exec("DELETE FROM booking_push_reminders WHERE company_id = ?", companyId);
        exec("DELETE FROM public_booking_manage_tokens WHERE company_id = ?", companyId);
        exec("DELETE FROM open_bill_sync_queue WHERE company_id = ?", companyId);
        exec("DELETE FROM widget_booking_idempotency WHERE company_id = ?", companyId);

        // Session/inventory joins must disappear before sessions, services, rooms, users and locations.
        exec("DELETE FROM session_consumable WHERE company_id = ?", companyId);
        exec("DELETE FROM service_type_consumable WHERE company_id = ?", companyId);
        exec("DELETE FROM consumable_location_stock WHERE company_id = ?", companyId);
        exec("DELETE FROM consumable_stock_movement WHERE company_id = ?", companyId);
        exec("DELETE FROM consumable_purchase_order WHERE company_id = ?", companyId);
        exec("DELETE FROM consumable_supplier WHERE company_id = ?", companyId);
        exec("DELETE FROM consumable WHERE company_id = ?", companyId);
        exec("DELETE FROM consumable_category WHERE company_id = ?", companyId);

        exec("DELETE FROM session_service WHERE session_booking_id IN (SELECT id FROM session_booking WHERE company_id = ?) OR session_type_id IN (SELECT id FROM session_type WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM session_type_locations WHERE session_type_id IN (SELECT id FROM session_type WHERE company_id = ?) OR location_id IN (SELECT id FROM locations WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM user_locations WHERE user_id IN (SELECT id FROM users WHERE company_id = ?) OR location_id IN (SELECT id FROM locations WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM user_spaces WHERE user_id IN (SELECT id FROM users WHERE company_id = ?) OR space_id IN (SELECT id FROM space WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM user_types WHERE user_id IN (SELECT id FROM users WHERE company_id = ?) OR type_id IN (SELECT id FROM session_type WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM type_transaction_services WHERE session_type_id IN (SELECT id FROM session_type WHERE company_id = ?) OR transaction_service_id IN (SELECT id FROM transaction_service WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM payment_method_locations WHERE payment_method_id IN (SELECT id FROM payment_methods WHERE company_id = ?) OR location_id IN (SELECT id FROM locations WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM location_setting_overrides WHERE company_id = ?", companyId);
        exec("DELETE FROM session_type_location_prices WHERE company_id = ?", companyId);

        exec("DELETE FROM session_booking WHERE company_id = ?", companyId);
        exec("DELETE FROM bookable_slot WHERE company_id = ?", companyId);
        exec("DELETE FROM calendar_todo_visible_users WHERE todo_id IN (SELECT id FROM calendar_todos WHERE company_id = ?) OR user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM calendar_todos WHERE company_id = ?", companyId);
        exec("DELETE FROM personal_calendar_block WHERE company_id = ?", companyId);

        // CRM and files.
        exec("DELETE FROM client_message_attachments WHERE message_id IN (SELECT id FROM client_messages WHERE company_id = ?) OR client_file_id IN (SELECT id FROM client_files WHERE owner_company_id = ?)", companyId, companyId);
        exec("DELETE FROM client_assigned_users WHERE client_id IN (SELECT id FROM clients WHERE company_id = ?) OR user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM client_assigned_locations WHERE client_id IN (SELECT id FROM clients WHERE company_id = ?) OR location_id IN (SELECT id FROM locations WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM client_company_assigned_locations WHERE client_company_id IN (SELECT id FROM client_companies WHERE owner_company_id = ?) OR location_id IN (SELECT id FROM locations WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM client_group_assigned_locations WHERE group_id IN (SELECT id FROM client_groups WHERE company_id = ?) OR location_id IN (SELECT id FROM locations WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM client_group_members WHERE group_id IN (SELECT id FROM client_groups WHERE company_id = ?) OR client_id IN (SELECT id FROM clients WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM preferred_slot WHERE client_id IN (SELECT id FROM clients WHERE company_id = ?)", companyId);
        exec("DELETE FROM custom_field_values WHERE company_id = ?", companyId);
        exec("DELETE FROM custom_field_definitions WHERE company_id = ?", companyId);
        exec("DELETE FROM client_files WHERE owner_company_id = ? OR client_id IN (SELECT id FROM clients WHERE company_id = ?)", companyId, companyId);
        exec("DELETE FROM company_files WHERE owner_company_id = ? OR company_id IN (SELECT id FROM client_companies WHERE owner_company_id = ?)", companyId, companyId);
        exec("DELETE FROM client_groups WHERE company_id = ?", companyId);
        exec("DELETE FROM clients WHERE company_id = ?", companyId);
        exec("DELETE FROM client_companies WHERE owner_company_id = ?", companyId);

        // Fiscal/legal/configuration. Company-specific invoice series must go before locations.
        exec("DELETE FROM fiscal_certificates WHERE company_id = ?", companyId);
        exec("DELETE FROM company_legal_entities WHERE company_id = ?", companyId);
        exec("DELETE FROM invoice_series WHERE company_id = ?", companyId);

        // Catalog.
        exec("DELETE FROM session_type WHERE company_id = ?", companyId);
        exec("DELETE FROM service_group WHERE company_id = ?", companyId);
        exec("DELETE FROM transaction_service WHERE company_id = ?", companyId);
        exec("DELETE FROM payment_methods WHERE company_id = ?", companyId);
        exec("DELETE FROM space WHERE company_id = ?", companyId);

        // Shared workspace service templates cannot keep an FK to the deleted unit. If another unit survives, transfer
        // ownership; if this was the last unit, the workspace cleanup below removes the templates completely.
        if (survivingCompanyId != null) {
            exec("UPDATE workspace_service_templates SET owner_company_id = ? WHERE owner_company_id = ?", survivingCompanyId, companyId);
        } else if (workspaceId != null) {
            exec("DELETE FROM workspace_service_audit_log WHERE workspace_id = ?", workspaceId);
            exec("DELETE FROM workspace_service_templates WHERE workspace_id = ?", workspaceId);
        }

        // Location rows can now disappear safely.
        exec("DELETE FROM locations WHERE company_id = ?", companyId);

        // Referrals and user/security records.
        exec("DELETE FROM referral_codes WHERE company_id = ?", companyId);
        exec("DELETE FROM referrals WHERE referrer_company_id = ? OR referred_company_id = ?", companyId, companyId);
        purgeUsersForCompany(companyId);
        exec("DELETE FROM employee_access_roles WHERE company_id = ?", companyId);
        exec("DELETE FROM app_settings WHERE company_id = ?", companyId);

        // Platform audit trail for this tenant is tenant data too.
        exec("DELETE FROM platform_tenancy_admin_audit_logs WHERE company_id = ?", companyId);

        // Remove workspace client identities that became truly unreferenced after this unit's clients were purged.
        if (workspaceId != null) {
            purgeOrphanWorkspaceClients(workspaceId);
        }
    }

    private void purgeUsersForCompany(long companyId) {
        exec("DELETE FROM platform_announcement_reads WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId);
        exec("DELETE FROM security_activity_events WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId);
        exec("DELETE FROM security_alert_preferences WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId);
        exec("DELETE FROM user_security_sessions WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId);
        exec("DELETE FROM webauthn_credentials WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId);
        exec("DELETE FROM recovery_codes WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId);
        exec("DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId);
        exec("DELETE FROM google_oauth_tokens WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId);
        exec("DELETE FROM zoom_oauth_tokens WHERE user_id IN (SELECT id FROM users WHERE company_id = ?)", companyId);
        exec("DELETE FROM users WHERE company_id = ?", companyId);
    }

    private void purgeOrphanGuestUsers(Set<Long> candidates, ExternalDeletionPlan external) {
        for (Long guestUserId : candidates) {
            if (guestUserId == null || guestUserId <= 0 || hasSurvivingGuestReference(guestUserId)) {
                continue;
            }
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT email, profile_picture_s3_key FROM guest_users WHERE id = ?",
                    guestUserId);
            if (rows.isEmpty()) {
                continue;
            }
            String email = stringValue(rows.getFirst().get("email"));
            String profileKey = stringValue(rows.getFirst().get("profile_picture_s3_key"));
            if (profileKey != null) {
                external.s3ObjectKeys().add(profileKey);
            }
            if (email != null) {
                external.deletedIdentityEmails().add(email.toLowerCase());
            }
            exec("DELETE FROM guest_password_reset_tokens WHERE guest_user_id = ?", guestUserId);
            exec("DELETE FROM guest_device_tokens WHERE guest_user_id = ?", guestUserId);
            exec("DELETE FROM guest_users WHERE id = ?", guestUserId);
        }
    }

    private boolean hasSurvivingGuestReference(long guestUserId) {
        Integer count = jdbc.queryForObject(
                """
                SELECT
                    (SELECT COUNT(*) FROM guest_tenant_links WHERE guest_user_id = ?) +
                    (SELECT COUNT(*) FROM guest_orders WHERE guest_user_id = ?) +
                    (SELECT COUNT(*) FROM guest_notifications WHERE guest_user_id = ?) +
                    (SELECT COUNT(*) FROM client_messages WHERE guest_user_id = ?) +
                    (SELECT COUNT(*) FROM booking_push_reminders WHERE guest_user_id = ?) +
                    (SELECT COUNT(*) FROM waitlist_requests WHERE guest_user_id = ?) +
                    (SELECT COUNT(*) FROM client_files WHERE uploaded_by_guest_user_id = ?) +
                    (SELECT COUNT(*) FROM message_delivery_logs WHERE guest_user_id = ?)
                """,
                Integer.class,
                guestUserId,
                guestUserId,
                guestUserId,
                guestUserId,
                guestUserId,
                guestUserId,
                guestUserId,
                guestUserId);
        return count != null && count > 0;
    }

    private void purgeOrphanLoginAccounts(Set<Long> candidates, Set<String> deletedIdentityEmails) {
        for (Long loginAccountId : candidates) {
            if (loginAccountId == null || loginAccountId <= 0) {
                continue;
            }
            Integer memberships = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM users WHERE login_account_id = ?",
                    Integer.class,
                    loginAccountId);
            if (memberships != null && memberships > 0) {
                continue;
            }
            List<String> emails = queryStrings("SELECT email FROM login_accounts WHERE id = ?", loginAccountId);
            if (!emails.isEmpty() && emails.getFirst() != null) {
                deletedIdentityEmails.add(emails.getFirst().trim().toLowerCase());
            }
            exec("DELETE FROM user_security_sessions WHERE login_account_id = ?", loginAccountId);
            exec("DELETE FROM login_accounts WHERE id = ?", loginAccountId);
        }
    }

    private void purgeSignupIntentsForDeletedIdentities(Set<String> emails) {
        for (String email : emails) {
            if (email == null || email.isBlank()) {
                continue;
            }
            Integer survivingIdentityCount = jdbc.queryForObject(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM login_accounts WHERE lower(email) = lower(?)) +
                        (SELECT COUNT(*) FROM guest_users WHERE lower(email) = lower(?))
                    """,
                    Integer.class,
                    email,
                    email);
            if (survivingIdentityCount == null || survivingIdentityCount == 0) {
                exec("DELETE FROM signup_email_intents WHERE lower(email) = lower(?)", email);
            }
        }
    }

    private void purgeOrphanWorkspaceClients(long workspaceId) {
        // A workspace identity is live when a surviving client references it directly or when it is the canonical
        // merge target reachable from such an identity. Everything else is orphaned and may still contain the
        // deleted tenant's PII, so remove it rather than retaining dead merge chains.
        String liveCte = """
                WITH RECURSIVE live_workspace_clients(id) AS (
                    SELECT DISTINCT c.workspace_client_id
                      FROM clients c
                      JOIN workspace_clients wc ON wc.id = c.workspace_client_id
                     WHERE wc.workspace_id = ?
                       AND c.workspace_client_id IS NOT NULL
                    UNION
                    SELECT wc.merged_into_id
                      FROM workspace_clients wc
                      JOIN live_workspace_clients live ON live.id = wc.id
                     WHERE wc.workspace_id = ?
                       AND wc.merged_into_id IS NOT NULL
                )
                """;

        exec(
                liveCte + """
                DELETE FROM workspace_client_duplicate_candidates d
                 WHERE d.workspace_id = ?
                   AND (
                       NOT EXISTS (SELECT 1 FROM live_workspace_clients live WHERE live.id = d.left_workspace_client_id)
                       OR NOT EXISTS (SELECT 1 FROM live_workspace_clients live WHERE live.id = d.right_workspace_client_id)
                   )
                """,
                workspaceId,
                workspaceId,
                workspaceId);
        exec(
                liveCte + """
                DELETE FROM workspace_client_audit_log a
                 WHERE a.workspace_id = ?
                   AND (
                       (a.workspace_client_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM live_workspace_clients live WHERE live.id = a.workspace_client_id))
                       OR (a.related_workspace_client_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM live_workspace_clients live WHERE live.id = a.related_workspace_client_id))
                   )
                """,
                workspaceId,
                workspaceId,
                workspaceId);
        exec(
                liveCte + """
                UPDATE workspace_clients wc
                   SET merged_into_id = NULL
                 WHERE wc.workspace_id = ?
                   AND NOT EXISTS (SELECT 1 FROM live_workspace_clients live WHERE live.id = wc.id)
                """,
                workspaceId,
                workspaceId,
                workspaceId);
        exec(
                liveCte + """
                DELETE FROM workspace_clients wc
                 WHERE wc.workspace_id = ?
                   AND NOT EXISTS (SELECT 1 FROM live_workspace_clients live WHERE live.id = wc.id)
                """,
                workspaceId,
                workspaceId,
                workspaceId);
    }

    private void purgeWorkspaceData(long workspaceId) {
        // No sibling company survives. All workspace-shared data therefore belongs exclusively to the tenant being
        // deleted and is removed before external storage deletion begins.
        exec("DELETE FROM workspace_client_duplicate_candidates WHERE workspace_id = ?", workspaceId);
        exec("DELETE FROM workspace_client_audit_log WHERE workspace_id = ?", workspaceId);
        exec("UPDATE workspace_clients SET merged_into_id = NULL WHERE workspace_id = ?", workspaceId);
        exec("DELETE FROM workspace_clients WHERE workspace_id = ?", workspaceId);

        exec("DELETE FROM workspace_service_audit_log WHERE workspace_id = ?", workspaceId);
        exec("DELETE FROM configuration_copy_audit_log WHERE workspace_id = ?", workspaceId);
        exec("DELETE FROM workspace_service_templates WHERE workspace_id = ?", workspaceId);

        exec("DELETE FROM workspace_subscription_audit_log WHERE workspace_subscription_id IN (SELECT id FROM workspace_subscriptions WHERE workspace_id = ?)", workspaceId);
        exec("DELETE FROM workspace_subscription_legacy_sources WHERE workspace_subscription_id IN (SELECT id FROM workspace_subscriptions WHERE workspace_id = ?)", workspaceId);
        exec("DELETE FROM workspace_usage_events WHERE workspace_id = ?", workspaceId);
        exec("DELETE FROM workspace_usage_monthly WHERE workspace_id = ?", workspaceId);
        exec("DELETE FROM workspace_subscriptions WHERE workspace_id = ?", workspaceId);
        exec("DELETE FROM workspace_public_booking_settings WHERE workspace_id = ?", workspaceId);
        exec("DELETE FROM activity_logs WHERE workspace_id = ?", workspaceId);

        exec("DELETE FROM invoice_series WHERE workspace_id = ?", workspaceId);
        exec("DELETE FROM legal_entities WHERE workspace_id = ?", workspaceId);
    }

    private void assertNoCompanyReferences(long companyId) {
        List<Map<String, Object>> columns = new ArrayList<>(jdbc.queryForList(
                """
                SELECT c.table_name, c.column_name
                  FROM information_schema.columns c
                  JOIN information_schema.tables t
                    ON t.table_schema = c.table_schema
                   AND t.table_name = c.table_name
                 WHERE c.table_schema = current_schema()
                   AND t.table_type = 'BASE TABLE'
                """));
        // Also inspect the actual PostgreSQL FK graph so a future migration cannot hide a company reference behind
        // a differently-named column. The semantic column scan above additionally catches legacy/non-FK references.
        List<Map<String, Object>> foreignKeyColumns = jdbc.queryForList(
                """
                SELECT child.relname AS table_name, child_col.attname AS column_name
                  FROM pg_constraint con
                  JOIN pg_class child ON child.oid = con.conrelid
                  JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
                  JOIN pg_class parent ON parent.oid = con.confrelid
                  JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON TRUE
                  JOIN pg_attribute child_col ON child_col.attrelid = child.oid AND child_col.attnum = ck.attnum
                 WHERE con.contype = 'f'
                   AND child_ns.nspname = current_schema()
                   AND parent.relname = 'company'
                """);
        columns.addAll(foreignKeyColumns);
        Set<String> actualForeignKeys = new LinkedHashSet<>();
        for (Map<String, Object> row : foreignKeyColumns) {
            String table = stringValue(row.get("table_name"));
            String column = stringValue(row.get("column_name"));
            if (table != null && column != null) {
                actualForeignKeys.add(table + "." + column);
            }
        }

        List<String> leftovers = new ArrayList<>();
        Set<String> checked = new LinkedHashSet<>();
        for (Map<String, Object> row : columns) {
            String table = stringValue(row.get("table_name"));
            String column = stringValue(row.get("column_name"));
            if (table == null || column == null || !safeIdentifier(table) || !safeIdentifier(column)) {
                continue;
            }
            String key = table + "." + column;
            if (!COMPANY_REFERENCE_COLUMNS.contains(column) && !actualForeignKeys.contains(key)) {
                continue;
            }
            if (!checked.add(key)) {
                continue;
            }
            Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM \"" + table + "\" WHERE \"" + column + "\" = ?",
                    Integer.class,
                    companyId);
            if (count != null && count > 0) {
                leftovers.add(key + "=" + count);
            }
        }
        if (!leftovers.isEmpty()) {
            throw new IllegalStateException("Tenant purge left company references: " + String.join(", ", leftovers));
        }
    }

    private void assertNoWorkspaceReferences(long workspaceId, long allowedCompanyId) {
        List<Map<String, Object>> references = new ArrayList<>(jdbc.queryForList(
                """
                SELECT DISTINCT c.table_name, c.column_name
                  FROM information_schema.columns c
                  JOIN information_schema.tables t
                    ON t.table_schema = c.table_schema
                   AND t.table_name = c.table_name
                 WHERE c.table_schema = current_schema()
                   AND t.table_type = 'BASE TABLE'
                   AND c.column_name = 'workspace_id'
                """));
        references.addAll(jdbc.queryForList(
                """
                SELECT child.relname AS table_name, child_col.attname AS column_name
                  FROM pg_constraint con
                  JOIN pg_class child ON child.oid = con.conrelid
                  JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
                  JOIN pg_class parent ON parent.oid = con.confrelid
                  JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON TRUE
                  JOIN pg_attribute child_col ON child_col.attrelid = child.oid AND child_col.attnum = ck.attnum
                 WHERE con.contype = 'f'
                   AND child_ns.nspname = current_schema()
                   AND parent.relname = 'workspaces'
                """));

        List<String> leftovers = new ArrayList<>();
        Set<String> checked = new LinkedHashSet<>();
        for (Map<String, Object> row : references) {
            String table = stringValue(row.get("table_name"));
            String column = stringValue(row.get("column_name"));
            if (table == null || column == null || "workspaces".equals(table)
                    || !safeIdentifier(table) || !safeIdentifier(column)) {
                continue;
            }
            String key = table + "." + column;
            if (!checked.add(key)) {
                continue;
            }
            Integer count;
            if ("company".equals(table) && "workspace_id".equals(column)) {
                count = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM company WHERE workspace_id = ? AND id <> ?",
                        Integer.class,
                        workspaceId,
                        allowedCompanyId);
            } else {
                count = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM \"" + table + "\" WHERE \"" + column + "\" = ?",
                        Integer.class,
                        workspaceId);
            }
            if (count != null && count > 0) {
                leftovers.add(key + "=" + count);
            }
        }
        Integer targetCompanyCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM company WHERE id = ? AND workspace_id = ?",
                Integer.class,
                allowedCompanyId,
                workspaceId);
        if (targetCompanyCount == null || targetCompanyCount != 1) {
            leftovers.add("company.workspace_id(target)=" + (targetCompanyCount == null ? 0 : targetCompanyCount));
        }
        if (!leftovers.isEmpty()) {
            throw new IllegalStateException("Tenant purge left workspace references: " + String.join(", ", leftovers));
        }
    }

    private void purgeExternalAssets(Company company, ExternalDeletionPlan plan) {
        try {
            for (CourseMedia media : plan.courseMedia()) {
                bunnyMediaService.deleteVideoMedia(media.libraryId(), media.libraryName(), media.videoId());
                bunnyMediaService.deleteAudioMedia(media.storagePath());
            }
            for (String libraryId : plan.bunnyLibraryIds()) {
                bunnyMediaService.deleteVideoLibrary(libraryId);
            }
            for (String objectKey : plan.s3ObjectKeys()) {
                fileStorage.deletePermanently(objectKey);
            }
            // Prefix purge is the final catch-all for settings-backed guest-app assets and any future tenant files that
            // use the canonical tenant prefix but have no dedicated DB column yet.
            fileStorage.deleteTenantDataPermanently(company);
        } catch (RuntimeException ex) {
            log.warn("Permanent external asset deletion failed for tenant {}", company.getId(), ex);
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "Tenant files or course media could not be deleted completely. No database deletion was committed; fix external storage access and retry.",
                    ex);
        }
    }

    private List<Long> queryLongs(String sql, Object... args) {
        return jdbc.query(sql, (rs, rowNum) -> rs.getLong(1), args);
    }

    private List<String> queryStrings(String sql, Object... args) {
        return jdbc.query(sql, (rs, rowNum) -> rs.getString(1), args).stream()
                .filter(value -> value != null && !value.isBlank())
                .toList();
    }

    private static String stringValue(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isBlank() ? null : text;
    }

    private static boolean safeIdentifier(String identifier) {
        return identifier != null && identifier.matches("[A-Za-z0-9_]+");
    }

    private void exec(String sql, Object... args) {
        jdbc.update(sql, args);
    }

    private record CourseMedia(String libraryId, String libraryName, String videoId, String storagePath) {}

    private static final class ExternalDeletionPlan {
        private final Set<String> s3ObjectKeys = new LinkedHashSet<>();
        private final List<CourseMedia> courseMedia = new ArrayList<>();
        private final Set<String> bunnyLibraryIds = new LinkedHashSet<>();
        private final Set<Long> platformWorkspaceIds = new LinkedHashSet<>();
        private final Set<String> deletedIdentityEmails = new LinkedHashSet<>();

        Set<String> s3ObjectKeys() {
            return s3ObjectKeys;
        }

        List<CourseMedia> courseMedia() {
            return courseMedia;
        }

        Set<String> bunnyLibraryIds() {
            return bunnyLibraryIds;
        }

        Set<Long> platformWorkspaceIds() {
            return platformWorkspaceIds;
        }

        Set<String> deletedIdentityEmails() {
            return deletedIdentityEmails;
        }
    }
}
