package com.example.app.observability;

import com.example.app.user.User;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

@Component
public class RequestMdcFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(RequestMdcFilter.class);
    private static final Pattern WIDGET_TENANT_PATTERN = Pattern.compile("^/api/public/widget/([^/]+).*");

    @Value("${app.performance.slow-request-threshold-ms:750}")
    private long slowRequestThresholdMs;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String requestId = firstNonBlank(request.getHeader("X-Request-Id"), UUID.randomUUID().toString());
        long startedNanos = System.nanoTime();
        try {
            MDC.put("request_id", requestId);
            MDC.put("http_method", request.getMethod());
            MDC.put("http_path", request.getRequestURI());
            response.setHeader("X-Request-Id", requestId);

            String tenantCode = tenantCodeFromPath(request.getRequestURI());
            if (tenantCode != null) {
                MDC.put("tenant_code", tenantCode);
            }

            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            Object principal = authentication == null ? null : authentication.getPrincipal();
            if (principal instanceof User user) {
                MDC.put("user_id", String.valueOf(user.getId()));
                if (user.getCompany() != null && user.getCompany().getId() != null) {
                    MDC.put("company_id", String.valueOf(user.getCompany().getId()));
                }
                MDC.put("user_role", String.valueOf(user.getRole()));
            }

            filterChain.doFilter(request, response);
        } finally {
            long durationMs = Math.max(0L, (System.nanoTime() - startedNanos) / 1_000_000L);
            if (shouldLogSlowRequest(request, durationMs)) {
                log.warn("Slow API request method={} path={} status={} durationMs={} requestId={}",
                        request.getMethod(), normalizedPathForLog(request), response.getStatus(), durationMs, requestId);
            }
            MDC.clear();
        }
    }


    private boolean shouldLogSlowRequest(HttpServletRequest request, long durationMs) {
        if (durationMs < Math.max(1L, slowRequestThresholdMs)) return false;
        String path = request.getRequestURI();
        if (path == null || !path.startsWith("/api/")) return false;
        return !path.startsWith("/api/actuator/") && !path.startsWith("/api/platform-admin/monitoring/");
    }

    private static String normalizedPathForLog(HttpServletRequest request) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (pattern instanceof String value && !value.isBlank()) {
            return value;
        }
        String path = request.getRequestURI();
        if (path == null) return "";
        // Do not put long reset/invite/management tokens into logs when a route pattern is unavailable.
        return path.replaceAll("(?<=/)[^/]{24,}(?=/|$)", "{redacted}");
    }

    private static String tenantCodeFromPath(String path) {
        if (path == null) {
            return null;
        }
        Matcher matcher = WIDGET_TENANT_PATTERN.matcher(path);
        return matcher.matches() ? matcher.group(1) : null;
    }

    private static String firstNonBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
