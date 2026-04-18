package com.example.app.securitycenter;

import com.example.app.mfa.WebAuthnCredential;
import com.example.app.mfa.WebAuthnCredentialRepository;
import com.example.app.mfa.WebAuthnService;
import com.example.app.security.JwtService;
import com.example.app.user.User;
import jakarta.servlet.http.HttpServletRequest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SecurityCenterService {

    public record AlertsView(boolean factorChangeAlertsEnabled, boolean suspiciousSignInAlertsEnabled) {}
    public record PasskeyView(String credentialId, String label, boolean discoverable, Instant createdAt, Instant lastUsedAt, String kind) {}
    public record SessionView(String sessionKey, String label, String ipAddress, Instant issuedAt, Instant lastSeenAt, boolean current, boolean revoked) {}
    public record ActivityView(String type, String title, String detail, Instant occurredAt, String riskLevel) {}
    public record OverviewView(List<PasskeyView> passkeys,
                               int recoveryCodesRemaining,
                               List<SessionView> sessions,
                               List<ActivityView> activity,
                               AlertsView alerts,
                               int passkeyCount,
                               int activeSessionCount) {}
    public record IssuedSession(String token, String sessionKey, boolean suspicious) {}

    private final WebAuthnService webAuthnService;
    private final WebAuthnCredentialRepository credentialRepository;
    private final UserSecuritySessionRepository sessionRepository;
    private final SecurityActivityEventRepository activityRepository;
    private final SecurityAlertPreferenceRepository alertPreferenceRepository;
    private final SecurityNotificationService notificationService;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();

    public SecurityCenterService(
            WebAuthnService webAuthnService,
            WebAuthnCredentialRepository credentialRepository,
            UserSecuritySessionRepository sessionRepository,
            SecurityActivityEventRepository activityRepository,
            SecurityAlertPreferenceRepository alertPreferenceRepository,
            SecurityNotificationService notificationService,
            JwtService jwtService,
            PasswordEncoder passwordEncoder
    ) {
        this.webAuthnService = webAuthnService;
        this.credentialRepository = credentialRepository;
        this.sessionRepository = sessionRepository;
        this.activityRepository = activityRepository;
        this.alertPreferenceRepository = alertPreferenceRepository;
        this.notificationService = notificationService;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public OverviewView getOverview(User user, String currentSessionKey) {
        WebAuthnService.StatusResult status = webAuthnService.getStatus(user);
        List<PasskeyView> passkeys = credentialRepository.findAllByUserOrderByCreatedAtAsc(user).stream()
                .map(credential -> new PasskeyView(
                        credential.getCredentialId(),
                        credential.getLabel(),
                        credential.isDiscoverable(),
                        credential.getCreatedAt(),
                        credential.getLastUsedAt(),
                        credential.isDiscoverable() ? "Passkey on your device" : "Hardware security key"
                ))
                .toList();

        List<SessionView> sessions = sessionRepository.findAllByUserOrderByLastSeenAtDesc(user).stream()
                .limit(20)
                .map(session -> new SessionView(
                        session.getSessionKey(),
                        safeLabel(session),
                        session.getIpAddress(),
                        session.getIssuedAt(),
                        session.getLastSeenAt(),
                        currentSessionKey != null && currentSessionKey.equals(session.getSessionKey()),
                        session.getRevokedAt() != null
                ))
                .toList();

        List<ActivityView> activity = activityRepository.findTop20ByUserOrderByOccurredAtDesc(user).stream()
                .map(event -> new ActivityView(
                        event.getEventType().name(),
                        event.getTitle(),
                        event.getDetail(),
                        event.getOccurredAt(),
                        event.getRiskLevel()
                ))
                .toList();

        AlertsView alerts = getAlerts(user);
        int activeSessions = (int) sessions.stream().filter(session -> !session.revoked()).count();
        return new OverviewView(passkeys, status.recoveryCodesRemaining(), sessions, activity, alerts, passkeys.size(), activeSessions);
    }

    @Transactional
    public String reauthenticate(User user, String password, HttpServletRequest request) {
        if (password == null || password.isBlank() || !passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new IllegalArgumentException("Your password was not accepted.");
        }
        logEvent(user, SecurityEventType.REAUTH_SUCCEEDED, "Re-authentication confirmed", "Sensitive security actions are now unlocked for a short time.", "info", request);
        return jwtService.generateReauthToken(user.getId());
    }

    public void requireRecentReauth(User user, String reauthToken) {
        if (reauthToken == null || reauthToken.isBlank()) {
            throw new IllegalArgumentException("Re-authentication required.");
        }
        JwtService.ReauthTokenPayload payload = jwtService.parseReauthToken(reauthToken);
        if (!user.getId().equals(payload.userId())) {
            throw new IllegalArgumentException("Re-authentication token does not match this account.");
        }
    }

    @Transactional
    public AlertsView updateAlertPreferences(User user, boolean factorChangeAlertsEnabled, boolean suspiciousSignInAlertsEnabled, HttpServletRequest request) {
        SecurityAlertPreference preference = alertPreferenceRepository.findByUser(user).orElseGet(() -> {
            SecurityAlertPreference created = new SecurityAlertPreference();
            created.setUser(user);
            return created;
        });
        preference.setFactorChangeAlertsEnabled(factorChangeAlertsEnabled);
        preference.setSuspiciousSignInAlertsEnabled(suspiciousSignInAlertsEnabled);
        alertPreferenceRepository.save(preference);
        logEvent(user, SecurityEventType.ALERT_PREFERENCES_UPDATED, "Security alerts updated", alertSummary(preference), "info", request);
        return new AlertsView(preference.isFactorChangeAlertsEnabled(), preference.isSuspiciousSignInAlertsEnabled());
    }

    @Transactional
    public WebAuthnService.RegistrationStartResult startPasskeyRegistration(User user) {
        return webAuthnService.startRegistration(user);
    }

    @Transactional
    public WebAuthnService.RegistrationFinishResult finishPasskeyRegistration(User user, String pendingToken, String credentialJson, String label, HttpServletRequest request) {
        WebAuthnService.RegistrationFinishResult result = webAuthnService.finishRegistration(user, pendingToken, credentialJson, label);
        String resolvedLabel = credentialRepository.findAllByUserOrderByCreatedAtAsc(user).stream()
                .reduce((first, second) -> second)
                .map(WebAuthnCredential::getLabel)
                .orElse(label == null || label.isBlank() ? "New passkey" : label.trim());
        logEvent(user, SecurityEventType.PASSKEY_ADDED, "Passkey added", resolvedLabel, "info", request);
        if (getAlerts(user).factorChangeAlertsEnabled()) {
            notificationService.sendFactorChangeNotice(user, "Passkey added", resolvedLabel);
        }
        return result;
    }

    @Transactional
    public void renamePasskey(User user, String credentialId, String label, HttpServletRequest request) {
        String normalized = label == null ? "" : label.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("A passkey label is required.");
        }
        WebAuthnCredential credential = credentialRepository.findByCredentialIdAndUser(credentialId, user)
                .orElseThrow(() -> new IllegalArgumentException("Passkey not found."));
        credential.setLabel(normalized.length() > 255 ? normalized.substring(0, 255) : normalized);
        credentialRepository.save(credential);
        logEvent(user, SecurityEventType.PASSKEY_RENAMED, "Passkey renamed", credential.getLabel(), "info", request);
    }

    @Transactional
    public void removePasskey(User user, String credentialId, HttpServletRequest request) {
        Optional<WebAuthnCredential> existing = credentialRepository.findByCredentialIdAndUser(credentialId, user);
        if (existing.isEmpty()) {
            return;
        }
        String label = safePasskeyLabel(existing.get());
        webAuthnService.deleteCredential(user, credentialId);
        logEvent(user, SecurityEventType.PASSKEY_REMOVED, "Passkey removed", label, "warn", request);
        if (getAlerts(user).factorChangeAlertsEnabled()) {
            notificationService.sendFactorChangeNotice(user, "Passkey removed", label);
        }
    }

    @Transactional
    public List<String> regenerateRecoveryCodes(User user, HttpServletRequest request) {
        List<String> recoveryCodes = webAuthnService.regenerateRecoveryCodes(user);
        logEvent(user, SecurityEventType.RECOVERY_CODES_REGENERATED, "Recovery codes regenerated", "Previous recovery codes were invalidated.", "warn", request);
        if (getAlerts(user).factorChangeAlertsEnabled()) {
            notificationService.sendFactorChangeNotice(user, "Recovery codes regenerated", "Previous recovery codes were invalidated.");
        }
        return recoveryCodes;
    }

    @Transactional
    public IssuedSession issueSession(User user, HttpServletRequest request, String reason) {
        Instant now = Instant.now();
        String sessionKey = randomToken(24);
        String userAgent = trim(request == null ? null : request.getHeader("User-Agent"), 500);
        String ip = clientIp(request);
        String label = deviceLabel(userAgent);

        List<UserSecuritySession> previousSessions = sessionRepository.findAllByUserAndRevokedAtIsNullOrderByLastSeenAtDesc(user);
        boolean suspicious = !previousSessions.isEmpty() && previousSessions.stream().noneMatch(session -> sameDevice(session, userAgent));

        UserSecuritySession session = new UserSecuritySession();
        session.setUser(user);
        session.setSessionKey(sessionKey);
        session.setIssuedAt(now);
        session.setLastSeenAt(now);
        session.setUserAgent(userAgent);
        session.setIpAddress(ip);
        session.setLabel(label);
        sessionRepository.save(session);

        if (suspicious) {
            String detail = label + (ip == null || ip.isBlank() ? "" : " · " + ip);
            logEvent(user, SecurityEventType.SUSPICIOUS_SIGN_IN, "Suspicious sign-in detected", detail, "warn", request);
            if (getAlerts(user).suspiciousSignInAlertsEnabled()) {
                notificationService.sendSuspiciousSignInNotice(user, detail);
            }
        } else {
            logEvent(user, SecurityEventType.SIGN_IN, "New sign-in", reason == null || reason.isBlank() ? label : reason + " · " + label, "info", request);
        }

        return new IssuedSession(jwtService.generateToken(user.getId(), sessionKey), sessionKey, suspicious);
    }

    @Transactional(readOnly = true)
    public boolean isSessionActive(Long userId, String sessionKey) {
        if (sessionKey == null || sessionKey.isBlank()) {
            return true;
        }
        return sessionRepository.findBySessionKey(sessionKey)
                .filter(session -> session.getRevokedAt() == null)
                .filter(session -> session.getUser() != null && userId.equals(session.getUser().getId()))
                .isPresent();
    }

    @Transactional
    public void touchSession(Long userId, String sessionKey, HttpServletRequest request) {
        if (sessionKey == null || sessionKey.isBlank()) {
            return;
        }
        sessionRepository.findBySessionKey(sessionKey)
                .filter(session -> session.getRevokedAt() == null)
                .filter(session -> session.getUser() != null && userId.equals(session.getUser().getId()))
                .ifPresent(session -> {
                    Instant now = Instant.now();
                    if (session.getLastSeenAt() == null || session.getLastSeenAt().isBefore(now.minus(45, ChronoUnit.SECONDS))) {
                        session.setLastSeenAt(now);
                        String currentIp = clientIp(request);
                        if (currentIp != null && !currentIp.isBlank()) {
                            session.setIpAddress(trim(currentIp, 128));
                        }
                        sessionRepository.save(session);
                    }
                });
    }

    @Transactional
    public void revokeSession(User user, String sessionKey, HttpServletRequest request) {
        UserSecuritySession session = sessionRepository.findBySessionKey(sessionKey)
                .filter(row -> row.getUser() != null && user.getId().equals(row.getUser().getId()))
                .orElseThrow(() -> new IllegalArgumentException("Session not found."));
        if (session.getRevokedAt() == null) {
            session.setRevokedAt(Instant.now());
            session.setRevokeReason("manual");
            sessionRepository.save(session);
        }
        logEvent(user, SecurityEventType.SESSION_REVOKED, "Session signed out", safeLabel(session), "info", request);
    }

    @Transactional
    public void revokeOtherSessions(User user, String currentSessionKey, HttpServletRequest request) {
        List<UserSecuritySession> activeSessions = sessionRepository.findAllByUserAndRevokedAtIsNullOrderByLastSeenAtDesc(user);
        int revokedCount = 0;
        for (UserSecuritySession session : activeSessions) {
            if (currentSessionKey != null && currentSessionKey.equals(session.getSessionKey())) {
                continue;
            }
            session.setRevokedAt(Instant.now());
            session.setRevokeReason("revoke-others");
            sessionRepository.save(session);
            revokedCount++;
        }
        logEvent(user, SecurityEventType.OTHER_SESSIONS_REVOKED, "Other sessions signed out", revokedCount + " session(s) revoked.", "info", request);
    }

    private AlertsView getAlerts(User user) {
        return alertPreferenceRepository.findByUser(user)
                .map(preference -> new AlertsView(preference.isFactorChangeAlertsEnabled(), preference.isSuspiciousSignInAlertsEnabled()))
                .orElseGet(() -> new AlertsView(true, true));
    }

    private void logEvent(User user, SecurityEventType type, String title, String detail, String riskLevel, HttpServletRequest request) {
        SecurityActivityEvent event = new SecurityActivityEvent();
        event.setUser(user);
        event.setEventType(type);
        event.setTitle(trim(title, 160));
        event.setDetail(trim(detail, 500));
        event.setOccurredAt(Instant.now());
        event.setRiskLevel(trim(riskLevel, 64));
        event.setIpAddress(trim(clientIp(request), 128));
        event.setUserAgent(trim(request == null ? null : request.getHeader("User-Agent"), 500));
        activityRepository.save(event);
    }

    private boolean sameDevice(UserSecuritySession session, String userAgent) {
        String left = fingerprint(session.getUserAgent());
        String right = fingerprint(userAgent);
        return !left.isBlank() && left.equals(right);
    }

    private String fingerprint(String userAgent) {
        String ua = userAgent == null ? "" : userAgent.toLowerCase(Locale.ROOT);
        return browserName(ua) + "|" + osName(ua);
    }

    private String deviceLabel(String userAgent) {
        String ua = userAgent == null ? "" : userAgent.toLowerCase(Locale.ROOT);
        String browser = browserName(ua);
        String os = osName(ua);
        if (browser.isBlank() && os.isBlank()) return "Unknown device";
        if (browser.isBlank()) return capitalize(os);
        if (os.isBlank()) return capitalize(browser);
        return capitalize(browser) + " on " + capitalize(os);
    }

    private String browserName(String ua) {
        if (ua.contains("edg/")) return "edge";
        if (ua.contains("chrome/") && !ua.contains("edg/")) return "chrome";
        if (ua.contains("safari/") && !ua.contains("chrome/")) return "safari";
        if (ua.contains("firefox/")) return "firefox";
        if (ua.contains("opr/") || ua.contains("opera/")) return "opera";
        return "browser";
    }

    private String osName(String ua) {
        if (ua.contains("windows")) return "windows";
        if (ua.contains("mac os x") || ua.contains("macintosh")) return "mac";
        if (ua.contains("android")) return "android";
        if (ua.contains("iphone") || ua.contains("ipad") || ua.contains("ios")) return "ios";
        if (ua.contains("linux")) return "linux";
        return "device";
    }

    private String safePasskeyLabel(WebAuthnCredential credential) {
        String label = credential.getLabel();
        return label == null || label.isBlank() ? "Passkey" : label;
    }

    private String safeLabel(UserSecuritySession session) {
        return session.getLabel() == null || session.getLabel().isBlank() ? "Unknown device" : session.getLabel();
    }

    private String alertSummary(SecurityAlertPreference preference) {
        List<String> enabled = new ArrayList<>();
        if (preference.isFactorChangeAlertsEnabled()) enabled.add("factor changes");
        if (preference.isSuspiciousSignInAlertsEnabled()) enabled.add("suspicious sign-ins");
        return enabled.isEmpty() ? "No email alerts enabled." : "Enabled alerts: " + String.join(", ", enabled) + ".";
    }

    private String clientIp(HttpServletRequest request) {
        if (request == null) return null;
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return trim(forwarded.split(",")[0].trim(), 128);
        }
        return trim(request.getRemoteAddr(), 128);
    }

    private String randomToken(int bytes) {
        byte[] raw = new byte[bytes];
        secureRandom.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    private String trim(String value, int maxLength) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (trimmed.isBlank()) return null;
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }

    private String capitalize(String value) {
        if (value == null || value.isBlank()) return "";
        Map<String, String> replacements = new LinkedHashMap<>();
        replacements.put("ios", "iOS");
        replacements.put("mac", "macOS");
        replacements.put("chrome", "Chrome");
        replacements.put("edge", "Edge");
        replacements.put("firefox", "Firefox");
        replacements.put("safari", "Safari");
        replacements.put("opera", "Opera");
        replacements.put("windows", "Windows");
        replacements.put("android", "Android");
        replacements.put("linux", "Linux");
        replacements.put("browser", "Browser");
        replacements.put("device", "Device");
        return replacements.getOrDefault(value, Character.toUpperCase(value.charAt(0)) + value.substring(1));
    }
}
