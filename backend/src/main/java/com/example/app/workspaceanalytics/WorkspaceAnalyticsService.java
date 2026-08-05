package com.example.app.workspaceanalytics;

import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.workspaceclient.WorkspaceClientAccessService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkspaceAnalyticsService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String REPORT_PERMISSION = "REPORTS_ANALYTICS_VIEW";
    private static final Set<String> BOOKING_STATUSES = Set.of("RESERVED", "CHECKED_OUT", "CANCELLED", "NO_SHOW");
    private static final Set<String> PAYMENT_STATUSES = Set.of("open", "payment_pending", "paid", "cancelled");

    private final NamedParameterJdbcTemplate jdbc;
    private final UserRepository users;
    private final WorkspaceClientAccessService accessService;

    public WorkspaceAnalyticsService(
            NamedParameterJdbcTemplate jdbc,
            UserRepository users,
            WorkspaceClientAccessService accessService) {
        this.jdbc = jdbc;
        this.users = users;
        this.accessService = accessService;
    }

    public record Query(
            LocalDate from,
            LocalDate to,
            List<Long> unitIds,
            List<Long> locationIds,
            List<Long> legalEntityIds,
            List<Long> invoiceSeriesIds,
            List<Long> employeeLoginAccountIds,
            List<Long> workspaceServiceTemplateIds,
            List<Long> sessionTypeIds,
            List<String> bookingStatuses,
            List<String> paymentStatuses
    ) {}

    public record IdName(Long id, String name) {}
    public record UnitOption(Long id, String name) {}
    public record LocationOption(Long id, String name, Long unitId, String unitName) {}
    public record LegalEntityOption(Long id, String name, String currency) {}
    public record InvoiceSeriesOption(Long id, String name, Long legalEntityId, String legalEntityName, Long unitId) {}
    public record EmployeeOption(Long loginAccountId, String name, List<Long> unitIds) {}
    public record ServiceTemplateOption(Long id, String name) {}
    public record LocalServiceOption(Long id, String name, Long unitId, String unitName, Long workspaceServiceTemplateId) {}

    public record FiltersResponse(
            List<UnitOption> units,
            List<LocationOption> locations,
            List<LegalEntityOption> legalEntities,
            List<InvoiceSeriesOption> invoiceSeries,
            List<EmployeeOption> employees,
            List<ServiceTemplateOption> workspaceServices,
            List<LocalServiceOption> localServices,
            List<String> bookingStatuses,
            List<String> paymentStatuses
    ) {}

    public record BookingMetrics(
            long bookings,
            long completed,
            long reserved,
            long cancelled,
            long noShows,
            long bookedMinutes,
            long newClients,
            long returningClients
    ) {}

    public record CurrencyMetrics(
            String currency,
            long issuedInvoices,
            BigDecimal issuedGross,
            BigDecimal paidGross,
            BigDecimal openGross,
            BigDecimal refundedGross,
            BigDecimal averageInvoiceGross
    ) {}

    public record TrendPoint(
            LocalDate date,
            long bookings,
            long completed,
            long cancelled,
            long noShows,
            long newClients,
            long returningClients,
            long bookedMinutes,
            List<CurrencyAmount> revenue
    ) {}

    public record CurrencyAmount(String currency, BigDecimal amount) {}

    public record DimensionMetric(
            Long id,
            String name,
            Long parentId,
            String parentName,
            long bookings,
            long completed,
            long cancelled,
            long noShows,
            long bookedMinutes,
            Long availableMinutes,
            Double utilizationPercent,
            List<CurrencyAmount> revenue
    ) {}

    public record InvoiceStatusMetric(String currency, String paymentStatus, long invoiceCount, BigDecimal grossAmount) {}

    public record OverviewResponse(
            LocalDate rangeStart,
            LocalDate rangeEnd,
            LocalDate previousRangeStart,
            LocalDate previousRangeEnd,
            List<Long> selectedUnitIds,
            BookingMetrics current,
            BookingMetrics previous,
            List<CurrencyMetrics> currencies,
            List<CurrencyMetrics> previousCurrencies,
            List<TrendPoint> trend,
            List<DimensionMetric> units,
            List<DimensionMetric> locations,
            List<DimensionMetric> employees,
            List<DimensionMetric> services,
            List<InvoiceStatusMetric> invoiceStatusBreakdown,
            LocalDateTime generatedAt
    ) {}

    public record ExportPayload(byte[] bytes, String contentType, String filename) {}

    private record Access(Long workspaceId, List<User> memberships, List<Long> selectedUnitIds) {}
    private record ResolvedQuery(Query query, Access access, LocalDate from, LocalDate to, LocalDate previousFrom, LocalDate previousTo) {}
    private record RawDimension(Long id, String name, Long parentId, String parentName, long bookings, long completed,
                                long cancelled, long noShows, long bookedMinutes, String workingHoursJson) {}

    @Transactional(readOnly = true)
    public FiltersResponse filters(User me, List<Long> requestedUnitIds) {
        Access access = resolveAccess(me, requestedUnitIds);
        MapSqlParameterSource params = new MapSqlParameterSource("unitIds", access.selectedUnitIds());

        List<UnitOption> unitOptions = access.memberships().stream()
                .map(row -> new UnitOption(row.getCompany().getId(), row.getCompany().getName()))
                .sorted(Comparator.comparing(UnitOption::name, String.CASE_INSENSITIVE_ORDER).thenComparing(UnitOption::id))
                .toList();

        List<LocationOption> locations = jdbc.query("""
                select l.id, l.name, l.company_id, c.name as company_name
                  from locations l
                  join company c on c.id = l.company_id
                 where l.company_id in (:unitIds)
                 order by lower(c.name), lower(l.name), l.id
                """, params, (rs, row) -> new LocationOption(
                rs.getLong("id"), rs.getString("name"), rs.getLong("company_id"), rs.getString("company_name")));

        List<LegalEntityOption> legalEntities = jdbc.query("""
                select le.id, le.name, le.currency
                  from legal_entities le
                 where exists (
                        select 1 from company_legal_entities cle
                         where cle.legal_entity_id = le.id
                           and cle.company_id in (:unitIds)
                           and cle.active = true
                    )
                    or exists (
                        select 1 from bills historical_bill
                         where historical_bill.legal_entity_id = le.id
                           and historical_bill.company_id in (:unitIds)
                    )
                 order by lower(le.name), le.id
                """, params, (rs, row) -> new LegalEntityOption(
                rs.getLong("id"), rs.getString("name"), normalizeCurrency(rs.getString("currency"))));

        List<InvoiceSeriesOption> invoiceSeries = jdbc.query("""
                select distinct s.id, s.name, s.legal_entity_id, le.name as legal_entity_name, s.company_id
                  from invoice_series s
                  join legal_entities le on le.id = s.legal_entity_id
                 where (
                        (s.active = true and (
                            s.company_id in (:unitIds)
                            or (s.company_id is null and exists (
                                select 1 from company_legal_entities cle
                                 where cle.legal_entity_id = s.legal_entity_id
                                   and cle.company_id in (:unitIds)
                                   and cle.active = true
                            ))
                        ))
                        or exists (
                            select 1 from bills historical_bill
                             where historical_bill.invoice_series_id = s.id
                               and historical_bill.company_id in (:unitIds)
                        )
                   )
                 order by lower(le.name), lower(s.name), s.id
                """, params, (rs, row) -> new InvoiceSeriesOption(
                rs.getLong("id"), rs.getString("name"), rs.getLong("legal_entity_id"),
                rs.getString("legal_entity_name"), nullableLong(rs, "company_id")));

        List<EmployeeOption> employees = jdbc.query("""
                select la.id as login_account_id,
                       trim(concat(coalesce(la.first_name, ''), ' ', coalesce(la.last_name, ''))) as display_name,
                       array_agg(distinct u.company_id order by u.company_id) as company_ids
                  from users u
                  join login_accounts la on la.id = u.login_account_id
                 where u.company_id in (:unitIds)
                   and (
                        u.consultant = true
                        or exists (select 1 from session_booking sb where sb.consultant_id = u.id)
                        or exists (select 1 from bills b where b.consultant_id = u.id)
                   )
                 group by la.id, la.first_name, la.last_name
                 order by lower(trim(concat(coalesce(la.first_name, ''), ' ', coalesce(la.last_name, '')))), la.id
                """, params, (rs, row) -> new EmployeeOption(
                rs.getLong("login_account_id"), blankFallback(rs.getString("display_name"), "Employee"),
                longArray(rs.getArray("company_ids"))));

        List<ServiceTemplateOption> workspaceServices = jdbc.query("""
                select distinct wst.id, wst.name
                  from workspace_service_templates wst
                  join session_type st on st.workspace_service_template_id = wst.id
                 where st.company_id in (:unitIds)
                 order by lower(wst.name), wst.id
                """, params, (rs, row) -> new ServiceTemplateOption(rs.getLong("id"), rs.getString("name")));

        List<LocalServiceOption> localServices = jdbc.query("""
                select st.id, st.name, st.company_id, c.name as company_name, st.workspace_service_template_id
                  from session_type st
                  join company c on c.id = st.company_id
                 where st.company_id in (:unitIds)
                 order by lower(c.name), lower(st.name), st.id
                """, params, (rs, row) -> new LocalServiceOption(
                rs.getLong("id"), rs.getString("name"), rs.getLong("company_id"), rs.getString("company_name"),
                nullableLong(rs, "workspace_service_template_id")));

        return new FiltersResponse(unitOptions, locations, legalEntities, invoiceSeries, employees,
                workspaceServices, localServices, BOOKING_STATUSES.stream().sorted().toList(),
                PAYMENT_STATUSES.stream().sorted().toList());
    }

    @Transactional(readOnly = true)
    public OverviewResponse overview(User me, Query rawQuery) {
        ResolvedQuery resolved = resolve(me, rawQuery);
        BookingMetrics current = bookingMetrics(resolved, resolved.from(), resolved.to());
        BookingMetrics previous = bookingMetrics(resolved, resolved.previousFrom(), resolved.previousTo());
        List<CurrencyMetrics> currencies = currencyMetrics(resolved, resolved.from(), resolved.to());
        List<CurrencyMetrics> previousCurrencies = currencyMetrics(resolved, resolved.previousFrom(), resolved.previousTo());
        List<TrendPoint> trend = trend(resolved);
        List<DimensionMetric> units = dimensionMetrics(resolved, Dimension.UNIT);
        List<DimensionMetric> locations = dimensionMetrics(resolved, Dimension.LOCATION);
        List<DimensionMetric> employees = dimensionMetrics(resolved, Dimension.EMPLOYEE);
        List<DimensionMetric> services = serviceMetrics(resolved);
        List<InvoiceStatusMetric> invoiceStatus = invoiceStatusBreakdown(resolved);
        return new OverviewResponse(resolved.from(), resolved.to(), resolved.previousFrom(), resolved.previousTo(),
                resolved.access().selectedUnitIds(), current, previous, currencies, previousCurrencies, trend,
                units, locations, employees, services, invoiceStatus, LocalDateTime.now());
    }

    @Transactional(readOnly = true)
    public ExportPayload export(User me, Query query, String format) {
        OverviewResponse data = overview(me, query);
        boolean excel = "excel".equalsIgnoreCase(format) || "xls".equalsIgnoreCase(format);
        char delimiter = excel ? '\t' : ',';
        StringBuilder out = new StringBuilder();
        if (excel) out.append('\ufeff');
        appendRow(out, delimiter, List.of("Workspace analytics", data.rangeStart() + " – " + data.rangeEnd()));
        appendRow(out, delimiter, List.of("Generated", data.generatedAt().toString()));
        appendRow(out, delimiter, List.of("Previous period", data.previousRangeStart() + " – " + data.previousRangeEnd()));
        appendRow(out, delimiter, List.of("Unit IDs", data.selectedUnitIds().stream().map(String::valueOf).collect(Collectors.joining(" | "))));
        appendRow(out, delimiter, List.of("Location IDs", joined(query == null ? null : query.locationIds())));
        appendRow(out, delimiter, List.of("Legal entity IDs", joined(query == null ? null : query.legalEntityIds())));
        appendRow(out, delimiter, List.of("Invoice series IDs", joined(query == null ? null : query.invoiceSeriesIds())));
        appendRow(out, delimiter, List.of("Employee login IDs", joined(query == null ? null : query.employeeLoginAccountIds())));
        appendRow(out, delimiter, List.of("Workspace service IDs", joined(query == null ? null : query.workspaceServiceTemplateIds())));
        appendRow(out, delimiter, List.of("Local service IDs", joined(query == null ? null : query.sessionTypeIds())));
        appendRow(out, delimiter, List.of("Booking statuses", joinedStrings(query == null ? null : query.bookingStatuses())));
        appendRow(out, delimiter, List.of("Payment statuses", joinedStrings(query == null ? null : query.paymentStatuses())));
        out.append('\n');
        appendRow(out, delimiter, List.of("Metric", "Current", "Previous"));
        appendRow(out, delimiter, List.of("Bookings", data.current().bookings(), data.previous().bookings()));
        appendRow(out, delimiter, List.of("Completed", data.current().completed(), data.previous().completed()));
        appendRow(out, delimiter, List.of("Cancelled", data.current().cancelled(), data.previous().cancelled()));
        appendRow(out, delimiter, List.of("No-shows", data.current().noShows(), data.previous().noShows()));
        appendRow(out, delimiter, List.of("New clients", data.current().newClients(), data.previous().newClients()));
        appendRow(out, delimiter, List.of("Returning clients", data.current().returningClients(), data.previous().returningClients()));
        appendRow(out, delimiter, List.of("Booked minutes", data.current().bookedMinutes(), data.previous().bookedMinutes()));

        out.append('\n');
        appendRow(out, delimiter, List.of("Currency", "Issued invoices", "Issued gross", "Paid gross", "Open gross", "Refunded gross", "Average invoice"));
        data.currencies().forEach(row -> appendRow(out, delimiter, List.of(row.currency(), row.issuedInvoices(), row.issuedGross(),
                row.paidGross(), row.openGross(), row.refundedGross(), row.averageInvoiceGross())));

        appendDimensionSection(out, delimiter, "Units", data.units());
        appendDimensionSection(out, delimiter, "Locations", data.locations());
        appendDimensionSection(out, delimiter, "Employees", data.employees());
        appendDimensionSection(out, delimiter, "Services", data.services());
        out.append('\n');
        appendRow(out, delimiter, List.of("Invoice/payment breakdown"));
        appendRow(out, delimiter, List.of("Currency", "Payment status", "Invoice count", "Gross amount"));
        data.invoiceStatusBreakdown().forEach(row -> appendRow(out, delimiter, List.of(
                row.currency(), row.paymentStatus(), row.invoiceCount(), row.grossAmount())));

        String suffix = excel ? ".xls" : ".csv";
        String contentType = excel ? "application/vnd.ms-excel; charset=UTF-8" : "text/csv; charset=UTF-8";
        return new ExportPayload(out.toString().getBytes(StandardCharsets.UTF_8), contentType,
                "workspace-analytics-" + data.rangeStart() + "-" + data.rangeEnd() + suffix);
    }

    private BookingMetrics bookingMetrics(ResolvedQuery resolved, LocalDate from, LocalDate to) {
        MapSqlParameterSource params = baseParams(resolved, from, to);
        String filters = bookingFilters(resolved.query(), params, "sb", "u", true);
        Map<String, Object> row = jdbc.queryForMap("""
                with booking_rows as (
                    select sb.company_id,
                           coalesce(sb.booking_group_key, 'booking:' || sb.id::text) as logical_key,
                           min(sb.start_time) as start_time,
                           max(sb.end_time) as end_time,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'NO_SHOW') as any_no_show,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'CANCELLED') as any_cancelled,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'CHECKED_OUT') as any_checked_out
                      from session_booking sb
                      left join users u on u.id = sb.consultant_id
                      left join session_type st on st.id = sb.type_id
                     where sb.company_id in (:unitIds)
                       and sb.start_time >= :fromStart
                       and sb.start_time < :toExclusive
                       """ + filters + """
                     group by sb.company_id, coalesce(sb.booking_group_key, 'booking:' || sb.id::text)
                ), logical as (
                    select *, case
                        when any_no_show then 'NO_SHOW'
                        when any_cancelled then 'CANCELLED'
                        when any_checked_out or end_time <= :nowLocal then 'CHECKED_OUT'
                        else 'RESERVED' end as effective_status
                      from booking_rows
                )
                select count(*) as bookings,
                       count(*) filter (where effective_status = 'CHECKED_OUT') as completed,
                       count(*) filter (where effective_status = 'RESERVED') as reserved,
                       count(*) filter (where effective_status = 'CANCELLED') as cancelled,
                       count(*) filter (where effective_status = 'NO_SHOW') as no_shows,
                       coalesce(sum(greatest(0, extract(epoch from (end_time - start_time)) / 60))
                           filter (where effective_status not in ('CANCELLED', 'NO_SHOW')), 0) as booked_minutes
                  from logical
                """, params);
        ClientCounts clients = clientCounts(resolved, from, to);
        return new BookingMetrics(longValue(row.get("bookings")), longValue(row.get("completed")),
                longValue(row.get("reserved")), longValue(row.get("cancelled")), longValue(row.get("no_shows")),
                longValue(row.get("booked_minutes")), clients.newClients(), clients.returningClients());
    }

    private record ClientCounts(long newClients, long returningClients) {}

    private ClientCounts clientCounts(ResolvedQuery resolved, LocalDate from, LocalDate to) {
        MapSqlParameterSource params = baseParams(resolved, from, to);
        String filters = bookingFilters(resolved.query(), params, "sb", "u", true);
        Map<String, Object> row = jdbc.queryForMap("""
                with active_clients as (
                    select distinct coalesce(c.workspace_client_id, -c.id) as client_key
                      from session_booking sb
                      join clients c on c.id = sb.client_id
                      left join users u on u.id = sb.consultant_id
                      left join session_type st on st.id = sb.type_id
                     where sb.company_id in (:unitIds)
                       and sb.start_time >= :fromStart
                       and sb.start_time < :toExclusive
                       and coalesce(sb.booking_status, 'RESERVED') <> 'CANCELLED'
                       """ + filters + """
                ), first_seen as (
                    select coalesce(c.workspace_client_id, -c.id) as client_key, min(sb.start_time) as first_booking
                      from session_booking sb
                      join clients c on c.id = sb.client_id
                     where sb.company_id in (:unitIds)
                       and coalesce(sb.booking_status, 'RESERVED') <> 'CANCELLED'
                     group by coalesce(c.workspace_client_id, -c.id)
                )
                select count(*) filter (where fs.first_booking >= :fromStart and fs.first_booking < :toExclusive) as new_clients,
                       count(*) filter (where fs.first_booking < :fromStart) as returning_clients
                  from active_clients ac
                  join first_seen fs on fs.client_key = ac.client_key
                """, params);
        return new ClientCounts(longValue(row.get("new_clients")), longValue(row.get("returning_clients")));
    }

    private List<CurrencyMetrics> currencyMetrics(ResolvedQuery resolved, LocalDate from, LocalDate to) {
        MapSqlParameterSource params = baseParams(resolved, from, to);
        String filters = billFilters(resolved.query(), params, "b", "u", true);
        return jdbc.query("""
                select coalesce(nullif(trim(le.currency), ''), 'EUR') as currency,
                       count(*) filter (
                           where b.payment_status <> 'cancelled'
                             and b.refund_of_bill_id is null
                             and b.total_gross >= 0
                       ) as issued_invoices,
                       coalesce(sum(b.total_gross) filter (where b.payment_status <> 'cancelled'), 0) as issued_gross,
                       coalesce(avg(b.total_gross) filter (
                           where b.payment_status <> 'cancelled'
                             and b.refund_of_bill_id is null
                             and b.total_gross >= 0
                       ), 0) as average_invoice_gross,
                       coalesce(sum(b.total_gross) filter (where b.payment_status = 'paid'), 0) as paid_gross,
                       coalesce(sum(b.total_gross) filter (where b.payment_status in ('open', 'payment_pending')), 0) as open_gross,
                       coalesce(sum(abs(b.total_gross)) filter (
                           where b.payment_status <> 'cancelled'
                             and (b.refund_of_bill_id is not null or b.total_gross < 0)
                       ), 0) as refunded_gross
                  from bills b
                  join legal_entities le on le.id = b.legal_entity_id
                  left join users u on u.id = b.consultant_id
                  left join session_booking source_booking on source_booking.id = b.source_session_id_snapshot
                  left join session_type st on st.id = source_booking.type_id
                 where b.company_id in (:unitIds)
                   and b.issue_date >= :fromDate
                   and b.issue_date <= :toDate
                   and b.bill_type = 'INVOICE'
                   """ + filters + """
                 group by coalesce(nullif(trim(le.currency), ''), 'EUR')
                 order by currency
                """, params, (rs, row) -> {
            long count = rs.getLong("issued_invoices");
            BigDecimal issued = money(rs.getBigDecimal("issued_gross"));
            return new CurrencyMetrics(rs.getString("currency"), count, issued,
                    money(rs.getBigDecimal("paid_gross")), money(rs.getBigDecimal("open_gross")),
                    money(rs.getBigDecimal("refunded_gross")), money(rs.getBigDecimal("average_invoice_gross")));
        });
    }

    private List<TrendPoint> trend(ResolvedQuery resolved) {
        MapSqlParameterSource params = baseParams(resolved, resolved.from(), resolved.to());
        String bookingFilters = bookingFilters(resolved.query(), params, "sb", "u", true);
        Map<LocalDate, MutableTrend> byDate = new LinkedHashMap<>();
        for (LocalDate date = resolved.from(); !date.isAfter(resolved.to()); date = date.plusDays(1)) {
            byDate.put(date, new MutableTrend());
        }
        jdbc.query("""
                with booking_rows as (
                    select sb.company_id,
                           coalesce(sb.booking_group_key, 'booking:' || sb.id::text) as logical_key,
                           min(sb.start_time) as start_time,
                           max(sb.end_time) as end_time,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'NO_SHOW') as any_no_show,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'CANCELLED') as any_cancelled,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'CHECKED_OUT') as any_checked_out
                      from session_booking sb
                      left join users u on u.id = sb.consultant_id
                      left join session_type st on st.id = sb.type_id
                     where sb.company_id in (:unitIds)
                       and sb.start_time >= :fromStart
                       and sb.start_time < :toExclusive
                       """ + bookingFilters + """
                     group by sb.company_id, coalesce(sb.booking_group_key, 'booking:' || sb.id::text)
                ), logical as (
                    select *, case
                        when any_no_show then 'NO_SHOW'
                        when any_cancelled then 'CANCELLED'
                        when any_checked_out or end_time <= :nowLocal then 'CHECKED_OUT'
                        else 'RESERVED' end as effective_status
                      from booking_rows
                )
                select start_time::date as day,
                       count(*) as bookings,
                       count(*) filter (where effective_status = 'CHECKED_OUT') as completed,
                       count(*) filter (where effective_status = 'CANCELLED') as cancelled,
                       count(*) filter (where effective_status = 'NO_SHOW') as no_shows,
                       coalesce(sum(greatest(0, extract(epoch from (end_time - start_time)) / 60))
                           filter (where effective_status not in ('CANCELLED', 'NO_SHOW')), 0) as booked_minutes
                  from logical
                 group by start_time::date
                 order by day
                """, params, rs -> {
            LocalDate day = rs.getObject("day", LocalDate.class);
            MutableTrend target = byDate.computeIfAbsent(day, ignored -> new MutableTrend());
            target.bookings = rs.getLong("bookings");
            target.completed = rs.getLong("completed");
            target.cancelled = rs.getLong("cancelled");
            target.noShows = rs.getLong("no_shows");
            target.bookedMinutes = rs.getLong("booked_minutes");
        });

        String billFilters = billFilters(resolved.query(), params, "b", "u", true);
        jdbc.query("""
                select b.issue_date as day,
                       coalesce(nullif(trim(le.currency), ''), 'EUR') as currency,
                       coalesce(sum(b.total_gross) filter (where b.payment_status <> 'cancelled'), 0) as gross
                  from bills b
                  join legal_entities le on le.id = b.legal_entity_id
                  left join users u on u.id = b.consultant_id
                  left join session_booking source_booking on source_booking.id = b.source_session_id_snapshot
                  left join session_type st on st.id = source_booking.type_id
                 where b.company_id in (:unitIds)
                   and b.issue_date >= :fromDate
                   and b.issue_date <= :toDate
                   and b.bill_type = 'INVOICE'
                   """ + billFilters + """
                 group by b.issue_date, coalesce(nullif(trim(le.currency), ''), 'EUR')
                 order by b.issue_date, currency
                """, params, rs -> byDate.computeIfAbsent(rs.getObject("day", LocalDate.class), ignored -> new MutableTrend())
                        .revenue.put(rs.getString("currency"), money(rs.getBigDecimal("gross"))));

        Map<LocalDate, ClientCounts> clientByDate = dailyClientCounts(resolved);
        clientByDate.forEach((date, counts) -> {
            MutableTrend target = byDate.computeIfAbsent(date, ignored -> new MutableTrend());
            target.newClients = counts.newClients();
            target.returningClients = counts.returningClients();
        });

        return byDate.entrySet().stream().map(entry -> new TrendPoint(entry.getKey(), entry.getValue().bookings,
                entry.getValue().completed, entry.getValue().cancelled, entry.getValue().noShows,
                entry.getValue().newClients, entry.getValue().returningClients, entry.getValue().bookedMinutes,
                currencyAmounts(entry.getValue().revenue))).toList();
    }

    private Map<LocalDate, ClientCounts> dailyClientCounts(ResolvedQuery resolved) {
        MapSqlParameterSource params = baseParams(resolved, resolved.from(), resolved.to());
        String filters = bookingFilters(resolved.query(), params, "sb", "u", true);
        Map<LocalDate, ClientCounts> result = new HashMap<>();
        jdbc.query("""
                with activity as (
                    select distinct sb.start_time::date as day, coalesce(c.workspace_client_id, -c.id) as client_key
                      from session_booking sb
                      join clients c on c.id = sb.client_id
                      left join users u on u.id = sb.consultant_id
                      left join session_type st on st.id = sb.type_id
                     where sb.company_id in (:unitIds)
                       and sb.start_time >= :fromStart
                       and sb.start_time < :toExclusive
                       and coalesce(sb.booking_status, 'RESERVED') <> 'CANCELLED'
                       """ + filters + """
                ), first_seen as (
                    select coalesce(c.workspace_client_id, -c.id) as client_key, min(sb.start_time)::date as first_day
                      from session_booking sb
                      join clients c on c.id = sb.client_id
                     where sb.company_id in (:unitIds)
                       and coalesce(sb.booking_status, 'RESERVED') <> 'CANCELLED'
                     group by coalesce(c.workspace_client_id, -c.id)
                )
                select a.day,
                       count(*) filter (where fs.first_day = a.day) as new_clients,
                       count(*) filter (where fs.first_day < a.day) as returning_clients
                  from activity a
                  join first_seen fs on fs.client_key = a.client_key
                 group by a.day
                 order by a.day
                """, params, rs -> result.put(rs.getObject("day", LocalDate.class),
                new ClientCounts(rs.getLong("new_clients"), rs.getLong("returning_clients"))));
        return result;
    }

    private enum Dimension { UNIT, LOCATION, EMPLOYEE }

    private List<DimensionMetric> dimensionMetrics(ResolvedQuery resolved, Dimension dimension) {
        MapSqlParameterSource params = baseParams(resolved, resolved.from(), resolved.to());
        String filters = bookingFilters(resolved.query(), params, "sb", "u", true);
        String idExpr;
        String nameExpr;
        String parentIdExpr = "null::bigint";
        String parentNameExpr = "null::text";
        String joins = "";
        String workingJson = "null::text";
        switch (dimension) {
            case UNIT -> {
                idExpr = "sb.company_id";
                nameExpr = "company_row.name";
                joins = " join company company_row on company_row.id = sb.company_id ";
            }
            case LOCATION -> {
                idExpr = "sb.location_id";
                nameExpr = "location_row.name";
                parentIdExpr = "sb.company_id";
                parentNameExpr = "company_row.name";
                joins = " join locations location_row on location_row.id = sb.location_id join company company_row on company_row.id = sb.company_id ";
                workingJson = "max(location_row.opening_hours_json)";
            }
            case EMPLOYEE -> {
                idExpr = "u.login_account_id";
                nameExpr = "trim(concat(coalesce(la.first_name, ''), ' ', coalesce(la.last_name, '')))";
                joins = " join users u on u.id = sb.consultant_id join login_accounts la on la.id = u.login_account_id ";
                workingJson = "max(u.working_hours_json)";
            }
            default -> throw new IllegalStateException();
        }
        String employeeLeftJoin = dimension == Dimension.EMPLOYEE ? "" : " left join users u on u.id = sb.consultant_id ";
        String sql = """
                with booking_rows as (
                    select %s as dimension_id,
                           %s as dimension_name,
                           %s as parent_id,
                           %s as parent_name,
                           sb.company_id,
                           coalesce(sb.booking_group_key, 'booking:' || sb.id::text) as logical_key,
                           min(sb.start_time) as start_time,
                           max(sb.end_time) as end_time,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'NO_SHOW') as any_no_show,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'CANCELLED') as any_cancelled,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'CHECKED_OUT') as any_checked_out,
                           %s as working_hours_json
                      from session_booking sb
                      %s
                      %s
                      left join session_type st on st.id = sb.type_id
                     where sb.company_id in (:unitIds)
                       and sb.start_time >= :fromStart
                       and sb.start_time < :toExclusive
                       and %s is not null
                       %s
                     group by %s, %s, %s, %s, sb.company_id,
                              coalesce(sb.booking_group_key, 'booking:' || sb.id::text)
                ), logical as (
                    select *, case
                        when any_no_show then 'NO_SHOW'
                        when any_cancelled then 'CANCELLED'
                        when any_checked_out or end_time <= :nowLocal then 'CHECKED_OUT'
                        else 'RESERVED' end as effective_status
                      from booking_rows
                )
                select dimension_id, dimension_name, parent_id, parent_name,
                       count(*) as bookings,
                       count(*) filter (where effective_status = 'CHECKED_OUT') as completed,
                       count(*) filter (where effective_status = 'CANCELLED') as cancelled,
                       count(*) filter (where effective_status = 'NO_SHOW') as no_shows,
                       coalesce(sum(greatest(0, extract(epoch from (end_time - start_time)) / 60))
                           filter (where effective_status not in ('CANCELLED', 'NO_SHOW')), 0) as booked_minutes,
                       max(working_hours_json) as working_hours_json
                  from logical
                 group by dimension_id, dimension_name, parent_id, parent_name
                 order by bookings desc, lower(dimension_name), dimension_id
                """.formatted(idExpr, nameExpr, parentIdExpr, parentNameExpr, workingJson,
                joins, employeeLeftJoin, idExpr, filters, idExpr, nameExpr, parentIdExpr, parentNameExpr);

        List<RawDimension> rows = jdbc.query(sql, params, (rs, row) -> new RawDimension(
                rs.getLong("dimension_id"), blankFallback(rs.getString("dimension_name"), "Unassigned"),
                nullableLong(rs, "parent_id"), rs.getString("parent_name"), rs.getLong("bookings"),
                rs.getLong("completed"), rs.getLong("cancelled"), rs.getLong("no_shows"),
                rs.getLong("booked_minutes"), rs.getString("working_hours_json")));

        Map<Long, List<CurrencyAmount>> revenue = dimensionRevenue(resolved, dimension);
        Map<Long, Long> employeeAvailability = dimension == Dimension.EMPLOYEE ? employeeAvailability(resolved) : Map.of();
        Map<Long, Long> locationCapacity = dimension == Dimension.LOCATION ? locationCapacity(resolved) : Map.of();
        return rows.stream().map(row -> {
            Long available = switch (dimension) {
                case EMPLOYEE -> employeeAvailability.get(row.id());
                case LOCATION -> {
                    Long openingMinutes = availableMinutes(row.workingHoursJson(), resolved.from(), resolved.to());
                    long capacity = Math.max(1L, locationCapacity.getOrDefault(row.id(), 1L));
                    yield openingMinutes == null ? null : Math.multiplyExact(openingMinutes, capacity);
                }
                default -> null;
            };
            Double utilization = available == null || available <= 0 ? null
                    : BigDecimal.valueOf(row.bookedMinutes() * 100.0 / available).setScale(1, RoundingMode.HALF_UP).doubleValue();
            return new DimensionMetric(row.id(), row.name(), row.parentId(), row.parentName(), row.bookings(),
                    row.completed(), row.cancelled(), row.noShows(), row.bookedMinutes(), available, utilization,
                    revenue.getOrDefault(row.id(), List.of()));
        }).toList();
    }

    private Map<Long, Long> locationCapacity(ResolvedQuery resolved) {
        MapSqlParameterSource params = new MapSqlParameterSource("unitIds", resolved.access().selectedUnitIds());
        Map<Long, Long> result = new LinkedHashMap<>();
        jdbc.query("""
                select l.id as location_id, count(s.id) as resource_count
                  from locations l
                  left join space s on s.location_id = l.id
                 where l.company_id in (:unitIds)
                 group by l.id
                """, params, rs -> result.put(rs.getLong("location_id"), Math.max(1L, rs.getLong("resource_count"))));
        return result;
    }

    private Map<Long, Long> employeeAvailability(ResolvedQuery resolved) {
        MapSqlParameterSource params = new MapSqlParameterSource("unitIds", resolved.access().selectedUnitIds());
        StringBuilder filter = new StringBuilder();
        if (resolved.query().employeeLoginAccountIds() != null && !resolved.query().employeeLoginAccountIds().isEmpty()) {
            params.addValue("availabilityEmployeeIds", resolved.query().employeeLoginAccountIds());
            filter.append(" and u.login_account_id in (:availabilityEmployeeIds) ");
        }
        Map<Long, List<String>> schedules = new LinkedHashMap<>();
        jdbc.query("""
                select u.login_account_id, u.working_hours_json
                  from users u
                 where u.company_id in (:unitIds)
                   and u.active = true
                   and u.consultant = true
                   """ + filter + """
                 order by u.login_account_id, u.company_id, u.id
                """, params, rs -> schedules
                .computeIfAbsent(rs.getLong("login_account_id"), ignored -> new ArrayList<>())
                .add(rs.getString("working_hours_json")));
        Map<Long, Long> result = new LinkedHashMap<>();
        schedules.forEach((loginAccountId, values) -> {
            Long minutes = availableMinutes(values, resolved.from(), resolved.to());
            if (minutes != null) result.put(loginAccountId, minutes);
        });
        return result;
    }

    private Map<Long, List<CurrencyAmount>> dimensionRevenue(ResolvedQuery resolved, Dimension dimension) {
        MapSqlParameterSource params = baseParams(resolved, resolved.from(), resolved.to());
        String filters = billFilters(resolved.query(), params, "b", "u", true);
        String idExpr;
        switch (dimension) {
            case UNIT -> idExpr = "b.company_id";
            case LOCATION -> idExpr = "b.location_id";
            case EMPLOYEE -> idExpr = "u.login_account_id";
            default -> throw new IllegalStateException();
        }
        Map<Long, Map<String, BigDecimal>> grouped = new LinkedHashMap<>();
        jdbc.query("""
                select %s as dimension_id,
                       coalesce(nullif(trim(le.currency), ''), 'EUR') as currency,
                       coalesce(sum(b.total_gross) filter (where b.payment_status <> 'cancelled'), 0) as gross
                  from bills b
                  join legal_entities le on le.id = b.legal_entity_id
                  left join users u on u.id = b.consultant_id
                  left join session_booking source_booking on source_booking.id = b.source_session_id_snapshot
                  left join session_type st on st.id = source_booking.type_id
                 where b.company_id in (:unitIds)
                   and b.issue_date >= :fromDate
                   and b.issue_date <= :toDate
                   and b.bill_type = 'INVOICE'
                   and %s is not null
                   %s
                 group by %s, coalesce(nullif(trim(le.currency), ''), 'EUR')
                """.formatted(idExpr, idExpr, filters, idExpr), params, rs -> grouped
                .computeIfAbsent(rs.getLong("dimension_id"), ignored -> new LinkedHashMap<>())
                .put(rs.getString("currency"), money(rs.getBigDecimal("gross"))));
        return grouped.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey,
                entry -> currencyAmounts(entry.getValue()), (a, b) -> a, LinkedHashMap::new));
    }

    private List<DimensionMetric> serviceMetrics(ResolvedQuery resolved) {
        MapSqlParameterSource params = baseParams(resolved, resolved.from(), resolved.to());
        String filters = bookingFilters(resolved.query(), params, "sb", "u", false);
        String serviceFilters = directServiceFilters(resolved.query(), params, "st", "serviceMetric");
        List<RawDimension> rows = jdbc.query("""
                with service_rows as (
                    select coalesce(st.workspace_service_template_id, -st.id) as service_key,
                           coalesce(wst.name, st.name, ss.service_name_snapshot, 'Unassigned') as service_name,
                           sb.company_id,
                           coalesce(sb.booking_group_key, 'booking:' || sb.id::text) as logical_key,
                           ss.position,
                           min(ss.start_time) as start_time,
                           max(ss.end_time) as end_time,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'NO_SHOW') as any_no_show,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'CANCELLED') as any_cancelled,
                           bool_or(coalesce(sb.booking_status, 'RESERVED') = 'CHECKED_OUT') as any_checked_out
                      from session_booking sb
                      join session_service ss on ss.session_booking_id = sb.id
                      join session_type st on st.id = ss.session_type_id
                      left join workspace_service_templates wst on wst.id = st.workspace_service_template_id
                      left join users u on u.id = sb.consultant_id
                     where sb.company_id in (:unitIds)
                       and sb.start_time >= :fromStart
                       and sb.start_time < :toExclusive
                       """ + filters + serviceFilters + """
                     group by coalesce(st.workspace_service_template_id, -st.id),
                              coalesce(wst.name, st.name, ss.service_name_snapshot, 'Unassigned'),
                              sb.company_id, coalesce(sb.booking_group_key, 'booking:' || sb.id::text), ss.position
                ), logical as (
                    select *, case
                        when any_no_show then 'NO_SHOW'
                        when any_cancelled then 'CANCELLED'
                        when any_checked_out or end_time <= :nowLocal then 'CHECKED_OUT'
                        else 'RESERVED' end as effective_status
                      from service_rows
                )
                select service_key as dimension_id, service_name as dimension_name,
                       count(*) as bookings,
                       count(*) filter (where effective_status = 'CHECKED_OUT') as completed,
                       count(*) filter (where effective_status = 'CANCELLED') as cancelled,
                       count(*) filter (where effective_status = 'NO_SHOW') as no_shows,
                       coalesce(sum(greatest(0, extract(epoch from (end_time - start_time)) / 60))
                           filter (where effective_status not in ('CANCELLED', 'NO_SHOW')), 0) as booked_minutes
                  from logical
                 group by service_key, service_name
                 order by bookings desc, lower(service_name), service_key
                """, params, (rs, row) -> new RawDimension(rs.getLong("dimension_id"), rs.getString("dimension_name"),
                null, null, rs.getLong("bookings"), rs.getLong("completed"), rs.getLong("cancelled"),
                rs.getLong("no_shows"), rs.getLong("booked_minutes"), null));

        Map<Long, List<CurrencyAmount>> revenue = serviceRevenue(resolved);
        return rows.stream().map(row -> new DimensionMetric(row.id(), row.name(), null, null, row.bookings(),
                row.completed(), row.cancelled(), row.noShows(), row.bookedMinutes(), null, null,
                revenue.getOrDefault(row.id(), List.of()))).toList();
    }

    private Map<Long, List<CurrencyAmount>> serviceRevenue(ResolvedQuery resolved) {
        MapSqlParameterSource params = baseParams(resolved, resolved.from(), resolved.to());
        String filters = billFilters(resolved.query(), params, "b", "u", false);
        String serviceFilters = directServiceFilters(resolved.query(), params, "st", "serviceRevenue");
        Map<Long, Map<String, BigDecimal>> grouped = new LinkedHashMap<>();
        jdbc.query("""
                select coalesce(st.workspace_service_template_id, -st.id) as service_key,
                       coalesce(nullif(trim(le.currency), ''), 'EUR') as currency,
                       coalesce(sum(bi.gross_price * bi.quantity) filter (where b.payment_status <> 'cancelled'), 0) as gross
                  from bill_item bi
                  join bills b on b.id = bi.bill_id
                  join legal_entities le on le.id = b.legal_entity_id
                  join session_booking source_booking on source_booking.id = bi.source_session_booking_id
                  join session_type st on st.id = source_booking.type_id
                  left join users u on u.id = b.consultant_id
                 where b.company_id in (:unitIds)
                   and b.issue_date >= :fromDate
                   and b.issue_date <= :toDate
                   and b.bill_type = 'INVOICE'
                   """ + filters + serviceFilters + """
                 group by coalesce(st.workspace_service_template_id, -st.id),
                          coalesce(nullif(trim(le.currency), ''), 'EUR')
                """, params, rs -> grouped.computeIfAbsent(rs.getLong("service_key"), ignored -> new LinkedHashMap<>())
                .put(rs.getString("currency"), money(rs.getBigDecimal("gross"))));
        return grouped.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey,
                entry -> currencyAmounts(entry.getValue()), (a, b) -> a, LinkedHashMap::new));
    }

    private List<InvoiceStatusMetric> invoiceStatusBreakdown(ResolvedQuery resolved) {
        MapSqlParameterSource params = baseParams(resolved, resolved.from(), resolved.to());
        String filters = billFilters(resolved.query(), params, "b", "u", true);
        return jdbc.query("""
                select coalesce(nullif(trim(le.currency), ''), 'EUR') as currency,
                       coalesce(nullif(trim(b.payment_status), ''), 'open') as payment_status,
                       count(*) as invoice_count,
                       coalesce(sum(b.total_gross), 0) as gross_amount
                  from bills b
                  join legal_entities le on le.id = b.legal_entity_id
                  left join users u on u.id = b.consultant_id
                  left join session_booking source_booking on source_booking.id = b.source_session_id_snapshot
                  left join session_type st on st.id = source_booking.type_id
                 where b.company_id in (:unitIds)
                   and b.issue_date >= :fromDate
                   and b.issue_date <= :toDate
                   and b.bill_type = 'INVOICE'
                   """ + filters + """
                 group by coalesce(nullif(trim(le.currency), ''), 'EUR'),
                          coalesce(nullif(trim(b.payment_status), ''), 'open')
                 order by currency, payment_status
                """, params, (rs, row) -> new InvoiceStatusMetric(rs.getString("currency"),
                rs.getString("payment_status"), rs.getLong("invoice_count"), money(rs.getBigDecimal("gross_amount"))));
    }

    private ResolvedQuery resolve(User me, Query raw) {
        Query safe = raw == null ? new Query(null, null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of()) : raw;
        LocalDate to = safe.to() == null ? LocalDate.now() : safe.to();
        LocalDate from = safe.from() == null ? to.withDayOfMonth(1) : safe.from();
        if (from.isAfter(to)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "From date must not be after to date.");
        if (ChronoUnit.DAYS.between(from, to) > 730) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Workspace analytics range cannot exceed 731 days.");
        }
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        LocalDate previousTo = from.minusDays(1);
        LocalDate previousFrom = previousTo.minusDays(days - 1);
        Access access = resolveAccess(me, safe.unitIds());
        Query normalized = new Query(from, to, access.selectedUnitIds(), positiveDistinct(safe.locationIds()),
                positiveDistinct(safe.legalEntityIds()), positiveDistinct(safe.invoiceSeriesIds()),
                positiveDistinct(safe.employeeLoginAccountIds()), positiveDistinct(safe.workspaceServiceTemplateIds()),
                positiveDistinct(safe.sessionTypeIds()), normalizeStrings(safe.bookingStatuses(), BOOKING_STATUSES, true),
                normalizeStrings(safe.paymentStatuses(), PAYMENT_STATUSES, false));
        validateDimensions(access, normalized);
        return new ResolvedQuery(normalized, access, from, to, previousFrom, previousTo);
    }

    private Access resolveAccess(User me, List<Long> requestedUnitIds) {
        WorkspaceClientAccessService.AccessSnapshot snapshot = accessService.snapshot(me);
        List<User> eligible = users.findActiveWorkspaceMemberships(me.getLoginAccount().getId(), snapshot.workspaceId()).stream()
                .filter(membership -> SecurityUtils.hasPermission(membership, REPORT_PERMISSION))
                .toList();
        if (eligible.isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Analytics permission is required.");
        List<Long> accessible = eligible.stream().map(row -> row.getCompany().getId()).distinct().toList();
        List<Long> selected = requestedUnitIds == null || requestedUnitIds.isEmpty()
                ? accessible
                : positiveDistinct(requestedUnitIds);
        if (selected.isEmpty() || !accessible.containsAll(selected)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "One or more requested units are not accessible for analytics.");
        }
        return new Access(snapshot.workspaceId(), eligible, selected);
    }

    private void validateDimensions(Access access, Query query) {
        MapSqlParameterSource params = new MapSqlParameterSource("unitIds", access.selectedUnitIds());
        validateIds("locations", query.locationIds(), jdbc.queryForList(
                "select id from locations where company_id in (:unitIds)", params, Long.class));
        validateIds("legal entities", query.legalEntityIds(), jdbc.queryForList("""
                select le.id
                  from legal_entities le
                 where exists (
                           select 1 from company_legal_entities cle
                            where cle.legal_entity_id = le.id
                              and cle.company_id in (:unitIds)
                              and cle.active = true
                       )
                    or exists (
                           select 1 from bills historical_bill
                            where historical_bill.legal_entity_id = le.id
                              and historical_bill.company_id in (:unitIds)
                       )
                """, params, Long.class));
        validateIds("invoice series", query.invoiceSeriesIds(), jdbc.queryForList("""
                select distinct s.id from invoice_series s
                 where (s.active = true and (
                            s.company_id in (:unitIds)
                            or (s.company_id is null and exists (
                                select 1 from company_legal_entities cle
                                 where cle.legal_entity_id=s.legal_entity_id
                                   and cle.company_id in (:unitIds)
                                   and cle.active=true
                            ))
                       ))
                    or exists (
                        select 1 from bills historical_bill
                         where historical_bill.invoice_series_id = s.id
                           and historical_bill.company_id in (:unitIds)
                    )
                """, params, Long.class));
        validateIds("employees", query.employeeLoginAccountIds(), jdbc.queryForList(
                "select distinct login_account_id from users where company_id in (:unitIds)", params, Long.class));
        validateIds("workspace services", query.workspaceServiceTemplateIds(), jdbc.queryForList(
                "select distinct workspace_service_template_id from session_type where company_id in (:unitIds) and workspace_service_template_id is not null",
                params, Long.class));
        validateIds("local services", query.sessionTypeIds(), jdbc.queryForList(
                "select id from session_type where company_id in (:unitIds)", params, Long.class));
    }

    private static void validateIds(String label, Collection<Long> requested, Collection<Long> allowed) {
        if (requested == null || requested.isEmpty()) return;
        if (!new LinkedHashSet<>(allowed).containsAll(requested)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "One or more requested " + label + " are not accessible.");
        }
    }

    private MapSqlParameterSource baseParams(ResolvedQuery resolved, LocalDate from, LocalDate to) {
        return new MapSqlParameterSource()
                .addValue("workspaceId", resolved.access().workspaceId())
                .addValue("unitIds", resolved.access().selectedUnitIds())
                .addValue("fromDate", from)
                .addValue("toDate", to)
                .addValue("fromStart", from.atStartOfDay())
                .addValue("toExclusive", to.plusDays(1).atStartOfDay())
                .addValue("nowLocal", LocalDateTime.now());
    }

    private String bookingFilters(
            Query query,
            MapSqlParameterSource params,
            String bookingAlias,
            String userAlias,
            boolean includeServiceFilters) {
        StringBuilder sql = new StringBuilder();
        appendListFilter(sql, params, bookingAlias + ".location_id", "locationIds", query.locationIds());
        appendListFilter(sql, params, userAlias + ".login_account_id", "employeeIds", query.employeeLoginAccountIds());
        if (includeServiceFilters && hasServiceFilters(query)) {
            params.addValue("bookingWorkspaceServiceIds", query.workspaceServiceTemplateIds());
            params.addValue("bookingSessionTypeIds", query.sessionTypeIds());
            sql.append(" and exists (select 1 from session_service analytics_ss ")
                    .append("join session_type analytics_st on analytics_st.id = analytics_ss.session_type_id ")
                    .append("where analytics_ss.session_booking_id = ").append(bookingAlias).append(".id ");
            if (query.workspaceServiceTemplateIds() != null && !query.workspaceServiceTemplateIds().isEmpty()) {
                sql.append("and analytics_st.workspace_service_template_id in (:bookingWorkspaceServiceIds) ");
            }
            if (query.sessionTypeIds() != null && !query.sessionTypeIds().isEmpty()) {
                sql.append("and analytics_st.id in (:bookingSessionTypeIds) ");
            }
            sql.append(") ");
        }
        if (query.bookingStatuses() != null && !query.bookingStatuses().isEmpty()) {
            params.addValue("bookingStatuses", query.bookingStatuses());
            sql.append(" and (case ")
                    .append("when upper(coalesce(").append(bookingAlias).append(".booking_status, 'RESERVED')) = 'NO_SHOW' then 'NO_SHOW' ")
                    .append("when upper(coalesce(").append(bookingAlias).append(".booking_status, 'RESERVED')) = 'CANCELLED' then 'CANCELLED' ")
                    .append("when upper(coalesce(").append(bookingAlias).append(".booking_status, 'RESERVED')) = 'CHECKED_OUT' ")
                    .append("or ").append(bookingAlias).append(".end_time <= :nowLocal then 'CHECKED_OUT' ")
                    .append("else 'RESERVED' end) in (:bookingStatuses) ");
        }
        return sql.toString();
    }

    private String billFilters(
            Query query,
            MapSqlParameterSource params,
            String billAlias,
            String userAlias,
            boolean includeServiceFilters) {
        StringBuilder sql = new StringBuilder();
        appendListFilter(sql, params, billAlias + ".location_id", "billLocationIds", query.locationIds());
        appendListFilter(sql, params, billAlias + ".legal_entity_id", "legalEntityIds", query.legalEntityIds());
        appendListFilter(sql, params, billAlias + ".invoice_series_id", "invoiceSeriesIds", query.invoiceSeriesIds());
        appendListFilter(sql, params, userAlias + ".login_account_id", "billEmployeeIds", query.employeeLoginAccountIds());
        if (includeServiceFilters && hasServiceFilters(query)) {
            params.addValue("billWorkspaceServiceIds", query.workspaceServiceTemplateIds());
            params.addValue("billSessionTypeIds", query.sessionTypeIds());
            sql.append(" and exists (select 1 from bill_item analytics_bi ")
                    .append("join session_service analytics_ss on analytics_ss.session_booking_id = analytics_bi.source_session_booking_id ")
                    .append("join session_type analytics_st on analytics_st.id = analytics_ss.session_type_id ")
                    .append("where analytics_bi.bill_id = ").append(billAlias).append(".id ");
            if (query.workspaceServiceTemplateIds() != null && !query.workspaceServiceTemplateIds().isEmpty()) {
                sql.append("and analytics_st.workspace_service_template_id in (:billWorkspaceServiceIds) ");
            }
            if (query.sessionTypeIds() != null && !query.sessionTypeIds().isEmpty()) {
                sql.append("and analytics_st.id in (:billSessionTypeIds) ");
            }
            sql.append(") ");
        }
        if (query.paymentStatuses() != null && !query.paymentStatuses().isEmpty()) {
            params.addValue("paymentStatuses", query.paymentStatuses());
            sql.append(" and ").append(billAlias).append(".payment_status in (:paymentStatuses) ");
        }
        return sql.toString();
    }

    private static boolean hasServiceFilters(Query query) {
        return (query.workspaceServiceTemplateIds() != null && !query.workspaceServiceTemplateIds().isEmpty())
                || (query.sessionTypeIds() != null && !query.sessionTypeIds().isEmpty());
    }

    private static String directServiceFilters(
            Query query,
            MapSqlParameterSource params,
            String typeAlias,
            String parameterPrefix) {
        StringBuilder sql = new StringBuilder();
        if (query.workspaceServiceTemplateIds() != null && !query.workspaceServiceTemplateIds().isEmpty()) {
            String name = parameterPrefix + "WorkspaceServiceIds";
            params.addValue(name, query.workspaceServiceTemplateIds());
            sql.append(" and ").append(typeAlias).append(".workspace_service_template_id in (:").append(name).append(") ");
        }
        if (query.sessionTypeIds() != null && !query.sessionTypeIds().isEmpty()) {
            String name = parameterPrefix + "SessionTypeIds";
            params.addValue(name, query.sessionTypeIds());
            sql.append(" and ").append(typeAlias).append(".id in (:").append(name).append(") ");
        }
        return sql.toString();
    }

    private static void appendListFilter(StringBuilder sql, MapSqlParameterSource params, String column, String name, List<Long> values) {
        if (values == null || values.isEmpty()) return;
        params.addValue(name, values);
        sql.append(" and ").append(column).append(" in (:").append(name).append(") ");
    }

    private static List<Long> positiveDistinct(List<Long> values) {
        if (values == null) return List.of();
        return values.stream().filter(Objects::nonNull).filter(value -> value > 0).distinct().toList();
    }

    private static List<String> normalizeStrings(List<String> values, Set<String> allowed, boolean uppercase) {
        if (values == null) return List.of();
        List<String> normalized = values.stream().filter(Objects::nonNull).map(String::trim).filter(value -> !value.isBlank())
                .map(value -> uppercase ? value.toUpperCase(Locale.ROOT) : value.toLowerCase(Locale.ROOT)).distinct().toList();
        if (!allowed.containsAll(normalized)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported analytics filter value.");
        return normalized;
    }

    private record TimeRange(LocalTime start, LocalTime end) {}

    private static Long availableMinutes(String raw, LocalDate from, LocalDate to) {
        return availableMinutes(raw == null ? List.of() : List.of(raw), from, to);
    }

    private static Long availableMinutes(Collection<String> schedules, LocalDate from, LocalDate to) {
        if (schedules == null || schedules.isEmpty()) return null;
        List<JsonNode> roots = schedules.stream()
                .filter(Objects::nonNull)
                .filter(value -> !value.isBlank())
                .map(value -> {
                    try { return JSON.readTree(value); } catch (Exception ignored) { return null; }
                })
                .filter(Objects::nonNull)
                .toList();
        if (roots.isEmpty()) return null;
        long total = 0;
        boolean found = false;
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            List<TimeRange> ranges = new ArrayList<>();
            for (JsonNode root : roots) {
                JsonNode block = root.path("sameForAllDays").asBoolean(false)
                        ? root.get("allDays")
                        : root.path("byDay").get(date.getDayOfWeek().name());
                if (block == null || block.isNull() || !block.isObject()) continue;
                LocalTime start = parseTime(block.path("start").asText(null));
                LocalTime end = parseTime(block.path("end").asText(null));
                if (start == null || end == null || !end.isAfter(start)) continue;
                ranges.add(new TimeRange(start, end));
            }
            if (ranges.isEmpty()) continue;
            ranges.sort(Comparator.comparing(TimeRange::start).thenComparing(TimeRange::end));
            LocalTime mergedStart = ranges.getFirst().start();
            LocalTime mergedEnd = ranges.getFirst().end();
            for (int index = 1; index < ranges.size(); index++) {
                TimeRange next = ranges.get(index);
                if (!next.start().isAfter(mergedEnd)) {
                    if (next.end().isAfter(mergedEnd)) mergedEnd = next.end();
                } else {
                    total += ChronoUnit.MINUTES.between(mergedStart, mergedEnd);
                    mergedStart = next.start();
                    mergedEnd = next.end();
                }
            }
            total += ChronoUnit.MINUTES.between(mergedStart, mergedEnd);
            found = true;
        }
        return found ? total : null;
    }

    private static LocalTime parseTime(String value) {
        if (value == null || value.isBlank()) return null;
        try { return LocalTime.parse(value.trim()); } catch (Exception ignored) {
            try {
                String[] parts = value.trim().split(":");
                return LocalTime.of(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]));
            } catch (Exception ignoredAgain) { return null; }
        }
    }

    private static List<CurrencyAmount> currencyAmounts(Map<String, BigDecimal> values) {
        return values.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .map(entry -> new CurrencyAmount(normalizeCurrency(entry.getKey()), money(entry.getValue()))).toList();
    }

    private static String joined(Collection<Long> values) {
        return values == null || values.isEmpty() ? "ALL" : values.stream().map(String::valueOf).collect(Collectors.joining(" | "));
    }

    private static String joinedStrings(Collection<String> values) {
        return values == null || values.isEmpty() ? "ALL" : String.join(" | ", values);
    }

    private static void appendDimensionSection(StringBuilder out, char delimiter, String title, List<DimensionMetric> rows) {
        out.append('\n');
        appendRow(out, delimiter, List.of(title));
        appendRow(out, delimiter, List.of("Name", "Parent", "Bookings", "Completed", "Cancelled", "No-shows", "Booked minutes", "Available minutes", "Utilization %", "Revenue"));
        rows.forEach(row -> appendRow(out, delimiter, List.of(row.name(), row.parentName() == null ? "" : row.parentName(),
                row.bookings(), row.completed(), row.cancelled(), row.noShows(), row.bookedMinutes(),
                row.availableMinutes() == null ? "" : row.availableMinutes(), row.utilizationPercent() == null ? "" : row.utilizationPercent(),
                row.revenue().stream().map(value -> value.currency() + " " + value.amount()).collect(Collectors.joining(" | ")))));
    }

    private static void appendRow(StringBuilder out, char delimiter, List<?> values) {
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) out.append(delimiter);
            String raw = String.valueOf(values.get(index) == null ? "" : values.get(index));
            if (delimiter == ',' && (raw.contains(",") || raw.contains("\"") || raw.contains("\n"))) {
                out.append('\"').append(raw.replace("\"", "\"\"")).append('\"');
            } else {
                out.append(raw.replace("\t", " ").replace("\r", " ").replace("\n", " "));
            }
        }
        out.append('\n');
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static long longValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        if (value == null) return 0;
        try { return new BigDecimal(value.toString()).longValue(); } catch (Exception ignored) { return 0; }
    }

    private static Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private static List<Long> longArray(java.sql.Array array) throws java.sql.SQLException {
        if (array == null) return List.of();
        Object raw = array.getArray();
        if (raw instanceof Long[] values) return List.of(values);
        if (raw instanceof Number[] values) {
            List<Long> out = new ArrayList<>();
            for (Number value : values) out.add(value.longValue());
            return out;
        }
        if (raw instanceof Object[] values) {
            List<Long> out = new ArrayList<>();
            for (Object value : values) {
                if (value instanceof Number number) out.add(number.longValue());
                else if (value != null) {
                    try { out.add(Long.parseLong(value.toString())); } catch (NumberFormatException ignored) { }
                }
            }
            return out;
        }
        return List.of();
    }

    private static String normalizeCurrency(String value) {
        return value == null || value.isBlank() ? "EUR" : value.trim().toUpperCase(Locale.ROOT);
    }

    private static String blankFallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static final class MutableTrend {
        long bookings;
        long completed;
        long cancelled;
        long noShows;
        long newClients;
        long returningClients;
        long bookedMinutes;
        final Map<String, BigDecimal> revenue = new LinkedHashMap<>();
    }
}
