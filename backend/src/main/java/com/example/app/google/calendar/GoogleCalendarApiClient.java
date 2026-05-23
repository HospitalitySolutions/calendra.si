package com.example.app.google.calendar;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class GoogleCalendarApiClient {
    private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
    private static final String CALENDAR_API = "https://www.googleapis.com/calendar/v3";

    private final GoogleCalendarConfig config;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public GoogleCalendarApiClient(GoogleCalendarConfig config) { this.config = config; }

    public TokenResponse exchangeCode(String code) throws Exception {
        HttpHeaders headers = formHeaders();
        String body = "code=" + enc(code) + "&client_id=" + enc(config.getClientId()) + "&client_secret=" + enc(config.getClientSecret()) + "&redirect_uri=" + enc(config.getRedirectUri()) + "&grant_type=authorization_code";
        JsonNode node = objectMapper.readTree(restTemplate.exchange(TOKEN_URL, HttpMethod.POST, new HttpEntity<>(body, headers), String.class).getBody());
        return new TokenResponse(node.path("access_token").asText(), node.path("refresh_token").isMissingNode() || node.path("refresh_token").isNull() ? null : node.path("refresh_token").asText(), node.path("expires_in").asLong(3600), node.path("scope").asText(null));
    }

    public TokenResponse refresh(String refreshToken) throws Exception {
        HttpHeaders headers = formHeaders();
        String body = "client_id=" + enc(config.getClientId()) + "&client_secret=" + enc(config.getClientSecret()) + "&refresh_token=" + enc(refreshToken) + "&grant_type=refresh_token";
        JsonNode node = objectMapper.readTree(restTemplate.exchange(TOKEN_URL, HttpMethod.POST, new HttpEntity<>(body, headers), String.class).getBody());
        return new TokenResponse(node.path("access_token").asText(), null, node.path("expires_in").asLong(3600), node.path("scope").asText(null));
    }

    public String getAccountEmail(String accessToken) throws Exception {
        JsonNode node = objectMapper.readTree(restTemplate.exchange(USERINFO_URL, HttpMethod.GET, new HttpEntity<>(authHeaders(accessToken)), String.class).getBody());
        return node.path("email").asText(null);
    }

    public List<CalendarSummary> listCalendars(String accessToken) throws Exception {
        JsonNode root = objectMapper.readTree(restTemplate.exchange(CALENDAR_API + "/users/me/calendarList", HttpMethod.GET, new HttpEntity<>(authHeaders(accessToken)), String.class).getBody());
        List<CalendarSummary> out = new ArrayList<>();
        for (JsonNode item : root.path("items")) {
            out.add(new CalendarSummary(item.path("id").asText(), item.path("summary").asText(item.path("id").asText()), item.path("primary").asBoolean(false), item.path("accessRole").asText(null)));
        }
        return out;
    }

    public JsonNode insertEvent(String accessToken, String calendarId, ObjectNode event) throws Exception {
        return sendJson(accessToken, HttpMethod.POST, CALENDAR_API + "/calendars/" + path(calendarId) + "/events?conferenceDataVersion=1", event);
    }

    public JsonNode updateEvent(String accessToken, String calendarId, String eventId, ObjectNode event) throws Exception {
        return sendJson(accessToken, HttpMethod.PUT, CALENDAR_API + "/calendars/" + path(calendarId) + "/events/" + path(eventId) + "?conferenceDataVersion=1", event);
    }

    public void deleteEvent(String accessToken, String calendarId, String eventId) throws Exception {
        try {
            restTemplate.exchange(URI.create(CALENDAR_API + "/calendars/" + path(calendarId) + "/events/" + path(eventId)), HttpMethod.DELETE, new HttpEntity<>(authHeaders(accessToken)), String.class);
        } catch (HttpClientErrorException.NotFound ignored) {}
    }

    public EventsPage listEvents(String accessToken, String calendarId, String syncToken, String pageToken) throws Exception {
        UriComponentsBuilder b = UriComponentsBuilder.fromHttpUrl(CALENDAR_API + "/calendars/" + path(calendarId) + "/events")
                .queryParam("singleEvents", "true")
                .queryParam("showDeleted", "true")
                .queryParam("maxResults", "250");
        if (pageToken != null && !pageToken.isBlank()) b.queryParam("pageToken", pageToken);
        if (syncToken != null && !syncToken.isBlank()) {
            b.queryParam("syncToken", syncToken);
        } else {
            b.queryParam("timeMin", Instant.now().minusSeconds(config.getFullSyncLookbackDays() * 24L * 60L * 60L).toString());
        }
        try {
            JsonNode root = objectMapper.readTree(restTemplate.exchange(b.build(true).toUri(), HttpMethod.GET, new HttpEntity<>(authHeaders(accessToken)), String.class).getBody());
            List<JsonNode> events = new ArrayList<>();
            for (JsonNode item : root.path("items")) events.add(item);
            return new EventsPage(events, root.path("nextSyncToken").asText(null), root.path("nextPageToken").asText(null));
        } catch (HttpClientErrorException.Gone gone) {
            throw new GoogleCalendarSyncTokenExpiredException("Google Calendar sync token expired. Full sync is required.");
        }
    }

    public WatchResponse watchEvents(String accessToken, String calendarId, Long connectionId) throws Exception {
        if (config.getWebhookUrl() == null || config.getWebhookUrl().isBlank()) throw new IllegalStateException("GOOGLE_CALENDAR_WEBHOOK_URL is not configured.");
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("type", "web_hook");
        payload.put("address", config.getWebhookUrl());
        if (config.getWebhookToken() != null && !config.getWebhookToken().isBlank()) payload.put("token", config.getWebhookToken() + ":" + connectionId);
        JsonNode r = sendJson(accessToken, HttpMethod.POST, CALENDAR_API + "/calendars/" + path(calendarId) + "/events/watch", payload);
        long exp = r.path("expiration").asLong(0);
        return new WatchResponse(r.path("id").asText(null), r.path("resourceId").asText(null), exp > 0 ? Instant.ofEpochMilli(exp) : null);
    }


    public void stopChannel(String accessToken, String channelId, String resourceId) {
        if (channelId == null || channelId.isBlank() || resourceId == null || resourceId.isBlank()) return;
        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("id", channelId);
            payload.put("resourceId", resourceId);
            HttpHeaders headers = authHeaders(accessToken);
            headers.setContentType(MediaType.APPLICATION_JSON);
            restTemplate.exchange(URI.create(CALENDAR_API + "/channels/stop"), HttpMethod.POST, new HttpEntity<>(payload.toString(), headers), String.class);
        } catch (Exception ignored) {
            // A missing/expired channel should not break reconnect, disconnect, or watch renewal.
        }
    }

    private JsonNode sendJson(String token, HttpMethod method, String url, ObjectNode body) throws Exception {
        HttpHeaders headers = authHeaders(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return objectMapper.readTree(restTemplate.exchange(URI.create(url), method, new HttpEntity<>(body.toString(), headers), String.class).getBody());
    }
    private static HttpHeaders formHeaders() { HttpHeaders h = new HttpHeaders(); h.setContentType(MediaType.APPLICATION_FORM_URLENCODED); return h; }
    private static HttpHeaders authHeaders(String token) { HttpHeaders h = new HttpHeaders(); h.setBearerAuth(token); h.setAccept(List.of(MediaType.APPLICATION_JSON)); return h; }
    private static String enc(String v) { return URLEncoder.encode(v == null ? "" : v, StandardCharsets.UTF_8); }
    private static String path(String v) { return URLEncoder.encode(v == null ? "primary" : v, StandardCharsets.UTF_8).replace("+", "%20"); }

    public record TokenResponse(String accessToken, String refreshToken, long expiresIn, String scopes) {}
    public record CalendarSummary(String id, String summary, boolean primary, String accessRole) {}
    public record EventsPage(List<JsonNode> events, String nextSyncToken, String nextPageToken) {}
    public record WatchResponse(String channelId, String resourceId, Instant expiresAt) {}
}
