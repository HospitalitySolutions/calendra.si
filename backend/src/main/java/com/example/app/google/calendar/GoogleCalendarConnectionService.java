package com.example.app.google.calendar;

import com.example.app.company.CompanyRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class GoogleCalendarConnectionService {
    private static final String AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String SCOPE = "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";

    private final GoogleCalendarConfig config;
    private final GoogleCalendarOAuthStateService stateService;
    private final GoogleCalendarApiClient apiClient;
    private final GoogleCalendarConnectionRepository connections;
    private final CompanyRepository companies;
    private final UserRepository users;
    private final GoogleCalendarSyncQueueService queueService;
    private final GoogleCalendarEventLinkRepository links;
    private final GoogleCalendarTokenCrypto tokenCrypto;

    public GoogleCalendarConnectionService(GoogleCalendarConfig config, GoogleCalendarOAuthStateService stateService, GoogleCalendarApiClient apiClient, GoogleCalendarConnectionRepository connections, CompanyRepository companies, UserRepository users, GoogleCalendarSyncQueueService queueService, GoogleCalendarEventLinkRepository links, GoogleCalendarTokenCrypto tokenCrypto) {
        this.config = config;
        this.stateService = stateService;
        this.apiClient = apiClient;
        this.connections = connections;
        this.companies = companies;
        this.users = users;
        this.queueService = queueService;
        this.links = links;
        this.tokenCrypto = tokenCrypto;
    }

    public String authorizationUrl(User me, Long companyId, Long ownerUserId, String returnUrl) {
        ensureConfigured();
        Long effectiveCompanyId = companyId != null ? companyId : me.getCompany().getId();
        if (!me.getCompany().getId().equals(effectiveCompanyId) && !SecurityUtils.isAdmin(me)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        Long effectiveOwnerUserId = ownerUserId != null ? ownerUserId : me.getId();
        if (!effectiveOwnerUserId.equals(me.getId()) && !SecurityUtils.isAdmin(me)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only admins can connect another consultant calendar.");
        users.findByIdAndCompanyId(effectiveOwnerUserId, effectiveCompanyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Google Calendar owner user."));
        String state = stateService.create(effectiveCompanyId, effectiveOwnerUserId, me.getId(), returnUrl);
        return UriComponentsBuilder.fromHttpUrl(AUTHORIZE_URL)
                .queryParam("response_type", "code")
                .queryParam("client_id", config.getClientId())
                .queryParam("redirect_uri", config.getRedirectUri())
                .queryParam("scope", SCOPE)
                .queryParam("state", state)
                .queryParam("access_type", "offline")
                .queryParam("prompt", "consent")
                .build()
                .toUriString();
    }

    @Transactional
    public String handleCallback(String code, String state) throws Exception {
        ensureConfigured();
        var payload = stateService.parse(state);
        var company = companies.findById(payload.companyId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid tenant."));
        var owner = users.findByIdAndCompanyId(payload.ownerUserId(), payload.companyId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid calendar owner."));
        var token = apiClient.exchangeCode(code);
        String email = null;
        try { email = apiClient.getAccountEmail(token.accessToken()); } catch (Exception ignored) {}
        List<GoogleCalendarApiClient.CalendarSummary> calendars = apiClient.listCalendars(token.accessToken());
        GoogleCalendarApiClient.CalendarSummary selected = calendars.stream().filter(GoogleCalendarApiClient.CalendarSummary::primary).findFirst().orElseGet(() -> calendars.isEmpty() ? new GoogleCalendarApiClient.CalendarSummary("primary", "Primary calendar", true, null) : calendars.get(0));
        GoogleCalendarConnection connection = connections.findFirstByCompany_IdAndUser_IdAndStatusOrderByIdDesc(company.getId(), owner.getId(), GoogleCalendarConnectionStatus.ACTIVE).orElseGet(GoogleCalendarConnection::new);
        connection.setCompany(company);
        connection.setUser(owner);
        connection.setGoogleAccountEmail(email);
        connection.setCalendarId(selected.id());
        connection.setCalendarSummary(selected.summary());
        connection.setAccessToken(tokenCrypto.encrypt(token.accessToken()));
        if (token.refreshToken() != null && !token.refreshToken().isBlank()) connection.setRefreshToken(tokenCrypto.encrypt(token.refreshToken()));
        connection.setExpiresAt(Instant.now().plusSeconds(Math.max(60, token.expiresIn() - 60)));
        connection.setScopes(token.scopes());
        connection.setStatus(GoogleCalendarConnectionStatus.ACTIVE);
        connection.setLastError(null);
        connection = connections.save(connection);
        queueService.enqueueFullSync(connection);
        tryStartWatch(connection);
        return payload.returnUrl() != null && !payload.returnUrl().isBlank() ? payload.returnUrl() : config.effectiveFrontendUrl();
    }

    @Transactional(readOnly = true)
    public List<GoogleCalendarConnectionResponse> listStatus(User me, Long companyId) {
        Long effectiveCompanyId = companyId != null ? companyId : me.getCompany().getId();
        if (!me.getCompany().getId().equals(effectiveCompanyId) && !SecurityUtils.isAdmin(me)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return connections.findAllByCompany_IdOrderByIdAsc(effectiveCompanyId).stream().map(GoogleCalendarConnectionResponse::from).toList();
    }

    @Transactional
    public List<GoogleCalendarApiClient.CalendarSummary> listCalendars(User me, Long connectionId) throws Exception {
        GoogleCalendarConnection c = connections.findByIdAndCompany_Id(connectionId, me.getCompany().getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (c.getUser() != null && !c.getUser().getId().equals(me.getId()) && !SecurityUtils.isAdmin(me)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return apiClient.listCalendars(accessToken(c));
    }

    @Transactional
    public GoogleCalendarConnectionResponse updateSettings(User me, Long connectionId, GoogleCalendarSettingsRequest r) throws Exception {
        GoogleCalendarConnection c = connections.findByIdAndCompany_Id(connectionId, me.getCompany().getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (c.getUser() == null || !c.getUser().getId().equals(me.getId()))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        if (r.calendarId() != null && !r.calendarId().isBlank()) c.setCalendarId(r.calendarId().trim());
        if (r.calendarSummary() != null) c.setCalendarSummary(r.calendarSummary().trim());
        if (r.syncDirection() != null) c.setSyncDirection(r.syncDirection());
        if (r.allowGoogleToModifyBookings() != null) c.setAllowGoogleToModifyBookings(r.allowGoogleToModifyBookings());
        if (r.bookingDeletePolicy() != null) c.setBookingDeletePolicy(r.bookingDeletePolicy());
        if (r.importGoogleEventsAs() != null && !r.importGoogleEventsAs().isBlank()) c.setImportGoogleEventsAs(r.importGoogleEventsAs().trim());
        if (r.enabled() != null) c.setStatus(r.enabled() ? GoogleCalendarConnectionStatus.ACTIVE : GoogleCalendarConnectionStatus.DISABLED);
        c.setSyncToken(null);
        c = connections.save(c);
        queueService.enqueueFullSync(c);
        tryStartWatch(c);
        return GoogleCalendarConnectionResponse.from(c);
    }

    @Transactional
    public void disconnect(User me, Long connectionId) {
        GoogleCalendarConnection c = connections.findByIdAndCompany_Id(connectionId, me.getCompany().getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (c.getUser() == null || !c.getUser().getId().equals(me.getId()))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        tryStopWatch(c);
        c.setStatus(GoogleCalendarConnectionStatus.DISABLED);
        c.setAccessToken("disabled");
        c.setRefreshToken(null);
        c.setSyncToken(null);
        c.setChannelId(null);
        c.setResourceId(null);
        c.setChannelExpiresAt(null);
        connections.save(c);
    }

    @Transactional
    public void enqueueFullSync(User me, Long connectionId) {
        GoogleCalendarConnection c = connections.findByIdAndCompany_Id(connectionId, me.getCompany().getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (c.getUser() == null || !c.getUser().getId().equals(me.getId()))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        c.setSyncToken(null);
        connections.save(c);
        queueService.enqueueFullSync(c);
    }


    @Transactional(readOnly = true)
    public List<GoogleCalendarEventLinkResponse> listConnectionLinks(User me, Long connectionId) {
        GoogleCalendarConnection c = connections.findByIdAndCompany_Id(connectionId, me.getCompany().getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (c.getUser() == null || !c.getUser().getId().equals(me.getId()))) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return links.findTop100ByConnection_IdOrderByUpdatedAtDesc(connectionId).stream().map(GoogleCalendarEventLinkResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<GoogleCalendarEventLinkResponse> listCompanyConflicts(User me, Long companyId) {
        Long effectiveCompanyId = companyId != null ? companyId : me.getCompany().getId();
        if (!me.getCompany().getId().equals(effectiveCompanyId) && !SecurityUtils.isAdmin(me)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return links.findTop100ByCompany_IdAndSyncStatusContainingIgnoreCaseOrderByUpdatedAtDesc(effectiveCompanyId, "CONFLICT").stream().map(GoogleCalendarEventLinkResponse::from).toList();
    }

    @Transactional
    public String accessToken(GoogleCalendarConnection c) throws Exception {
        if (c.getExpiresAt() == null || c.getExpiresAt().isBefore(Instant.now().plusSeconds(60))) {
            if (c.getRefreshToken() == null || c.getRefreshToken().isBlank()) {
                c.setStatus(GoogleCalendarConnectionStatus.NEEDS_RECONNECT);
                c.setLastError("Refresh token missing. Reconnect Google Calendar.");
                connections.save(c);
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Google Calendar needs reconnect.");
            }
            try {
                var refreshed = apiClient.refresh(tokenCrypto.decrypt(c.getRefreshToken()));
                c.setAccessToken(tokenCrypto.encrypt(refreshed.accessToken()));
                c.setExpiresAt(Instant.now().plusSeconds(Math.max(60, refreshed.expiresIn() - 60)));
                c.setStatus(GoogleCalendarConnectionStatus.ACTIVE);
                c.setLastError(null);
                connections.save(c);
            } catch (Exception refreshError) {
                c.setStatus(GoogleCalendarConnectionStatus.NEEDS_RECONNECT);
                c.setLastError("Google token refresh failed. Reconnect Google Calendar: " + clean(refreshError.getMessage()));
                connections.save(c);
                throw refreshError;
            }
        }
        return tokenCrypto.decrypt(c.getAccessToken());
    }

    @Transactional
    public void tryStartWatch(GoogleCalendarConnection c) {
        if (c == null || c.getStatus() != GoogleCalendarConnectionStatus.ACTIVE) return;
        if (config.getWebhookUrl() == null || config.getWebhookUrl().isBlank()) return;
        try {
            String token = accessToken(c);
            if (c.getChannelId() != null && c.getResourceId() != null) apiClient.stopChannel(token, c.getChannelId(), c.getResourceId());
            var watch = apiClient.watchEvents(token, c.getCalendarId(), c.getId());
            c.setChannelId(watch.channelId());
            c.setResourceId(watch.resourceId());
            c.setChannelExpiresAt(watch.expiresAt());
            c.setLastError(null);
            connections.save(c);
        } catch (Exception e) {
            c.setLastError("Connected, but failed to start webhook watch: " + clean(e.getMessage()));
            connections.save(c);
        }
    }

    private void tryStopWatch(GoogleCalendarConnection c) {
        try {
            if (c != null && c.getAccessToken() != null && c.getChannelId() != null && c.getResourceId() != null) {
                apiClient.stopChannel(tokenCrypto.decrypt(c.getAccessToken()), c.getChannelId(), c.getResourceId());
            }
        } catch (Exception ignored) {
            // Stop is best-effort; Google channels can already be expired or gone.
        }
    }

    private void ensureConfigured() {
        if (!config.isConfigured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google Calendar is not configured.");
    }
    private static String clean(String m) { return m == null || m.isBlank() ? "Unknown error" : (m.length() > 1900 ? m.substring(0, 1900) : m); }

    public record GoogleCalendarEventLinkResponse(Long id, Long connectionId, Long companyId, String calendarId, String googleEventId, GoogleCalendarEntityType appEntityType, Long appEntityId, GoogleCalendarEventOrigin origin, String syncStatus, String lastError, Instant googleUpdatedAt, Instant lastSyncedAt, Instant deletedAt) {
        static GoogleCalendarEventLinkResponse from(GoogleCalendarEventLink link) {
            return new GoogleCalendarEventLinkResponse(link.getId(), link.getConnection() == null ? null : link.getConnection().getId(), link.getCompany() == null ? null : link.getCompany().getId(), link.getCalendarId(), link.getGoogleEventId(), link.getAppEntityType(), link.getAppEntityId(), link.getOrigin(), link.getSyncStatus(), link.getLastError(), link.getGoogleUpdatedAt(), link.getLastSyncedAt(), link.getDeletedAt());
        }
    }

    public record GoogleCalendarConnectionResponse(Long id, Long companyId, Long userId, String googleAccountEmail, String calendarId, String calendarSummary, GoogleCalendarSyncDirection syncDirection, boolean allowGoogleToModifyBookings, GoogleCalendarBookingDeletePolicy bookingDeletePolicy, String importGoogleEventsAs, GoogleCalendarConnectionStatus status, String lastError, Instant lastFullSyncAt, Instant lastIncrementalSyncAt, Instant channelExpiresAt) {
        static GoogleCalendarConnectionResponse from(GoogleCalendarConnection c) {
            return new GoogleCalendarConnectionResponse(c.getId(), c.getCompany() == null ? null : c.getCompany().getId(), c.getUser() == null ? null : c.getUser().getId(), c.getGoogleAccountEmail(), c.getCalendarId(), c.getCalendarSummary(), c.getSyncDirection(), c.isAllowGoogleToModifyBookings(), c.getBookingDeletePolicy(), c.getImportGoogleEventsAs(), c.getStatus(), c.getLastError(), c.getLastFullSyncAt(), c.getLastIncrementalSyncAt(), c.getChannelExpiresAt());
        }
    }
    public record GoogleCalendarSettingsRequest(String calendarId, String calendarSummary, GoogleCalendarSyncDirection syncDirection, Boolean allowGoogleToModifyBookings, GoogleCalendarBookingDeletePolicy bookingDeletePolicy, String importGoogleEventsAs, Boolean enabled) {}
}
