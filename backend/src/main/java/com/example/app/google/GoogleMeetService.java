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
        if (!config.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google Meet is not configured.");
        }
        try {
            String accessToken = getOrRefreshAccessToken(consultantId);
            return createCalendarEventWithMeet(accessToken, startTime, endTime, topic);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to create Google Meet: " + e.getMessage());
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

    private String createCalendarEventWithMeet(String accessToken, LocalDateTime startTime, LocalDateTime endTime, String topic) throws Exception {
        String zoneId = ZoneId.systemDefault().getId();
        String startIso = startTime.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        String endIso = endTime.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);

        ObjectNode event = objectMapper.createObjectNode();
        event.put("summary", topic);
        ObjectNode start = event.putObject("start");
        start.put("dateTime", startIso);
        start.put("timeZone", zoneId);
        ObjectNode end = event.putObject("end");
        end.put("dateTime", endIso);
        end.put("timeZone", zoneId);
        ObjectNode conferenceData = event.putObject("conferenceData");
        ObjectNode createRequest = conferenceData.putObject("createRequest");
        createRequest.put("requestId", UUID.randomUUID().toString());
        createRequest.putObject("conferenceSolutionKey").put("type", "hangoutsMeet");

        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(accessToken);

        String url = CALENDAR_API + "?conferenceDataVersion=1";
        var request = new HttpEntity<>(event.toString(), headers);
        var response = restTemplate.exchange(URI.create(url), HttpMethod.POST, request, String.class);

        var node = objectMapper.readTree(response.getBody());
        var entryPoints = node.path("conferenceData").path("entryPoints");
        for (var ep : entryPoints) {
            if ("video".equals(ep.path("entryPointType").asText(null))) {
                return ep.path("uri").asText();
            }
        }
        throw new RuntimeException("No Google Meet link in response");
    }
}
