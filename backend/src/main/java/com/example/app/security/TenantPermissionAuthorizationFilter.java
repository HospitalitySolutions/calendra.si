package com.example.app.security;

import com.example.app.user.Role;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Component
public class TenantPermissionAuthorizationFilter extends OncePerRequestFilter {
    private static final String EXPLICIT_ALLOW = "__ALLOW__";

    private final PermissionGuard permissionGuard;
    private final ObjectMapper objectMapper;
    private final List<RouteRule> routeRules = buildRouteRules();

    public TenantPermissionAuthorizationFilter(PermissionGuard permissionGuard, ObjectMapper objectMapper) {
        this.permissionGuard = permissionGuard;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.startsWith("/api/")
                || path.startsWith("/api/auth/")
                || (path.startsWith("/api/guest/") && !path.startsWith("/api/guest/admin/"))
                || path.startsWith("/api/public/widget/")
                || path.startsWith("/api/course-access/")
                || path.startsWith("/api/register/")
                || path.startsWith("/api/platform-admin/")
                || path.startsWith("/api/actuator/")
                || path.startsWith("/api/inbox/webhooks/")
                || path.equals("/api/stripe/webhook")
                || path.equals("/api/google/callback")
                || path.equals("/api/google/calendar/callback")
                || path.equals("/api/google/calendar/webhook")
                || path.equals("/api/zoom/callback")
                || path.equals("/api/time/now");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof User user)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (user.getRole() == Role.SUPER_ADMIN || user.getRole() == Role.ADMIN) {
            filterChain.doFilter(request, response);
            return;
        }

        if (!permissionGuard.isCustomRoleUser(user)) {
            filterChain.doFilter(request, response);
            return;
        }

        String requiredPermission = requiredPermission(request);
        if (EXPLICIT_ALLOW.equals(requiredPermission)) {
            filterChain.doFilter(request, response);
            return;
        }
        if (requiredPermission == null || !permissionGuard.can(user, requiredPermission)) {
            writeForbidden(response, request, requiredPermission);
            return;
        }

