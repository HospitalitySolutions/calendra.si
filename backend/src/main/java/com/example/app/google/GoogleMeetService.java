package com.example.app.google;

import com.example.app.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

/**
 * Creates Google Meet URLs via Google Calendar API.
 * Each consultant must authorize Google (via /api/google/authorize) before creating online sessions.
 */
@Service
public class GoogleMeetService {
    public record MeetingDetails(String externalId, String joinUrl) {}

    private static final Logger log = LoggerFactory.getLogger(GoogleMeetService.class);

    private static final String TOKEN_URL = "https://oauth2.googleapis.com/token";
    private static final String CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    private static final String SCOPES = "https://www.googleapis.com/auth/calendar.events";

    private final GoogleMeetConfig config;
    private final GoogleOAuthTokenRepository tokenRepo;
    private final UserRepository userRepo;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public GoogleMeetService(GoogleMeetConfig config, GoogleOAuthTokenRepository tokenRepo, UserRepository userRepo) {
        this.config = config;
        this.tokenRepo = tokenRepo;
        this.userRepo = userRepo;
    }

    public String createMeetingUrl(Long consultantId, LocalDateTime startTime, LocalDateTime endTime, String topic) {
        return createMeeting(consultantId, startTime, endTime, ZoneId.systemDefault(), topic, null, null).joinUrl();
    }

    public MeetingDetails createMeeting(
            Long consultantId,
            LocalDateTime startTime,
            LocalDateTime endTime,
            ZoneId zoneId,
            String topic,
            String attendeeEmail,
            String description) {
        if (!config.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google Meet is not configured.");
        }
        try {
            String accessToken = getOrRefreshAccessToken(consultantId);
            return createCalendarEventWithMeet(accessToken, startTime, endTime, zoneId, topic, attendeeEmail, description);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to create Google Meet: " + e.getMessage());
        }
    }

