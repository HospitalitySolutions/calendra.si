package com.example.app.zoom;

import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
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
 * Creates Zoom meeting URLs using OAuth 2.0 authorization code flow.
 * Each consultant must authorize Zoom (via /api/zoom/authorize) before creating online sessions.
 */
@Service
public class ZoomService {
    private static final String TOKEN_URL = "https://zoom.us/oauth/token";
    private static final String API_BASE = "https://api.zoom.us/v2";

    private final ZoomConfig config;
    private final ZoomOAuthTokenRepository tokenRepo;
    private final UserRepository userRepo;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ZoomService(ZoomConfig config, ZoomOAuthTokenRepository tokenRepo, UserRepository userRepo) {
        this.config = config;
        this.tokenRepo = tokenRepo;
        this.userRepo = userRepo;
    }

    /**
     * Create a Zoom meeting for the given consultant. Uses the consultant's OAuth token.
     * The consultant must have authorized Zoom first via /api/zoom/authorize.
     */
    public String createMeetingUrl(Long consultantId, LocalDateTime startTime, LocalDateTime endTime, String topic) {
        if (!config.isConfigured()) {
            var meetingId = String.format("%010d", Math.abs(UUID.randomUUID().getMostSignificantBits()) % 1_000_000_000L);
            return "https://zoom.us/j/" + meetingId;
        }
        try {
            String accessToken = getOrRefreshAccessToken(consultantId);
            return createMeeting(accessToken, startTime, endTime, topic);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to create Zoom meeting: " + e.getMessage());
        }
    }

    /**
     * Exchange authorization code for tokens and store for the user.
     */
    public void exchangeCodeForToken(Long userId, String code) throws Exception {
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        String auth = config.getClientId() + ":" + config.getClientSecret();
        headers.set("Authorization", "Basic " + Base64.getEncoder().encodeToString(auth.getBytes(StandardCharsets.UTF_8)));

        String body = "grant_type=authorization_code&code=" + URLEncoder.encode(code, StandardCharsets.UTF_8)
                + "&redirect_uri=" + URLEncoder.encode(config.getRedirectUri(), StandardCharsets.UTF_8);
        var request = new HttpEntity<>(body, headers);

        String responseBody;
        try {
            var response = restTemplate.exchange(TOKEN_URL, HttpMethod.POST, request, String.class);
            responseBody = response.getBody();
        } catch (HttpClientErrorException e) {
            String zoomError = e.getResponseBodyAsString();
            throw new RuntimeException("Zoom token exchange failed: " + (zoomError != null && !zoomError.isBlank() ? zoomError : e.getMessage()));
        }

        var node = objectMapper.readTree(responseBody);
        String accessToken = node.path("access_token").asText();
        String refreshToken = node.has("refresh_token") && !node.path("refresh_token").isNull() ? node.path("refresh_token").asText() : "";
        int expiresIn = node.has("expires_in") ? node.path("expires_in").asInt() : 3600;

        var user = userRepo.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        var existing = tokenRepo.findByUser_Id(userId);
        ZoomOAuthToken token;
        if (existing.isPresent()) {
            token = existing.get();
        } else {
            token = new ZoomOAuthToken();
            token.setUser(user);
        }
        token.setAccessToken(accessToken);
        token.setRefreshToken(refreshToken.isBlank() ? null : refreshToken);
        token.setExpiresAt(Instant.now().plusSeconds(expiresIn - 60)); // refresh 1 min before expiry
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
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant has not authorized Zoom. Please connect Zoom first.");
        }
        var token = opt.get();
        if (token.getExpiresAt().isBefore(Instant.now())) {
            refreshToken(token);
            token = tokenRepo.findByUser_Id(userId).orElseThrow();
        }
        return token.getAccessToken();
    }

    private void refreshToken(ZoomOAuthToken token) throws Exception {
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        String auth = config.getClientId() + ":" + config.getClientSecret();
        headers.set("Authorization", "Basic " + Base64.getEncoder().encodeToString(auth.getBytes(StandardCharsets.UTF_8)));

        String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(token.getRefreshToken(), StandardCharsets.UTF_8);
        var request = new HttpEntity<>(body, headers);
        var response = restTemplate.exchange(TOKEN_URL, HttpMethod.POST, request, String.class);

        var node = objectMapper.readTree(response.getBody());
        token.setAccessToken(node.path("access_token").asText());
        if (node.has("refresh_token") && !node.path("refresh_token").isNull()) {
            token.setRefreshToken(node.path("refresh_token").asText());
        }
        int expiresIn = node.path("expires_in").asInt();
        token.setExpiresAt(Instant.now().plusSeconds(expiresIn - 60));
        tokenRepo.save(token);
    }

    private String createMeeting(String accessToken, LocalDateTime startTime, LocalDateTime endTime, String topic) throws Exception {
        long durationMinutes = java.time.Duration.between(startTime, endTime).toMinutes();
        if (durationMinutes <= 0) durationMinutes = 60;

        String startTimeIso = startTime.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);

        var payload = String.format(
            "{\"topic\":\"%s\",\"type\":2,\"start_time\":\"%s\",\"duration\":%d,\"timezone\":\"%s\"}",
            topic.replace("\"", "\\\""),
            startTimeIso,
            (int) durationMinutes,
            ZoneId.systemDefault().getId()
        );

        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(accessToken);

        // "me" = the user whose token we have (the consultant who authorized Zoom)
        var url = API_BASE + "/users/me/meetings";
        var request = new HttpEntity<>(payload, headers);
        var response = restTemplate.exchange(URI.create(url), HttpMethod.POST, request, String.class);

        var node = objectMapper.readTree(response.getBody());
        return node.path("join_url").asText();
    }
}
