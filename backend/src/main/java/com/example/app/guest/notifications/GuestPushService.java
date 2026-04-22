package com.example.app.guest.notifications;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.guest.model.GuestDevicePlatform;
import com.example.app.guest.model.GuestDeviceToken;
import com.example.app.guest.model.GuestDeviceTokenRepository;
import com.example.app.guest.model.GuestUser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class GuestPushService {
    private static final Logger log = LoggerFactory.getLogger(GuestPushService.class);
    private static final String APNS_PRODUCTION_URL = "https://api.push.apple.com/3/device/";
    private static final String APNS_SANDBOX_URL = "https://api.sandbox.push.apple.com/3/device/";

    private final GuestDeviceTokenRepository deviceTokens;
    private final GuestPushProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    private volatile CachedGoogleToken cachedGoogleToken;
    private volatile CachedApnsJwt cachedApnsJwt;

    public GuestPushService(
            GuestDeviceTokenRepository deviceTokens,
            GuestPushProperties properties,
            ObjectMapper objectMapper
    ) {
        this.deviceTokens = deviceTokens;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .connectTimeout(Duration.ofSeconds(Math.max(3, properties.getConnectTimeoutSeconds())))
                .build();
    }

    public DeliveryResult notifyGuestMessage(GuestUser guestUser, Company company, Client client, String title, String body) {
        if (!guestUser.isNotifyMessagesEnabled()) {
            log.info("Guest push delivery skipped because guest has disabled message notifications guestUserId={}, companyId={}, clientId={}",
                    guestUser.getId(), company.getId(), client.getId());
            return DeliveryResult.none();
        }
        Map<String, String> data = Map.of(
                "type", "guest_chat_message",
                "companyId", String.valueOf(company.getId()),
                "clientId", String.valueOf(client.getId()),
                "channel", "GUEST_APP",
                "screen", "inbox",
                "title", title,
                "body", body
        );
        return dispatch(guestUser, company, client, title, body, data, "guest_messages");
    }

    public DeliveryResult notifyGuestReminder(
            GuestUser guestUser,
            Company company,
            Client client,
            String title,
            String body,
            Map<String, String> extraData
    ) {
        if (!guestUser.isNotifyRemindersEnabled()) {
            log.info("Guest push reminder skipped because guest has disabled reminder notifications guestUserId={}, companyId={}",
                    guestUser.getId(), company == null ? null : company.getId());
            return DeliveryResult.none();
        }
        Map<String, String> data = new LinkedHashMap<>();
        data.put("type", "guest_reminder");
        data.put("channel", "GUEST_APP");
        data.put("screen", "home");
        data.put("title", title);
        data.put("body", body);
        if (company != null) data.put("companyId", String.valueOf(company.getId()));
        if (client != null) data.put("clientId", String.valueOf(client.getId()));
        if (extraData != null) {
            for (Map.Entry<String, String> entry : extraData.entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null) {
                    data.put(entry.getKey(), entry.getValue());
                }
            }
        }
        return dispatch(guestUser, company, client, title, body, data, "guest_reminders");
    }

    private DeliveryResult dispatch(
            GuestUser guestUser,
            Company company,
            Client client,
            String title,
            String body,
            Map<String, String> data,
            String androidChannelId
    ) {
        List<GuestDeviceToken> devices = deviceTokens.findAllByGuestUserIdOrderByUpdatedAtDesc(guestUser.getId()).stream()
                .filter(token -> token.getPushToken() != null && !token.getPushToken().isBlank())
                .toList();
        if (devices.isEmpty()) {
            log.info("Guest push has no registered devices guestUserId={}, companyId={}, clientId={}",
                    guestUser.getId(),
                    company == null ? null : company.getId(),
                    client == null ? null : client.getId());
            return DeliveryResult.none();
        }

        if (!properties.isEnabled()) {
            log.info("Guest push delivery skipped because app.guest.push.enabled=false guestUserId={}, companyId={}, clientId={}, deviceCount={}",
                    guestUser.getId(),
                    company == null ? null : company.getId(),
                    client == null ? null : client.getId(),
                    devices.size());
            return DeliveryResult.none();
        }

        int deliveredCount = 0;
        int failedCount = 0;
        int invalidTokenCount = 0;

        for (GuestDeviceToken device : devices) {
            try {
                DeliveryAttempt attempt = switch (device.getPlatform()) {
                    case ANDROID -> sendFcm(device, title, body, data, androidChannelId);
                    case IOS -> sendApns(device, title, body, data);
                };
                if (attempt == DeliveryAttempt.DELIVERED) deliveredCount++;
                else if (attempt == DeliveryAttempt.INVALID_TOKEN) invalidTokenCount++;
            } catch (Exception ex) {
                failedCount++;
                log.warn("Guest push delivery failed platform={}, guestUserId={}, companyId={}, clientId={}, tokenSuffix={}, reason={}",
                        device.getPlatform(),
                        guestUser.getId(),
                        company == null ? null : company.getId(),
                        client == null ? null : client.getId(),
                        tokenSuffix(device.getPushToken()),
                        safeMessage(ex));
            }
        }
        return new DeliveryResult(devices.size(), deliveredCount, invalidTokenCount, failedCount);
    }

    private DeliveryAttempt sendFcm(GuestDeviceToken device, String title, String body, Map<String, String> data, String channelId) throws Exception {
        ServiceAccount serviceAccount = resolveServiceAccount();
        if (serviceAccount == null) {
            log.debug("FCM delivery skipped because FCM credentials are not configured tokenSuffix={}", tokenSuffix(device.getPushToken()));
            return DeliveryAttempt.SKIPPED;
        }
        String accessToken = resolveGoogleAccessToken(serviceAccount);
        Map<String, Object> payload = Map.of(
                "message", Map.of(
                        "token", device.getPushToken(),
                        "notification", Map.of("title", title, "body", body),
                        "data", data,
                        "android", Map.of(
                                "priority", "high",
                                "notification", Map.of("channel_id", channelId == null || channelId.isBlank() ? "guest_messages" : channelId)
                        )
                )
        );
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://fcm.googleapis.com/v1/projects/" + serviceAccount.projectId() + "/messages:send"))
                .timeout(Duration.ofSeconds(Math.max(5, properties.getConnectTimeoutSeconds())))
                .header("Authorization", "Bearer " + accessToken)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            log.debug("FCM delivered tokenSuffix={} status={}", tokenSuffix(device.getPushToken()), response.statusCode());
            return DeliveryAttempt.DELIVERED;
        }
        if (isFcmTokenInvalid(response.body())) {
            deviceTokens.deleteByPushToken(device.getPushToken());
            log.info("Removed invalid FCM token tokenSuffix={} status={} body={}", tokenSuffix(device.getPushToken()), response.statusCode(), truncate(response.body(), 400));
            return DeliveryAttempt.INVALID_TOKEN;
        }
        throw new IOException("FCM returned " + response.statusCode() + ": " + truncate(response.body(), 600));
    }

    private DeliveryAttempt sendApns(GuestDeviceToken device, String title, String body, Map<String, String> data) throws Exception {
        GuestPushProperties.Apns cfg = properties.getApns();
        if (isBlank(cfg.getTeamId()) || isBlank(cfg.getKeyId()) || isBlank(cfg.getBundleId()) || resolveApnsPrivateKey() == null) {
            log.debug("APNS delivery skipped because APNS credentials are not configured tokenSuffix={}", tokenSuffix(device.getPushToken()));
            return DeliveryAttempt.SKIPPED;
        }
        String providerToken = resolveApnsJwt();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("aps", Map.of(
                "alert", Map.of("title", title, "body", body),
                "sound", "default"
        ));
        payload.putAll(data);

        String baseUrl = cfg.isUseSandbox() ? APNS_SANDBOX_URL : APNS_PRODUCTION_URL;
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + device.getPushToken()))
                .timeout(Duration.ofSeconds(Math.max(5, properties.getConnectTimeoutSeconds())))
                .header("authorization", "bearer " + providerToken)
                .header("apns-topic", cfg.getBundleId().trim())
                .header("apns-push-type", "alert")
                .header("apns-priority", "10")
                .header("content-type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            log.debug("APNS delivered tokenSuffix={} status={}", tokenSuffix(device.getPushToken()), response.statusCode());
            return DeliveryAttempt.DELIVERED;
        }
        if (isApnsTokenInvalid(response.statusCode(), response.body())) {
            deviceTokens.deleteByPushToken(device.getPushToken());
            log.info("Removed invalid APNS token tokenSuffix={} status={} body={}", tokenSuffix(device.getPushToken()), response.statusCode(), truncate(response.body(), 400));
            return DeliveryAttempt.INVALID_TOKEN;
        }
        throw new IOException("APNS returned " + response.statusCode() + ": " + truncate(response.body(), 600));
    }

    private synchronized String resolveGoogleAccessToken(ServiceAccount serviceAccount) throws Exception {
        Instant now = Instant.now();
        if (cachedGoogleToken != null && cachedGoogleToken.expiresAt().isAfter(now.plusSeconds(60))) {
            return cachedGoogleToken.accessToken();
        }
        Instant issuedAt = now;
        Instant expiresAt = now.plusSeconds(3600);
        String assertion = Jwts.builder()
                .issuer(serviceAccount.clientEmail())
                .subject(serviceAccount.clientEmail())
                .audience().add(serviceAccount.tokenUri()).and()
                .claim("scope", serviceAccount.scope())
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(expiresAt))
                .signWith(serviceAccount.privateKey(), SignatureAlgorithm.RS256)
                .compact();

        String form = "grant_type=" + urlEncode("urn:ietf:params:oauth:grant-type:jwt-bearer")
                + "&assertion=" + urlEncode(assertion);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(serviceAccount.tokenUri()))
                .timeout(Duration.ofSeconds(Math.max(5, properties.getConnectTimeoutSeconds())))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("Google OAuth token exchange failed with status " + response.statusCode() + ": " + truncate(response.body(), 600));
        }
        JsonNode root = objectMapper.readTree(response.body());
        String accessToken = text(root, "access_token");
        long ttlSeconds = root.path("expires_in").asLong(3600);
        if (isBlank(accessToken)) throw new IOException("Google OAuth token exchange returned no access token.");
        cachedGoogleToken = new CachedGoogleToken(accessToken, now.plusSeconds(Math.max(300, ttlSeconds)));
        return accessToken;
    }

    private synchronized String resolveApnsJwt() throws Exception {
        Instant now = Instant.now();
        if (cachedApnsJwt != null && cachedApnsJwt.expiresAt().isAfter(now.plusSeconds(60))) {
            return cachedApnsJwt.token();
        }
        GuestPushProperties.Apns cfg = properties.getApns();
        PrivateKey privateKey = resolveApnsPrivateKey();
        if (privateKey == null) throw new IOException("APNS private key is not configured.");
        String token = Jwts.builder()
                .header().keyId(cfg.getKeyId().trim()).and()
                .issuer(cfg.getTeamId().trim())
                .issuedAt(Date.from(now))
                .signWith(privateKey, SignatureAlgorithm.ES256)
                .compact();
        cachedApnsJwt = new CachedApnsJwt(token, now.plusSeconds(45 * 60));
        return token;
    }

    private ServiceAccount resolveServiceAccount() {
        try {
            GuestPushProperties.Fcm cfg = properties.getFcm();
            String rawJson = firstNonBlank(
                    cfg.getServiceAccountJson(),
                    decodeBase64OrNull(cfg.getServiceAccountJsonBase64()),
                    readFileOrNull(cfg.getServiceAccountFile())
            );
            if (isBlank(rawJson)) return null;
            JsonNode root = objectMapper.readTree(rawJson);
            String clientEmail = text(root, "client_email");
            String privateKeyPem = text(root, "private_key");
            String projectId = firstNonBlank(cfg.getProjectId(), text(root, "project_id"));
            String tokenUri = firstNonBlank(cfg.getTokenUri(), text(root, "token_uri"), "https://oauth2.googleapis.com/token");
            if (isBlank(clientEmail) || isBlank(privateKeyPem) || isBlank(projectId)) return null;
            return new ServiceAccount(
                    projectId.trim(),
                    clientEmail.trim(),
                    parsePrivateKey(privateKeyPem, "RSA"),
                    tokenUri.trim(),
                    firstNonBlank(cfg.getScope(), "https://www.googleapis.com/auth/firebase.messaging")
            );
        } catch (Exception ex) {
            log.warn("Unable to load FCM service account credentials: {}", safeMessage(ex));
            return null;
        }
    }

    private PrivateKey resolveApnsPrivateKey() {
        try {
            GuestPushProperties.Apns cfg = properties.getApns();
            String pem = firstNonBlank(
                    cfg.getPrivateKeyPem(),
                    decodeBase64OrNull(cfg.getPrivateKeyBase64()),
                    readFileOrNull(cfg.getPrivateKeyFile())
            );
            return isBlank(pem) ? null : parsePrivateKey(pem, "EC");
        } catch (Exception ex) {
            log.warn("Unable to load APNS private key: {}", safeMessage(ex));
            return null;
        }
    }

    private PrivateKey parsePrivateKey(String pem, String algorithm) throws Exception {
        String normalized = pem
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace("-----BEGIN EC PRIVATE KEY-----", "")
                .replace("-----END EC PRIVATE KEY-----", "")
                .replace("\r", "")
                .replace("\n", "")
                .trim();
        byte[] bytes = Base64.getDecoder().decode(normalized);
        return KeyFactory.getInstance(algorithm).generatePrivate(new PKCS8EncodedKeySpec(bytes));
    }

    private boolean isApnsTokenInvalid(int status, String body) {
        if (status == 410) return true;
        String reason = null;
        try {
            JsonNode root = objectMapper.readTree(body);
            reason = text(root, "reason");
        } catch (Exception ignore) {
        }
        return status == 400 && ("BadDeviceToken".equals(reason) || "DeviceTokenNotForTopic".equals(reason) || "Unregistered".equals(reason));
    }

    private boolean isFcmTokenInvalid(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            String status = root.path("error").path("status").asText("");
            String message = root.path("error").path("message").asText("");
            if ("UNREGISTERED".equals(status)) return true;
            return "INVALID_ARGUMENT".equals(status)
                    && (message.contains("registration token") || message.contains("Requested entity was not found"));
        } catch (Exception ignore) {
            return false;
        }
    }

    private static String text(JsonNode root, String field) {
        JsonNode node = root.path(field);
        return node.isMissingNode() || node.isNull() ? null : node.asText(null);
    }

    private static String tokenSuffix(String token) {
        if (token == null || token.isBlank()) return "n/a";
        int keep = Math.min(8, token.length());
        return token.substring(token.length() - keep);
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private static String decodeBase64OrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static String readFileOrNull(String path) {
        if (path == null || path.isBlank()) return null;
        try {
            return Files.readString(Path.of(path.trim()));
        } catch (IOException ex) {
            return null;
        }
    }

    private static String truncate(String value, int maxLen) {
        if (value == null || value.length() <= maxLen) return value;
        return value.substring(0, maxLen) + "…";
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String safeMessage(Throwable throwable) {
        return throwable == null || throwable.getMessage() == null || throwable.getMessage().isBlank()
                ? throwable == null ? "unknown" : throwable.getClass().getSimpleName()
                : throwable.getMessage();
    }

    public record DeliveryResult(int attemptedCount, int deliveredCount, int invalidTokenCount, int failedCount) {
        public static DeliveryResult none() { return new DeliveryResult(0, 0, 0, 0); }
        public boolean delivered() { return deliveredCount > 0; }
    }

    private enum DeliveryAttempt {
        DELIVERED,
        INVALID_TOKEN,
        SKIPPED
    }

    private record CachedGoogleToken(String accessToken, Instant expiresAt) {}
    private record CachedApnsJwt(String token, Instant expiresAt) {}
    private record ServiceAccount(String projectId, String clientEmail, PrivateKey privateKey, String tokenUri, String scope) {}
}