    public MeetingDetails updateMeeting(
            Long consultantId,
            String externalId,
            String currentJoinUrl,
            LocalDateTime startTime,
            LocalDateTime endTime,
            ZoneId zoneId,
            String topic,
            String attendeeEmail,
            String description) {
        if (externalId == null || externalId.isBlank()) {
            return createMeeting(consultantId, startTime, endTime, zoneId, topic, attendeeEmail, description);
        }
        try {
            String accessToken = getOrRefreshAccessToken(consultantId);
            // PATCH only the mutable fields. Omitting attendees preserves the existing
            // attendee list and avoids replacing it during a simple time change.
            ObjectNode event = buildCalendarEvent(startTime, endTime, zoneId, topic, null, description, false);
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(accessToken);
            String url = CALENDAR_API + "/" + externalId + "?conferenceDataVersion=1&sendUpdates=all";
            restTemplate.exchange(URI.create(url), HttpMethod.PATCH, new HttpEntity<>(event.toString(), headers), String.class);
            return new MeetingDetails(externalId, currentJoinUrl);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (HttpClientErrorException updateError) {
            // Older or manually changed Google Calendar events can occasionally no
            // longer be patchable. Recreate the event so the public reschedule flow
            // still succeeds and the guest receives a valid Meet link.
            MeetingDetails replacement;
            try {
                replacement = createMeeting(
                        consultantId, startTime, endTime, zoneId, topic, attendeeEmail, description);
            } catch (ResponseStatusException recreateError) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Failed to update Google Meet: " + updateError.getResponseBodyAsString(),
                        recreateError);
            }
            try {
                deleteMeeting(consultantId, externalId);
            } catch (ResponseStatusException cleanupError) {
                log.warn(
                        "Created replacement Google Calendar event but could not remove the old event. consultantId={}, externalId={}, error={}",
                        consultantId, externalId, cleanupError.getReason());
            }
            return replacement;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to update Google Meet: " + e.getMessage());
        }
    }

    public void deleteMeeting(Long consultantId, String externalId) {
        if (externalId == null || externalId.isBlank()) return;
        try {
            String accessToken = getOrRefreshAccessToken(consultantId);
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken);
            restTemplate.exchange(URI.create(CALENDAR_API + "/" + externalId + "?sendUpdates=all"), HttpMethod.DELETE, new HttpEntity<>(headers), Void.class);
        } catch (HttpClientErrorException.NotFound ignored) {
            // Event was already removed in Google Calendar.
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to delete Google Meet: " + e.getMessage());
        }
    }

    public void exchangeCodeForToken(Long userId, String code) throws Exception {
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        String body = "code=" + URLEncoder.encode(code, StandardCharsets.UTF_8)
                + "&client_id=" + URLEncoder.encode(config.getClientId(), StandardCharsets.UTF_8)
                + "&client_secret=" + URLEncoder.encode(config.getClientSecret(), StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(config.getRedirectUri(), StandardCharsets.UTF_8)
                + "&grant_type=authorization_code";
        var request = new HttpEntity<>(body, headers);

        String responseBody;
        try {
            var response = restTemplate.exchange(TOKEN_URL, HttpMethod.POST, request, String.class);
            responseBody = response.getBody();
        } catch (HttpClientErrorException e) {
            String err = e.getResponseBodyAsString();
            throw new RuntimeException("Google token exchange failed: " + (err != null && !err.isBlank() ? err : e.getMessage()));
        }

        var node = objectMapper.readTree(responseBody);
        String accessToken = node.path("access_token").asText();
        String refreshToken = node.has("refresh_token") && !node.path("refresh_token").isNull() ? node.path("refresh_token").asText() : "";
        int expiresIn = node.has("expires_in") ? node.path("expires_in").asInt() : 3600;

        var user = userRepo.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        var existing = tokenRepo.findByUser_Id(userId);
        GoogleOAuthToken token;
        if (existing.isPresent()) {
            token = existing.get();
        } else {
            token = new GoogleOAuthToken();
            token.setUser(user);
        }
        token.setAccessToken(accessToken);
        token.setRefreshToken(refreshToken.isBlank() ? null : refreshToken);
        token.setExpiresAt(Instant.now().plusSeconds(expiresIn - 60));
        tokenRepo.save(token);
    }

    public boolean hasValidToken(Long userId) {
        var opt = tokenRepo.findByUser_Id(userId);
        if (opt.isEmpty()) return false;
        var token = opt.get();
        if (token.getExpiresAt().isBefore(Instant.now())) {
            try {
                refreshToken(token);
            } catch (Exception e) {
                return false;
            }
        }
        return true;
    }

    private String getOrRefreshAccessToken(Long userId) throws Exception {
        var opt = tokenRepo.findByUser_Id(userId);
        if (opt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant has not authorized Google. Please connect Google first.");
        }
        var token = opt.get();
        if (token.getExpiresAt().isBefore(Instant.now())) {
            refreshToken(token);
            token = tokenRepo.findByUser_Id(userId).orElseThrow();
        }
        return token.getAccessToken();
    }

    private void refreshToken(GoogleOAuthToken token) throws Exception {
        if (token.getRefreshToken() == null || token.getRefreshToken().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Google authorization expired. Please reconnect Google.");
        }
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        String body = "client_id=" + URLEncoder.encode(config.getClientId(), StandardCharsets.UTF_8)
                + "&client_secret=" + URLEncoder.encode(config.getClientSecret(), StandardCharsets.UTF_8)
                + "&refresh_token=" + URLEncoder.encode(token.getRefreshToken(), StandardCharsets.UTF_8)
                + "&grant_type=refresh_token";
        var request = new HttpEntity<>(body, headers);
        var response = restTemplate.exchange(TOKEN_URL, HttpMethod.POST, request, String.class);

        var node = objectMapper.readTree(response.getBody());
        token.setAccessToken(node.path("access_token").asText());
        int expiresIn = node.path("expires_in").asInt();
        token.setExpiresAt(Instant.now().plusSeconds(expiresIn - 60));
        tokenRepo.save(token);
    }

    private MeetingDetails createCalendarEventWithMeet(
            String accessToken,
            LocalDateTime startTime,
            LocalDateTime endTime,
            ZoneId zoneId,
            String topic,
            String attendeeEmail,
            String description) throws Exception {
        ObjectNode event = buildCalendarEvent(startTime, endTime, zoneId, topic, attendeeEmail, description, true);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(accessToken);

        String url = CALENDAR_API + "?conferenceDataVersion=1&sendUpdates=all";
        var request = new HttpEntity<>(event.toString(), headers);
        var response = restTemplate.exchange(URI.create(url), HttpMethod.POST, request, String.class);

        var node = objectMapper.readTree(response.getBody());
        String eventId = node.path("id").asText();
        var entryPoints = node.path("conferenceData").path("entryPoints");
        for (var ep : entryPoints) {
            if ("video".equals(ep.path("entryPointType").asText(null))) {
                return new MeetingDetails(eventId, ep.path("uri").asText());
            }
        }
        String fallback = node.path("hangoutLink").asText();
        if (!fallback.isBlank()) return new MeetingDetails(eventId, fallback);
        throw new RuntimeException("No Google Meet link in response");
    }

    private ObjectNode buildCalendarEvent(
            LocalDateTime startTime,
            LocalDateTime endTime,
            ZoneId zoneId,
            String topic,
            String attendeeEmail,
            String description,
            boolean includeConferenceRequest) {
        ZoneId effectiveZone = zoneId == null ? ZoneId.systemDefault() : zoneId;
        String startIso = startTime.atZone(effectiveZone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        String endIso = endTime.atZone(effectiveZone).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);

        ObjectNode event = objectMapper.createObjectNode();
        event.put("summary", topic);
        if (description != null && !description.isBlank()) event.put("description", description);
        ObjectNode start = event.putObject("start");
        start.put("dateTime", startIso);
        start.put("timeZone", effectiveZone.getId());
        ObjectNode end = event.putObject("end");
        end.put("dateTime", endIso);
        end.put("timeZone", effectiveZone.getId());
        if (attendeeEmail != null && !attendeeEmail.isBlank()) {
            event.putArray("attendees").addObject().put("email", attendeeEmail.trim());
        }
        if (includeConferenceRequest) {
            ObjectNode conferenceData = event.putObject("conferenceData");
            ObjectNode createRequest = conferenceData.putObject("createRequest");
            createRequest.put("requestId", UUID.randomUUID().toString());
            createRequest.putObject("conferenceSolutionKey").put("type", "hangoutsMeet");
        }
        return event;
    }

}
