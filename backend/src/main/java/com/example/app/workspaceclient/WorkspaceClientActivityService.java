package com.example.app.workspaceclient;

import com.example.app.client.Client;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class WorkspaceClientActivityService {
    private final NamedParameterJdbcTemplate jdbc;

    public WorkspaceClientActivityService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<Long, ClientActivityStats> statsFor(Collection<Client> relationships) {
        if (relationships == null || relationships.isEmpty()) return Map.of();
        List<Long> clientIds = relationships.stream().map(Client::getId).distinct().toList();
        String sql = """
                select activity.client_id,
                       count(*) filter (where activity.event_type = 'BOOKING') as booking_count,
                       count(*) filter (where activity.event_type = 'INVOICE') as invoice_count,
                       count(*) filter (where activity.event_type = 'MESSAGE') as message_count,
                       count(*) filter (where activity.event_type = 'NOTE') as note_count,
                       count(*) filter (where activity.event_type = 'FILE') as file_count,
                       max(activity.occurred_at) as last_activity_at,
                       max(activity.occurred_at) filter (where activity.event_type = 'BOOKING') as last_booking_at
                  from (
                        select sb.client_id,
                               'BOOKING'::text as event_type,
                               (sb.start_time at time zone 'UTC') as occurred_at
                          from session_booking sb
                          join clients scoped_client on scoped_client.id = sb.client_id and scoped_client.company_id = sb.company_id
                         where sb.client_id in (:clientIds)
                        union all
                        select b.client_id,
                               'INVOICE'::text,
                               b.created_at
                          from bills b
                          join clients scoped_client on scoped_client.id = b.client_id and scoped_client.company_id = b.company_id
                         where b.client_id in (:clientIds)
                        union all
                        select cm.client_id,
                               case when cm.internal_note then 'NOTE' else 'MESSAGE' end,
                               coalesce(cm.sent_at, cm.created_at)
                          from client_messages cm
                          join clients scoped_client on scoped_client.id = cm.client_id and scoped_client.company_id = cm.company_id
                         where cm.client_id in (:clientIds)
                        union all
                        select cf.client_id,
                               'FILE'::text,
                               cf.created_at
                          from client_files cf
                          join clients scoped_client on scoped_client.id = cf.client_id and scoped_client.company_id = cf.owner_company_id
                         where cf.client_id in (:clientIds)
                       ) activity
                 group by activity.client_id
                """;
        MapSqlParameterSource params = new MapSqlParameterSource("clientIds", clientIds);
        Map<Long, ClientActivityStats> result = new LinkedHashMap<>();
        jdbc.query(sql, params, rs -> {
            Long clientId = rs.getLong("client_id");
            result.put(clientId, new ClientActivityStats(
                    rs.getLong("booking_count"),
                    rs.getLong("invoice_count"),
                    rs.getLong("message_count"),
                    rs.getLong("note_count"),
                    rs.getLong("file_count"),
                    instant(rs.getTimestamp("last_activity_at")),
                    instant(rs.getTimestamp("last_booking_at"))
            ));
        });
        relationships.forEach(client -> result.putIfAbsent(client.getId(), ClientActivityStats.empty()));
        return result;
    }

    public List<ActivityEvent> recentEvents(Collection<Client> relationships, int requestedLimit) {
        if (relationships == null || relationships.isEmpty()) return List.of();
        List<Long> clientIds = relationships.stream().map(Client::getId).distinct().toList();
        int limit = Math.max(1, Math.min(requestedLimit, 500));
        String sql = """
                select events.event_id,
                       events.client_id,
                       events.company_id,
                       events.occurred_at,
                       events.event_type,
                       events.title,
                       events.detail,
                       events.amount
                  from (
                        select sb.id as event_id,
                               sb.client_id,
                               sb.company_id,
                               (sb.start_time at time zone 'UTC') as occurred_at,
                               'BOOKING'::text as event_type,
                               'Booking'::text as title,
                               coalesce(sb.booking_status, 'RESERVED')::text as detail,
                               null::numeric as amount
                          from session_booking sb
                          join clients scoped_client on scoped_client.id = sb.client_id and scoped_client.company_id = sb.company_id
                         where sb.client_id in (:clientIds)
                        union all
                        select b.id,
                               b.client_id,
                               b.company_id,
                               b.created_at,
                               'INVOICE'::text,
                               coalesce(b.bill_number, 'Invoice')::text,
                               coalesce(b.payment_status, '')::text,
                               b.total_gross
                          from bills b
                          join clients scoped_client on scoped_client.id = b.client_id and scoped_client.company_id = b.company_id
                         where b.client_id in (:clientIds)
                        union all
                        select cm.id,
                               cm.client_id,
                               cm.company_id,
                               coalesce(cm.sent_at, cm.created_at),
                               case when cm.internal_note then 'NOTE' else 'MESSAGE' end,
                               case when cm.internal_note then 'Internal note' else coalesce(cm.channel, 'MESSAGE')::text end,
                               coalesce(cm.status, '')::text,
                               null::numeric
                          from client_messages cm
                          join clients scoped_client on scoped_client.id = cm.client_id and scoped_client.company_id = cm.company_id
                         where cm.client_id in (:clientIds)
                        union all
                        select cf.id,
                               cf.client_id,
                               cf.owner_company_id,
                               cf.created_at,
                               'FILE'::text,
                               cf.original_file_name::text,
                               coalesce(cf.content_type, '')::text,
                               null::numeric
                          from client_files cf
                          join clients scoped_client on scoped_client.id = cf.client_id and scoped_client.company_id = cf.owner_company_id
                         where cf.client_id in (:clientIds)
                       ) events
                 order by events.occurred_at desc, events.event_id desc
                 limit :limit
                """;
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("clientIds", clientIds)
                .addValue("limit", limit);
        return jdbc.query(sql, params, (rs, rowNum) -> new ActivityEvent(
                rs.getLong("event_id"),
                rs.getLong("client_id"),
                rs.getLong("company_id"),
                instant(rs.getTimestamp("occurred_at")),
                rs.getString("event_type"),
                rs.getString("title"),
                rs.getString("detail"),
                rs.getBigDecimal("amount")
        ));
    }

    public Map<Long, List<ActivityEvent>> eventsByClient(Collection<Client> relationships, int limitPerClient) {
        Map<Long, List<ActivityEvent>> grouped = new LinkedHashMap<>();
        for (ActivityEvent event : recentEvents(relationships, Math.max(100, relationships.size() * limitPerClient))) {
            List<ActivityEvent> events = grouped.computeIfAbsent(event.clientId(), ignored -> new ArrayList<>());
            if (events.size() < limitPerClient) events.add(event);
        }
        return grouped;
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    public record ClientActivityStats(
            long bookingCount,
            long invoiceCount,
            long messageCount,
            long noteCount,
            long fileCount,
            Instant lastActivityAt,
            Instant lastBookingAt
    ) {
        public static ClientActivityStats empty() {
            return new ClientActivityStats(0, 0, 0, 0, 0, null, null);
        }
    }

    public record ActivityEvent(
            Long id,
            Long clientId,
            Long unitId,
            Instant occurredAt,
            String type,
            String title,
            String detail,
            BigDecimal amount
    ) {
    }
}
