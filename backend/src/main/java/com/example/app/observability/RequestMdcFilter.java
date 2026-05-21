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
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestMdcFilter extends OncePerRequestFilter {
    private static final Pattern WIDGET_TENANT_PATTERN = Pattern.compile("^/api/public/widget/([^/]+).*");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String requestId = firstNonBlank(request.getHeader("X-Request-Id"), UUID.randomUUID().toString());
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
            MDC.clear();
        }
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