        filterChain.doFilter(request, response);
    }

    private String requiredPermission(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();

        // The frontend reads tenant settings/module/payment capabilities globally to render navigation,
        // calendar, billing and other pages. Editing settings remains protected by SETTINGS_EDIT.
        if (HttpMethod.GET.matches(method) && (path.equals("/api/settings")
                || path.equals("/api/settings/sms-quota")
                || path.equals("/api/settings/payment-capabilities")
                || path.equals("/api/settings/module-capabilities"))) {
            return EXPLICIT_ALLOW;
        }

        for (RouteRule rule : routeRules) {
            if (rule.matches(path)) {
                return rule.permission(method);
            }
        }
        return null;
    }

    private void writeForbidden(HttpServletResponse response, HttpServletRequest request, String requiredPermission) throws IOException {
        if (response.isCommitted()) return;
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Access denied.");
        body.put("path", request.getRequestURI());
        if (requiredPermission != null) {
            body.put("requiredPermission", requiredPermission);
        }
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }

    private List<RouteRule> buildRouteRules() {
        return List.of(
                // Employee self-service endpoints remain available to the signed-in employee.
                RouteRule.exact("/api/users/profile", null),
                RouteRule.exact("/api/users/profile/avatar", null),

                // Calendar and bookings.
                RouteRule.prefix("/api/bookings", "CALENDAR_BOOKINGS"),
                RouteRule.prefix("/api/bookable-slots", "CALENDAR_BOOKINGS"),
                RouteRule.prefix("/api/holidays", "CALENDAR_BOOKINGS"),
                RouteRule.exact("/api/ai/voice-booking/status", "CALENDAR_BOOKINGS_VIEW"),
                RouteRule.exact("/api/ai/voice-booking", "CALENDAR_BOOKINGS_CREATE"),

                // Clients, client groups and company/customer records.
                RouteRule.prefix("/api/clients/{clientId}/wallet", "WALLET_BENEFITS"),
                RouteRule.prefix("/api/clients", "CLIENTS"),
                RouteRule.prefix("/api/groups", "CLIENTS"),
                RouteRule.prefix("/api/companies", "CLIENTS"),

                // Employees and employee roles.
                RouteRule.prefix("/api/users", "EMPLOYEES"),
                RouteRule.prefix("/api/employee-roles", "ROLES_PERMISSIONS"),

                // Services, spaces and courses.
                RouteRule.prefix("/api/types", "SERVICES"),
                RouteRule.exact("/api/billing/services", "SERVICES"),
                RouteRule.prefix("/api/billing/services", "SERVICES"),
                RouteRule.prefix("/api/spaces", "SPACES"),
                RouteRule.prefix("/api/courses", "COURSES"),

                // Billing, invoices and payments. More specific payment routes must stay above /api/billing.
                RouteRule.prefix("/api/billing/payment-methods", "PAYMENTS"),
                RouteRule.prefix("/api/billing/bills/{id}/checkout-session", "PAYMENTS"),
                RouteRule.prefix("/api/billing/bills/{id}/mark-paid", "PAYMENTS"),
                RouteRule.prefix("/api/billing/bills/{id}/refund", "PAYMENTS"),
                RouteRule.prefix("/api/billing/bank-reconciliation", "PAYMENTS"),
                RouteRule.prefix("/api/billing", "BILLING_INVOICES"),
                RouteRule.prefix("/api/fiscal", "BILLING_INVOICES"),

                // Orders and wallet products/benefits.
                RouteRule.prefix("/api/guest/admin/products", "WALLET_BENEFITS"),

                // Inbox, notifications and delivery logs.
                RouteRule.prefix("/api/inbox", "INBOX_MESSAGES"),
                RouteRule.prefix("/api/delivery-logs", "DELIVERY_LOGS"),

                // Reports and analytics.
                RouteRule.prefix("/api/analytics", "REPORTS_ANALYTICS"),

                // Settings, account management, guest mobile app assets and public widget settings.
                RouteRule.prefix("/api/settings/guest-app", "GUEST_MOBILE_APP"),
                RouteRule.prefix("/api/settings", "SETTINGS"),
                RouteRule.prefix("/api/account-management", "SETTINGS"),

                // Integrations.
                RouteRule.prefix("/api/google/calendar", "INTEGRATIONS"),
                RouteRule.prefix("/api/google", "INTEGRATIONS"),
                RouteRule.prefix("/api/zoom", "INTEGRATIONS"),
                RouteRule.prefix("/api/stripe/connect", "INTEGRATIONS"),
                RouteRule.prefix("/api/paypal/onboarding", "INTEGRATIONS"),

                // Scanner and operational inventory/resources.
                RouteRule.prefix("/api/wallet-scanner", "SCANNER"),
                RouteRule.prefix("/api/consumables", "SERVICES"),

                // Security center stays self-service for the signed-in user.
                RouteRule.prefix("/api/security", null)
        );
    }

    private static final class RouteRule {
        private final Pattern pattern;
        private final String permissionGroupOrExact;

        private RouteRule(String pathPattern, boolean exact, String permissionGroupOrExact) {
            this.pattern = Pattern.compile(toRegex(pathPattern, exact));
            this.permissionGroupOrExact = permissionGroupOrExact;
        }

        static RouteRule prefix(String pathPattern, String permissionGroup) {
            return new RouteRule(pathPattern, false, permissionGroup);
        }

        static RouteRule exact(String pathPattern, String permissionGroupOrExact) {
            return new RouteRule(pathPattern, true, permissionGroupOrExact);
        }

        boolean matches(String path) {
            return pattern.matcher(path).matches();
        }

        String permission(String method) {
            if (permissionGroupOrExact == null) return EXPLICIT_ALLOW;
            if (permissionGroupOrExact.endsWith("_VIEW")
                    || permissionGroupOrExact.endsWith("_CREATE")
                    || permissionGroupOrExact.endsWith("_EDIT")
                    || permissionGroupOrExact.endsWith("_DELETE")) {
                return permissionGroupOrExact;
            }
            return permissionGroupOrExact + "_" + actionFor(method);
        }

        private static String toRegex(String pathPattern, boolean exact) {
            StringBuilder regex = new StringBuilder("^");
            for (int i = 0; i < pathPattern.length(); i++) {
                char ch = pathPattern.charAt(i);
                if (ch == '{') {
                    int end = pathPattern.indexOf('}', i);
                    if (end > i) {
                        regex.append("[^/]+");
                        i = end;
                        continue;
                    }
                }
                if (".[]()^$?*+\\|".indexOf(ch) >= 0) {
                    regex.append('\\');
                }
                regex.append(ch);
            }
            regex.append(exact ? "$" : "(?:/.*)?$");
            return regex.toString();
        }

        private String actionFor(String method) {
            if (HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method) || HttpMethod.OPTIONS.matches(method)) {
                return "VIEW";
            }
            if (HttpMethod.POST.matches(method)) {
                return "CREATE";
            }
            if (HttpMethod.PUT.matches(method) || HttpMethod.PATCH.matches(method)) {
                return "EDIT";
            }
            if (HttpMethod.DELETE.matches(method)) {
                return "DELETE";
            }
            return "VIEW";
        }
    }
}
