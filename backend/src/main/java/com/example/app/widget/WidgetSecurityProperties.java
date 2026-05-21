package com.example.app.widget;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.widget.security")
public class WidgetSecurityProperties {
    private List<String> allowedOrigins = new ArrayList<>();
    /**
     * auto = use Redis when available, otherwise memory; redis = fail closed if Redis is unavailable; memory = local only.
     */
    private String rateLimitBackend = "auto";
    private String rateLimitRedisKeyPrefix = "calendra:rate-limit:widget";
    private int generalRequestsPerMinutePerIp = 120;
    private int generalRequestsPerMinutePerTenant = 600;
    private int bookingsPerMinutePerIp = 10;
    private int bookingsPerMinutePerTenant = 120;
    /**
     * When true, every tenant must configure at least one allowed origin before the public widget API can be used.
     * Keep false for local testing; enable in staging/production.
     */
    private boolean requireAllowedOrigin = false;
    /**
     * Referer can be stripped or spoofed more easily than Origin. Keep disabled in production unless you have
     * legacy embed pages that cannot send Origin and you accept the weaker check.
     */
    private boolean trustRefererWhenOriginMissing = false;

    public List<String> getAllowedOrigins() { return allowedOrigins; }
    public void setAllowedOrigins(List<String> allowedOrigins) { this.allowedOrigins = allowedOrigins; }
    public String getRateLimitBackend() { return rateLimitBackend; }
    public void setRateLimitBackend(String rateLimitBackend) { this.rateLimitBackend = rateLimitBackend; }
    public String getRateLimitRedisKeyPrefix() { return rateLimitRedisKeyPrefix; }
    public void setRateLimitRedisKeyPrefix(String rateLimitRedisKeyPrefix) { this.rateLimitRedisKeyPrefix = rateLimitRedisKeyPrefix; }
    public int getGeneralRequestsPerMinutePerIp() { return generalRequestsPerMinutePerIp; }
    public void setGeneralRequestsPerMinutePerIp(int v) { this.generalRequestsPerMinutePerIp = v; }
    public int getGeneralRequestsPerMinutePerTenant() { return generalRequestsPerMinutePerTenant; }
    public void setGeneralRequestsPerMinutePerTenant(int v) { this.generalRequestsPerMinutePerTenant = v; }
    public int getBookingsPerMinutePerIp() { return bookingsPerMinutePerIp; }
    public void setBookingsPerMinutePerIp(int v) { this.bookingsPerMinutePerIp = v; }
    public int getBookingsPerMinutePerTenant() { return bookingsPerMinutePerTenant; }
    public void setBookingsPerMinutePerTenant(int v) { this.bookingsPerMinutePerTenant = v; }
    public boolean isRequireAllowedOrigin() { return requireAllowedOrigin; }
    public void setRequireAllowedOrigin(boolean requireAllowedOrigin) { this.requireAllowedOrigin = requireAllowedOrigin; }
    public boolean isTrustRefererWhenOriginMissing() { return trustRefererWhenOriginMissing; }
    public void setTrustRefererWhenOriginMissing(boolean trustRefererWhenOriginMissing) { this.trustRefererWhenOriginMissing = trustRefererWhenOriginMissing; }
}
