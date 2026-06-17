package com.example.app.widget;

import com.example.app.company.Company;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class WidgetPublicAuditLogger {
    private static final Logger log = LoggerFactory.getLogger("widget-audit");

    private final MeterRegistry meterRegistry;

    public WidgetPublicAuditLogger(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void logAttempt(Company company, HttpServletRequest request, String action, String outcome, String details) {
        meterRegistry.counter("widget_public_attempts", "action", safeTag(action), "outcome", safeTag(outcome)).increment();
        log.info("widget_audit tenant={} companyId={} action={} outcome={} ip={} origin={} referer={} ua={} details={}",
                company == null ? "unknown" : company.getTenantCode(),
                company == null ? null : company.getId(),
                action,
                outcome,
                clientIp(request),
                request == null ? null : request.getHeader("Origin"),
                request == null ? null : request.getHeader("Referer"),
                request == null ? null : request.getHeader("User-Agent"),
                details);
    }

    private static String safeTag(String value) {
        if (value == null || value.isBlank()) return "unknown";
        return value.trim().toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9_.-]", "_");
    }

    public String clientIp(HttpServletRequest request) {
        if (request == null) return "unknown";
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
