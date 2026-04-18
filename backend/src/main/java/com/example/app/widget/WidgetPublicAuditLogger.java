package com.example.app.widget;

import com.example.app.company.Company;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class WidgetPublicAuditLogger {
    private static final Logger log = LoggerFactory.getLogger("widget-audit");

    public void logAttempt(Company company, HttpServletRequest request, String action, String outcome, String details) {
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
