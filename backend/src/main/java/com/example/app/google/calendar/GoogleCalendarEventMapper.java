package com.example.app.google.calendar;

import com.example.app.session.CalendarTodo;
import com.example.app.session.PersonalCalendarBlock;
import com.example.app.session.SessionBooking;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

@Component
public class GoogleCalendarEventMapper {
    private final GoogleCalendarConfig config;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public GoogleCalendarEventMapper(GoogleCalendarConfig config) { this.config = config; }

    public ObjectNode toGoogleEvent(SessionBooking booking) {
        ObjectNode event = objectMapper.createObjectNode();
        String clientName = booking.getClient() == null ? "Client" : safe((booking.getClient().getFirstName() + " " + booking.getClient().getLastName()).trim());
        String serviceName = booking.getType() == null ? "Session" : safe(booking.getType().getName());
        event.put("summary", "Booking: " + clientName + " - " + serviceName);
        StringBuilder description = new StringBuilder("Created by Calendra");
        if (booking.getNotes() != null && !booking.getNotes().isBlank()) description.append("\n\nNotes: ").append(booking.getNotes());
        if (booking.getBookingGroupKey() != null && !booking.getBookingGroupKey().isBlank()) description.append("\nBooking group: ").append(booking.getBookingGroupKey());
        event.put("description", description.toString());
        putDateTime(event, "start", booking.getStartTime());
        putDateTime(event, "end", booking.getEndTime());
        putPrivateProps(event, booking.getCompany().getId(), GoogleCalendarEntityType.SESSION_BOOKING, booking.getId());
        return event;
    }

    public ObjectNode toGoogleEvent(PersonalCalendarBlock block) {
        ObjectNode event = objectMapper.createObjectNode();
        event.put("summary", "Personal: " + safe(block.getTask()));
        if (block.getNotes() != null && !block.getNotes().isBlank()) event.put("description", block.getNotes());
        putDateTime(event, "start", block.getStartTime());
        putDateTime(event, "end", block.getEndTime());
        putPrivateProps(event, block.getCompany().getId(), GoogleCalendarEntityType.PERSONAL_SESSION, block.getId());
        return event;
    }

    public ObjectNode toGoogleEvent(CalendarTodo todo) {
        ObjectNode event = objectMapper.createObjectNode();
        event.put("summary", "ToDo: " + safe(todo.getTask()));
        if (todo.getNotes() != null && !todo.getNotes().isBlank()) event.put("description", todo.getNotes());
        putDateTime(event, "start", todo.getStartTime());
        putDateTime(event, "end", todo.getStartTime().plusMinutes(config.getTodoDurationMinutes()));
        putPrivateProps(event, todo.getCompany().getId(), GoogleCalendarEntityType.TODO, todo.getId());
        return event;
    }

    public String hash(ObjectNode event) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(event.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return Integer.toHexString(event.toString().hashCode());
        }
    }

    public GoogleCalendarEntityRef entityRefFromExtendedProperties(JsonNode event) {
        JsonNode props = event.path("extendedProperties").path("private");
        String tenantId = props.path("calendraTenantId").asText(null);
        String type = props.path("calendraEntityType").asText(null);
        String id = props.path("calendraEntityId").asText(null);
        if (tenantId == null || type == null || id == null) return null;
        try { return new GoogleCalendarEntityRef(Long.parseLong(tenantId), GoogleCalendarEntityType.valueOf(type), Long.parseLong(id)); }
        catch (Exception ex) { return null; }
    }

    public LocalDateTime startFromGoogleEvent(JsonNode event) { return parseGoogleDateTime(event.path("start")); }
    public LocalDateTime endFromGoogleEvent(JsonNode event) { return parseGoogleDateTime(event.path("end")); }

    private LocalDateTime parseGoogleDateTime(JsonNode node) {
        String dt = node.path("dateTime").asText(null);
        if (dt != null && !dt.isBlank()) return OffsetDateTime.parse(dt).toLocalDateTime();
        String date = node.path("date").asText(null);
        if (date != null && !date.isBlank()) return java.time.LocalDate.parse(date).atStartOfDay();
        return null;
    }

    private void putDateTime(ObjectNode event, String field, LocalDateTime value) {
        ZoneId zone = ZoneId.of(config.getTimezone());
        ObjectNode node = event.putObject(field);
        node.put("dateTime", value.atZone(zone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        node.put("timeZone", zone.getId());
    }

    private void putPrivateProps(ObjectNode event, Long companyId, GoogleCalendarEntityType type, Long entityId) {
        ObjectNode props = event.putObject("extendedProperties").putObject("private");
        props.put("calendraTenantId", String.valueOf(companyId));
        props.put("calendraEntityType", type.name());
        props.put("calendraEntityId", String.valueOf(entityId));
        props.put("calendraOrigin", "CALENDRA");
    }

    private static String safe(String value) {
        if (value == null || value.isBlank()) return "Untitled";
        return value.length() > 180 ? value.substring(0, 180) : value;
    }

    public record GoogleCalendarEntityRef(Long companyId, GoogleCalendarEntityType type, Long id) {}
}
