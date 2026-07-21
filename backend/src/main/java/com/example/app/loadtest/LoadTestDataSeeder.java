package com.example.app.loadtest;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Staging-only data generator used by k6 production-readiness load tests.
 *
 * This component is intentionally inactive in normal dev/staging/prod profiles. To run it, start the
 * backend with profile "loadtest-seed" and app.loadtest.seed.enabled=true. It creates disposable
 * tenants whose tenant_code starts with "lt-" and disposable guests whose email ends with
 * @loadtest.local.
 */
@Component
@Profile("loadtest-seed")
public class LoadTestDataSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(LoadTestDataSeeder.class);
    private static final String PREFIX = "lt-";
    private static final String DOMAIN = "loadtest.local";
    private static final String WORKING_HOURS_JSON = "{\"sameForAllDays\":true,\"allDays\":{\"start\":\"08:00\",\"end\":\"20:00\"}}";

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.loadtest.seed.enabled:false}")
    private boolean enabled;

    @Value("${app.loadtest.seed.reset:false}")
    private boolean reset;

    @Value("${app.loadtest.seed.tenants:1000}")
    private int requestedTenants;

    @Value("${app.loadtest.seed.guests:10000}")
    private int requestedGuests;

    @Value("${app.loadtest.seed.bookings:50000}")
    private int requestedBookings;

    @Value("${app.loadtest.seed.orders:10000}")
    private int requestedOrders;

    @Value("${app.loadtest.seed.delivery-logs:100000}")
    private int requestedDeliveryLogs;

    @Value("${app.loadtest.seed.inbox-messages:50000}")
    private int requestedInboxMessages;

    @Value("${app.loadtest.seed.password:LoadTest123!}")
    private String password;

    public LoadTestDataSeeder(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (!enabled) {
            log.info("Load-test seeder profile is active, but app.loadtest.seed.enabled=false; skipping.");
            return;
        }

        int tenantCount = clamp(requestedTenants, 1, 20_000);
        int guestCount = clamp(requestedGuests, tenantCount, 500_000);
        int bookingCount = clamp(requestedBookings, 0, 2_000_000);
        int orderCount = clamp(requestedOrders, 0, 2_000_000);
        int deliveryLogCount = clamp(requestedDeliveryLogs, 0, 5_000_000);
        int inboxMessageCount = clamp(requestedInboxMessages, 0, 2_000_000);

        if (reset) {
            resetSeededData();
        }

        int existingTenants = count("select count(*) from company where tenant_code like 'lt-%'");
        if (existingTenants >= tenantCount && !reset) {
            log.info("Load-test data already appears to be seeded: {} tenants found; requested {}. Skipping. Use app.loadtest.seed.reset=true to rebuild.", existingTenants, tenantCount);
            return;
        }

        String encodedPassword = passwordEncoder.encode(password);
        List<TenantSeed> tenants = seedTenants(tenantCount, encodedPassword);
        List<GuestSeed> guests = seedGuestsAndClients(tenants, guestCount, encodedPassword);
        seedBookings(tenants, guests, bookingCount);
        seedOrdersAndEntitlements(tenants, guests, orderCount);
        seedBills(tenants, guests, Math.max(orderCount, tenantCount * 20));
        seedDeliveryLogs(tenants, guests, deliveryLogCount);
        seedInboxMessages(tenants, guests, inboxMessageCount);

        log.info("Load-test seed complete. tenants={}, guests={}, bookings={}, orders={}, deliveryLogs={}, inboxMessages={}, password={}",
                tenants.size(), guests.size(), bookingCount, orderCount, deliveryLogCount, inboxMessageCount, password);
    }

    private List<TenantSeed> seedTenants(int tenantCount, String encodedPassword) {
        List<TenantSeed> out = new ArrayList<>(tenantCount);
        for (int i = 1; i <= tenantCount; i++) {
            String code = tenantCode(i);
            Long companyId = getOrCreateCompany(i, code);
            Long adminId = getOrCreateUser(companyId, "Load", "Admin " + i, adminEmail(i), encodedPassword, "ADMIN", true);
            seedSettings(companyId, i);
            Long paymentMethodId = getOrCreatePaymentMethod(companyId);
            Long serviceId = getOrCreateTransactionService(companyId);
            Long typeId = getOrCreateSessionType(companyId, i);
            Long spaceId = getOrCreateSpace(companyId, i);
            linkTypeTransactionService(typeId, serviceId);
            Long productId = getOrCreateGuestProduct(companyId, typeId, serviceId, i);
            seedBookableSlots(companyId, adminId);
            out.add(new TenantSeed(i, companyId, adminId, typeId, spaceId, serviceId, productId, paymentMethodId, code));
            if (i % 100 == 0 || i == tenantCount) {
                log.info("Load-test seeder tenants: {}/{}", i, tenantCount);
            }
        }
        return out;
    }

    private List<GuestSeed> seedGuestsAndClients(List<TenantSeed> tenants, int guestCount, String encodedPassword) {
        List<GuestSeed> out = new ArrayList<>(guestCount);
        for (int i = 1; i <= guestCount; i++) {
            TenantSeed tenant = tenants.get((i - 1) % tenants.size());
            String email = guestEmail(i);
            Long guestId = getOrCreateGuestUser(i, email, encodedPassword);
            Long clientId = getOrCreateClient(tenant.companyId(), i, email);
            linkGuestToTenant(guestId, tenant.companyId(), clientId);
            out.add(new GuestSeed(i, guestId, clientId, tenant));
            if (i % 1_000 == 0 || i == guestCount) {
                log.info("Load-test seeder guests/clients: {}/{}", i, guestCount);
            }
        }
        return out;
    }

    private void seedBookings(List<TenantSeed> tenants, List<GuestSeed> guests, int bookingCount) {
        int existing = count("select count(*) from session_booking where notes like 'LT seed booking %'");
        if (existing >= bookingCount) return;
        int remaining = bookingCount - existing;
        int batchSize = 1_000;
        for (int offset = 0; offset < remaining; offset += batchSize) {
            int size = Math.min(batchSize, remaining - offset);
            final int existingBase = existing;
            final int batchOffset = offset;
            final int batchSizeFinal = size;
            jdbc.batchUpdate("""
                    insert into session_booking(
                        created_at, updated_at, company_id, client_id, booking_group_key, consultant_id,
                        start_time, end_time, space_id, type_id, notes, booking_status, source_channel,
                        guest_user_id, payee_type, payee_custom_data
                    ) values (now(), now(), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESERVED', 'LOAD_TEST', ?, 'PERSON', false)
                    """, new BatchPreparedStatementSetter() {
                @Override
                public void setValues(PreparedStatement ps, int i) throws SQLException {
                    int n = existingBase + batchOffset + i + 1;
                    GuestSeed guest = guests.get((n - 1) % guests.size());
                    TenantSeed tenant = guest.tenant();
                    LocalDate date = LocalDate.now().minusDays(30).plusDays(n % 120L);
                    LocalTime start = LocalTime.of(8 + (n % 10), (n % 2) * 30);
                    LocalDateTime startAt = LocalDateTime.of(date, start);
                    ps.setLong(1, tenant.companyId());
                    ps.setLong(2, guest.clientId());
                    ps.setString(3, "LT-GRP-" + tenant.index() + "-" + n);
                    ps.setLong(4, tenant.adminUserId());
                    ps.setTimestamp(5, Timestamp.valueOf(startAt));
                    ps.setTimestamp(6, Timestamp.valueOf(startAt.plusMinutes(60)));
                    ps.setLong(7, tenant.spaceId());
                    ps.setLong(8, tenant.sessionTypeId());
                    ps.setString(9, "LT seed booking " + n);
                    ps.setString(10, String.valueOf(guest.guestUserId()));
                }

                @Override
                public int getBatchSize() {
                    return batchSizeFinal;
                }
            });
            logEvery("bookings", existingBase + batchOffset + batchSizeFinal, bookingCount, 10_000);
        }
    }

    private void seedOrdersAndEntitlements(List<TenantSeed> tenants, List<GuestSeed> guests, int orderCount) {
        int existing = count("select count(*) from guest_orders where reference_code like 'LT-ORDER-%'");
        if (existing >= orderCount) return;
        int remaining = orderCount - existing;
        for (int i = 1; i <= remaining; i++) {
            int n = existing + i;
            GuestSeed guest = guests.get((n - 1) % guests.size());
            TenantSeed tenant = guest.tenant();
            Long orderId = jdbc.queryForObject("""
                    insert into guest_orders(
                        created_at, updated_at, company_id, client_id, guest_user_id, status,
                        payment_method_type, currency, subtotal_gross, tax_amount, total_gross,
                        reference_code, metadata_json, invoice_locale, paid_at
                    ) values (now(), now(), ?, ?, ?, ?, 'BANK_TRANSFER', 'EUR', 50.00, 9.02, 50.00, ?, '{\"seed\":true}', 'sl', now())
                    returning id
                    """, Long.class,
                    tenant.companyId(), guest.clientId(), guest.guestUserId(), n % 5 == 0 ? "PENDING" : "PAID", "LT-ORDER-" + n);
            jdbc.update("""
                    insert into guest_order_items(created_at, updated_at, order_id, product_id, session_type_id, quantity, unit_price_gross, line_total_gross, metadata_json)
                    values (now(), now(), ?, ?, ?, 1, 50.00, 50.00, '{\"seed\":true}')
                    """, orderId, tenant.productId(), tenant.sessionTypeId());
            if (n % 2 == 0) {
                jdbc.update("""
                        insert into guest_entitlements(
                            created_at, updated_at, company_id, client_id, product_id, source_order_id,
                            entitlement_type, status, remaining_uses, remaining_value_gross, valid_from,
                            valid_until, entitlement_code, visit_count, display_code, display_seq, metadata_json
                        ) values (now(), now(), ?, ?, ?, ?, 'PACK', 'ACTIVE', 5, null, now(), now() + interval '180 days', ?, 0, ?, ?, '{\"seed\":true}')
                        on conflict (entitlement_code) do nothing
                        """, tenant.companyId(), guest.clientId(), tenant.productId(), orderId, "LTENT" + n, "LT-" + n, n);
            }
            logEvery("orders", n, orderCount, 2_000);
        }
    }

    private void seedBills(List<TenantSeed> tenants, List<GuestSeed> guests, int requestedBillCount) {
        int existing = count("select count(*) from bills where bill_number like 'LT-BILL-%'");
        if (existing >= requestedBillCount) return;
        int remaining = requestedBillCount - existing;
        for (int i = 1; i <= remaining; i++) {
            int n = existing + i;
            GuestSeed guest = guests.get((n - 1) % guests.size());
            TenantSeed tenant = guest.tenant();
            String billNumber = "LT-BILL-" + tenant.index() + "-" + n;
            Long billId = jdbc.queryForObject("""
                    insert into bills(
                        created_at, updated_at, company_id, bill_number, order_id, order_counter, bill_type,
                        client_id, client_first_name_snapshot, client_last_name_snapshot, recipient_type_snapshot,
                        recipient_person_email_snapshot, payment_method_id, consultant_id, issue_date,
                        total_net, total_gross, payment_status, bank_transfer_reference, fiscal_status, invoice_locale, paid_at
                    ) values (now(), now(), ?, ?, ?, ?, 'INVOICE', ?, 'LT', ?, 'PERSON', ?, ?, ?, current_date - (? % 90), 40.98, 50.00, ?, ?, 'NOT_SENT', 'sl', now())
                    returning id
                    """, Long.class,
                    tenant.companyId(), billNumber, "LT-ORDER-" + n, n, guest.clientId(), "Client " + guest.index(), guestEmail(guest.index()),
                    tenant.paymentMethodId(), tenant.adminUserId(), n, n % 4 == 0 ? "open" : "paid", "LT-REF-" + n);
            jdbc.update("""
                    insert into bill_item(created_at, updated_at, bill_id, transaction_service_id, quantity, net_price, gross_price, invoice_line_description)
                    values (now(), now(), ?, ?, 1, 40.98, 50.00, 'LT seeded service')
                    """, billId, tenant.transactionServiceId());
            logEvery("bills", n, requestedBillCount, 2_000);
        }
    }

    private void seedDeliveryLogs(List<TenantSeed> tenants, List<GuestSeed> guests, int deliveryLogCount) {
        int existing = count("select count(*) from message_delivery_logs where reference_type = 'LOAD_TEST'");
        if (existing >= deliveryLogCount) return;
        int remaining = deliveryLogCount - existing;
        int batchSize = 2_000;
        for (int offset = 0; offset < remaining; offset += batchSize) {
            int size = Math.min(batchSize, remaining - offset);
            final int existingBase = existing;
            final int batchOffset = offset;
            final int batchSizeFinal = size;
            jdbc.batchUpdate("""
                    insert into message_delivery_logs(
                        created_at, updated_at, company_id, client_id, guest_user_id, channel, status,
                        message_type, recipient, subject, message_preview, reference_type, reference_id,
                        provider_status_code, retry_count, sent_at, delivered_at, metadata_json
                    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LOAD_TEST', ?, '200', 0, ?, ?, '{\"seed\":true}')
                    """, new BatchPreparedStatementSetter() {
                @Override
                public void setValues(PreparedStatement ps, int i) throws SQLException {
                    int n = existingBase + batchOffset + i + 1;
                    GuestSeed guest = guests.get((n - 1) % guests.size());
                    TenantSeed tenant = guest.tenant();
                    OffsetDateTime created = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(n % 120_000L);
                    String channel = switch (n % 5) {
                        case 0 -> "EMAIL";
                        case 1 -> "SMS";
                        case 2 -> "GUEST_APP";
                        case 3 -> "PUSH";
                        default -> "WHATSAPP";
                    };
                    String status = n % 11 == 0 ? "FAILED" : n % 7 == 0 ? "SKIPPED" : "SENT";
                    ps.setObject(1, created);
                    ps.setObject(2, created);
                    ps.setLong(3, tenant.companyId());
                    ps.setLong(4, guest.clientId());
                    ps.setLong(5, guest.guestUserId());
                    ps.setString(6, channel);
                    ps.setString(7, status);
                    ps.setString(8, n % 3 == 0 ? "BOOKING_CHANGED" : "BOOKING_CREATED");
                    ps.setString(9, guestEmail(guest.index()));
                    ps.setString(10, "LT notification " + n);
                    ps.setString(11, "Seeded load-test delivery log " + n);
                    ps.setString(12, "LT-LOG-" + n);
                    ps.setObject(13, created);
                    ps.setObject(14, status.equals("SENT") ? created.plusSeconds(2) : null);
                }

                @Override
                public int getBatchSize() {
                    return batchSizeFinal;
                }
            });
            logEvery("delivery logs", existingBase + batchOffset + batchSizeFinal, deliveryLogCount, 20_000);
        }
    }

    private void seedInboxMessages(List<TenantSeed> tenants, List<GuestSeed> guests, int inboxMessageCount) {
        int existing = count("select count(*) from client_messages where external_message_id like 'LT-MSG-%'");
        if (existing >= inboxMessageCount) return;
        int remaining = inboxMessageCount - existing;
        int batchSize = 2_000;
        for (int offset = 0; offset < remaining; offset += batchSize) {
            int size = Math.min(batchSize, remaining - offset);
            final int existingBase = existing;
            final int batchOffset = offset;
            final int batchSizeFinal = size;
            jdbc.batchUpdate("""
                    insert into client_messages(
                        created_at, updated_at, company_id, client_id, sender_user_id, guest_user_id,
                        channel, direction, status, recipient, subject, body, external_message_id,
                        conversation_key, conversation_closed, conversation_starred, internal_note, sent_at
                    ) values (?, ?, ?, ?, ?, ?, 'GUEST_APP', ?, 'SENT', ?, ?, ?, ?, ?, false, false, false, ?)
                    """, new BatchPreparedStatementSetter() {
                @Override
                public void setValues(PreparedStatement ps, int i) throws SQLException {
                    int n = existingBase + batchOffset + i + 1;
                    GuestSeed guest = guests.get((n - 1) % guests.size());
                    TenantSeed tenant = guest.tenant();
                    OffsetDateTime created = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(n % 50_000L);
                    ps.setObject(1, created);
                    ps.setObject(2, created);
                    ps.setLong(3, tenant.companyId());
                    ps.setLong(4, guest.clientId());
                    if (n % 2 == 0) ps.setLong(5, tenant.adminUserId()); else ps.setObject(5, null);
                    ps.setLong(6, guest.guestUserId());
                    ps.setString(7, n % 2 == 0 ? "OUTBOUND" : "INBOUND");
                    ps.setString(8, guestEmail(guest.index()));
                    ps.setString(9, "LT conversation");
                    ps.setString(10, "Seeded inbox message " + n + " for load testing.");
                    ps.setString(11, "LT-MSG-" + n);
                    ps.setString(12, "LT-CONV-" + guest.clientId());
                    ps.setObject(13, created);
                }

                @Override
                public int getBatchSize() {
                    return batchSizeFinal;
                }
            });
            logEvery("inbox messages", existingBase + batchOffset + batchSizeFinal, inboxMessageCount, 20_000);
        }
    }

    private void resetSeededData() {
        log.warn("Resetting existing load-test seed data for tenant_code lt-% and @loadtest.local guests.");
        jdbc.update("delete from message_delivery_logs where reference_type = 'LOAD_TEST' or company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from client_messages where external_message_id like 'LT-MSG-%' or company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from guest_notifications where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from guest_entitlement_usages where entitlement_id in (select id from guest_entitlements where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from guest_entitlements where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from guest_order_items where order_id in (select id from guest_orders where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from guest_orders where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from bill_item where bill_id in (select id from bills where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from bills where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from booking_push_reminders where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from waitlist_events where waitlist_request_id in (select id from waitlist_requests where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from waitlist_slot_skips where waitlist_request_id in (select id from waitlist_requests where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from waitlist_booking_holds where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from waitlist_offers where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from waitlist_request_services where waitlist_request_id in (select id from waitlist_requests where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from waitlist_request_employees where waitlist_request_id in (select id from waitlist_requests where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from waitlist_request_windows where waitlist_request_id in (select id from waitlist_requests where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from waitlist_requests where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from session_booking where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from guest_tenant_links where company_id in (select id from company where tenant_code like 'lt-%') or guest_user_id in (select id from guest_users where email like '%@loadtest.local')");
        jdbc.update("delete from guest_device_tokens where guest_user_id in (select id from guest_users where email like '%@loadtest.local')");
        jdbc.update("delete from guest_users where email like '%@loadtest.local'");
        jdbc.update("delete from guest_products where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from type_transaction_services where session_type_id in (select id from session_type where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from transaction_service where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from bookable_slot where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from user_spaces where user_id in (select id from users where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from user_types where user_id in (select id from users where company_id in (select id from company where tenant_code like 'lt-%'))");
        jdbc.update("delete from session_type where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from service_group where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from space where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from payment_methods where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from clients where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from users where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from app_settings where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from tenant_invites where company_id in (select id from company where tenant_code like 'lt-%')");
        jdbc.update("delete from company where tenant_code like 'lt-%'");
    }

    private Long getOrCreateCompany(int index, String code) {
        Long id = queryLongOrNull("select id from company where lower(tenant_code) = lower(?)", code);
        if (id != null) {
            jdbc.update("update company set updated_at=now(), name=? where id=?", "Load Test Tenant " + index, id);
            return id;
        }
        return jdbc.queryForObject("insert into company(created_at, updated_at, name, tenant_code) values (now(), now(), ?, ?) returning id",
                Long.class, "Load Test Tenant " + index, code);
    }

    private Long getOrCreateUser(Long companyId, String firstName, String lastName, String email, String passwordHash, String role, boolean consultant) {
        Long id = queryLongOrNull("select id from users where company_id=? and lower(email)=lower(?)", companyId, email);
        if (id != null) {
            jdbc.update("update users set updated_at=now(), password_hash=?, role=?, active=true, consultant=?, working_hours_json=? where id=?",
                    passwordHash, role, consultant, WORKING_HOURS_JSON, id);
            return id;
        }
        return jdbc.queryForObject("""
                insert into users(created_at, updated_at, company_id, first_name, last_name, email, password_hash, role, active, consultant, working_hours_json)
                values (now(), now(), ?, ?, ?, ?, ?, ?, true, ?, ?) returning id
                """, Long.class, companyId, firstName, lastName, email, passwordHash, role, consultant, WORKING_HOURS_JSON);
    }

    private Long getOrCreateGuestUser(int index, String email, String passwordHash) {
        Long id = queryLongOrNull("select id from guest_users where lower(email)=lower(?)", email);
        if (id != null) {
            jdbc.update("update guest_users set updated_at=now(), password_hash=?, active=true, email_verified=true where id=?", passwordHash, id);
            return id;
        }
        return jdbc.queryForObject("""
                insert into guest_users(
                    created_at, updated_at, email, password_hash, first_name, last_name, phone, language,
                    active, email_verified, notify_messages_enabled, notify_reminders_enabled, notify_reminder_minutes, last_login_at
                ) values (now(), now(), ?, ?, 'LT', ?, ?, 'sl', true, true, true, true, 60, now()) returning id
                """, Long.class, email, passwordHash, "Guest " + index, "+386400" + String.format(Locale.ROOT, "%05d", index));
    }

    private Long getOrCreateClient(Long companyId, int index, String email) {
        Long id = queryLongOrNull("select id from clients where company_id=? and lower(email)=lower(?)", companyId, email);
        if (id != null) return id;
        return jdbc.queryForObject("""
                insert into clients(
                    created_at, updated_at, slovenian_locale, company_id, first_name, last_name, email, phone,
                    whatsapp_opt_in, viber_connected, anonymized, active, batch_payment_enabled, inbox_starred,
                    inbox_closed, invoice_recipient_type
                ) values (now(), now(), 'sl', ?, 'LT', ?, ?, ?, false, false, false, true, false, false, false, 'PERSON') returning id
                """, Long.class, companyId, "Client " + index, email, "+386400" + String.format(Locale.ROOT, "%05d", index));
    }

    private void linkGuestToTenant(Long guestId, Long companyId, Long clientId) {
        Long id = queryLongOrNull("select id from guest_tenant_links where guest_user_id=? and company_id=?", guestId, companyId);
        if (id == null) {
            jdbc.update("""
                    insert into guest_tenant_links(created_at, updated_at, guest_user_id, company_id, client_id, status, joined_via, joined_at, last_used_at)
                    values (now(), now(), ?, ?, ?, 'ACTIVE', 'LOAD_TEST', now(), now())
                    """, guestId, companyId, clientId);
        }
    }

    private void seedSettings(Long companyId, int index) {
        upsertSetting(companyId, "SPACES_ENABLED", "true");
        upsertSetting(companyId, "TYPES_ENABLED", "true");
        upsertSetting(companyId, "BOOKABLE_ENABLED", "true");
        upsertSetting(companyId, "ONLINE_SESSION_BOOKING_ENABLED", "true");
        upsertSetting(companyId, "WEBSITE_WIDGET_ENABLED", "true");
        upsertSetting(companyId, "BILLING_ENABLED", "true");
        upsertSetting(companyId, "BILLING_INVOICES_ENABLED", "true");
        upsertSetting(companyId, "BILLING_BANK_TRANSFER_ENABLED", "true");
        upsertSetting(companyId, "BILLING_ONLINE_CARD_PAYMENTS_ENABLED", "false");
        upsertSetting(companyId, "BILLING_PAYPAL_ENABLED", "false");
        upsertSetting(companyId, "BILLING_ADVANCE_ENABLED", "true");
        upsertSetting(companyId, "COMMUNICATION_ENABLED", "true");
        upsertSetting(companyId, "INBOX_ENABLED", "true");
        upsertSetting(companyId, "NOTIFICATIONS_ENABLED", "true");
        upsertSetting(companyId, "NOTIFICATIONS_EMAIL_ALERTS_ENABLED", "true");
        upsertSetting(companyId, "NOTIFICATIONS_SMS_ALERTS_ENABLED", "true");
        upsertSetting(companyId, "NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED", "true");
        upsertSetting(companyId, "MODULE_CONFIG_TYPE", "salon");
        upsertSetting(companyId, "SESSION_LENGTH_MINUTES", "60");
        upsertSetting(companyId, "WORKING_HOURS_START", "08:00");
        upsertSetting(companyId, "WORKING_HOURS_END", "20:00");
        upsertSetting(companyId, "INVOICE_COUNTER", "1");
        upsertSetting(companyId, "ORDER_COUNTER", "1");
        upsertSetting(companyId, "COMPANY_NAME", "Load Test Tenant " + index);
        upsertSetting(companyId, "COMPANY_ADDRESS", "Load Street 1");
        upsertSetting(companyId, "COMPANY_POSTAL_CODE", "1000");
        upsertSetting(companyId, "COMPANY_CITY", "Ljubljana");
        upsertSetting(companyId, "COMPANY_EMAIL", adminEmail(index));
        upsertSetting(companyId, "PAYMENT_DEADLINE_DAYS", "15");
        upsertSetting(companyId, "SIGNUP_PACKAGE_NAME", "PREMIUM");
        upsertSetting(companyId, "SIGNUP_USER_COUNT", "10");
        upsertSetting(companyId, "SIGNUP_SMS_COUNT", "500");
        upsertSetting(companyId, "TENANCY_SPACE_QUOTA", "10");
        upsertSetting(companyId, "WEBSITE_WIDGET_SETTINGS_JSON", "{\"employeeSelectionStep\":false,\"paymentOnLocation\":true,\"acceptedPaymentMethodIds\":[]}");
        upsertSetting(companyId, "WEBSITE_BOOKING_RULES_JSON", "{\"paymentRequirement\":\"none\",\"cancelUntilHours\":24,\"rescheduleUntilHours\":12}");
        upsertSetting(companyId, "GUEST_APP_SETTINGS_JSON", "{\"paymentOnLocation\":true,\"acceptedPaymentMethodIds\":[\"bank_transfer\"]}");
        upsertSetting(companyId, "GUEST_BOOKING_RULES_JSON", "{\"paymentRequirement\":\"none\",\"requireOnlinePayment\":false,\"sameDayBankTransferAllowed\":true,\"bankTransferReservesSlot\":true,\"allowBankTransferFor\":[\"SESSION_SINGLE\",\"PACK\"]}");
        upsertSetting(companyId, "NOTIFICATION_SETTINGS_JSON", "{\"bookingCreated\":{\"guestApp\":{\"enabled\":true,\"title\":\"Termin potrjen\",\"body\":\"Vaš termin je potrjen.\"}},\"bookingChanged\":{\"guestApp\":{\"enabled\":true,\"title\":\"Termin spremenjen\",\"body\":\"Vaš termin je bil spremenjen.\"}}}");
    }

    private void upsertSetting(Long companyId, String key, String value) {
        jdbc.update("""
                insert into app_settings(created_at, updated_at, company_id, key, value)
                values (now(), now(), ?, ?, ?)
                on conflict (company_id, key) do update set updated_at=excluded.updated_at, value=excluded.value
                """, companyId, key, value);
    }

    private Long getOrCreatePaymentMethod(Long companyId) {
        Long id = queryLongOrNull("select id from payment_methods where company_id=? and payment_type='BANK_TRANSFER' order by id limit 1", companyId);
        if (id != null) return id;
        return jdbc.queryForObject("""
                insert into payment_methods(created_at, updated_at, company_id, name, payment_type, fiscalized, stripe_enabled, guest_enabled, widget_enabled, guest_display_order, allowed_guest_product_types_json)
                values (now(), now(), ?, 'Load-test bank transfer', 'BANK_TRANSFER', false, false, true, true, 1, '[\"SESSION_SINGLE\",\"PACK\",\"MEMBERSHIP\"]') returning id
                """, Long.class, companyId);
    }

    private Long getOrCreateTransactionService(Long companyId) {
        Long id = queryLongOrNull("select id from transaction_service where company_id=? and code='LT-001'", companyId);
        if (id != null) return id;
        return jdbc.queryForObject("""
                insert into transaction_service(created_at, updated_at, company_id, code, description, tax_rate, net_price, active)
                values (now(), now(), ?, 'LT-001', 'Load-test service', 'VAT_22', 40.98, true) returning id
                """, Long.class, companyId);
    }

    private Long getOrCreateSessionType(Long companyId, int index) {
        Long id = queryLongOrNull("select id from session_type where company_id=? and name='Load-test consultation'", companyId);
        if (id != null) return id;
        return jdbc.queryForObject("""
                insert into session_type(
                    created_at, updated_at, company_id, name, description, duration_minutes, break_minutes,
                    max_participants_per_session, widget_group_booking_enabled, guest_booking_enabled,
                    group_booking_enabled, price_calculation_mode, guest_booking_description, guest_sort_order, active
                ) values (now(), now(), ?, 'Load-test consultation', 'Seeded consultation for load tests', 60, 0, 1, false, true, false, 'PER_CLIENT', 'Load test booking service', ?, true) returning id
                """, Long.class, companyId, index);
    }

    private Long getOrCreateSpace(Long companyId, int index) {
        Long id = queryLongOrNull("select id from space where company_id=? and name='Load-test room'", companyId);
        if (id != null) return id;
        return jdbc.queryForObject("insert into space(created_at, updated_at, company_id, name, description) values (now(), now(), ?, 'Load-test room', 'Seeded room') returning id",
                Long.class, companyId);
    }

    private void linkTypeTransactionService(Long typeId, Long serviceId) {
        Long id = queryLongOrNull("select id from type_transaction_services where session_type_id=? and transaction_service_id=?", typeId, serviceId);
        if (id == null) {
            jdbc.update("insert into type_transaction_services(created_at, updated_at, session_type_id, transaction_service_id, price) values (now(), now(), ?, ?, 50.00)", typeId, serviceId);
        }
    }

    private Long getOrCreateGuestProduct(Long companyId, Long typeId, Long serviceId, int index) {
        Long id = queryLongOrNull("select id from guest_products where company_id=? and name='Load-test 5-pack'", companyId);
        if (id != null) return id;
        return jdbc.queryForObject("""
                insert into guest_products(
                    created_at, updated_at, company_id, session_type_id, transaction_service_id, name, description,
                    promo_text, product_type, price_gross, currency, active, guest_visible, bookable,
                    usage_limit, validity_days, auto_renews, sort_order, booking_rules_json, entitlement_rules_json
                ) values (now(), now(), ?, ?, ?, 'Load-test 5-pack', 'Seeded pack for load tests', 'Load test', 'PACK', 50.00, 'EUR', true, true, true, 5, 180, false, ?, '{}', '{}') returning id
                """, Long.class, companyId, typeId, serviceId, index);
    }

    private void seedBookableSlots(Long companyId, Long adminUserId) {
        int existing = count("select count(*) from bookable_slot where company_id=?", companyId);
        if (existing > 0) return;
        for (DayOfWeek day : DayOfWeek.values()) {
            jdbc.update("""
                    insert into bookable_slot(created_at, updated_at, company_id, day_of_week, start_time, end_time, consultant_id, indefinite)
                    values (now(), now(), ?, ?, ?, ?, ?, true)
                    """, companyId, day.name(), LocalTime.of(8, 0), LocalTime.of(20, 0), adminUserId);
        }
    }

    private Long queryLongOrNull(String sql, Object... args) {
        return jdbc.query(sql, rs -> rs.next() ? rs.getLong(1) : null, args);
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static void logEvery(String label, int current, int total, int step) {
        if (current == total || current % step == 0) {
            log.info("Load-test seeder {}: {}/{}", label, current, total);
        }
    }

    private static String tenantCode(int index) {
        return PREFIX + String.format(Locale.ROOT, "%04d", index);
    }

    private static String adminEmail(int index) {
        return PREFIX + "admin-" + String.format(Locale.ROOT, "%04d", index) + "@" + DOMAIN;
    }

    private static String guestEmail(int index) {
        return PREFIX + "guest-" + String.format(Locale.ROOT, "%05d", index) + "@" + DOMAIN;
    }

    private record TenantSeed(int index, Long companyId, Long adminUserId, Long sessionTypeId, Long spaceId,
                              Long transactionServiceId, Long productId, Long paymentMethodId, String tenantCode) {}

    private record GuestSeed(int index, Long guestUserId, Long clientId, TenantSeed tenant) {}
}
