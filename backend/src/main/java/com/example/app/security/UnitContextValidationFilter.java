package com.example.app.security;

import com.example.app.auth.LoginAccount;
import com.example.app.auth.LoginAccountService;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class UnitContextValidationFilter extends OncePerRequestFilter {
    public static final String UNIT_HEADER = "X-Calendra-Unit-Id";

    private final LoginAccountService loginAccountService;
    private final StaffAuthorityService authorityService;
    private final ObjectMapper objectMapper;

    public UnitContextValidationFilter(
            LoginAccountService loginAccountService,
            StaffAuthorityService authorityService,
            ObjectMapper objectMapper
    ) {
        this.loginAccountService = loginAccountService;
        this.authorityService = authorityService;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.equals("/api/auth/ping")
                || path.equals("/api/auth/login")
                || path.equals("/api/auth/csrf")
                || path.equals("/api/auth/google")
                || path.equals("/api/auth/apple")
                || path.equals("/api/auth/oauth-status")
                || path.equals("/api/auth/logout")
                || path.equals("/api/auth/forgot-password")
                || path.startsWith("/api/auth/reset-password")
                || (path.startsWith("/api/auth/signup") && !path.equals("/api/auth/signup/billing-details"))
                || path.equals("/api/auth/mfa/webauthn/options")
                || path.equals("/api/auth/mfa/webauthn/verify")
                || path.equals("/api/auth/mfa/recovery/verify")
                || path.startsWith("/api/actuator/")
                || path.startsWith("/actuator/")
                || path.startsWith("/api/register/")
                || path.startsWith("/api/public/widget/")
                || path.startsWith("/api/public/company-directory/")
                || path.startsWith("/api/public-bookings/manage/")
                || path.startsWith("/api/public-waitlists/")
                || path.startsWith("/api/public/demo-bookings/")
                || path.startsWith("/api/course-access/")
                || path.startsWith("/widget/")
                || path.startsWith("/api/inbox/webhooks/")
                || path.equals("/api/stripe/webhook")
                || path.equals("/api/zoom/callback")
                || path.equals("/api/google/callback")
                || path.equals("/api/google/calendar/callback")
                || path.equals("/api/google/calendar/webhook")
                || path.startsWith("/oauth2/")
                || path.startsWith("/login/oauth2/")
                || path.equals("/error");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof LoginAccount account)) {
            filterChain.doFilter(request, response);
            return;
        }

        Long requestedCompanyId;
        try {
            String requestedUnit = request.getHeader(UNIT_HEADER);
            if ((requestedUnit == null || requestedUnit.isBlank())
                    && request.getRequestURI().equals("/api/bookings/stream")) {
                // Native EventSource does not support custom request headers.
                requestedUnit = request.getParameter("unitId");
            }
            requestedCompanyId = parseUnitId(requestedUnit);
        } catch (IllegalArgumentException ex) {
            writeError(response, HttpServletResponse.SC_BAD_REQUEST, ex.getMessage(), request);
            return;
        }

        final User membership;
        try {
            membership = loginAccountService.requireMembership(account, requestedCompanyId);
        } catch (SecurityException ex) {
            writeError(response, HttpServletResponse.SC_FORBIDDEN, ex.getMessage(), request);
            return;
        } catch (IllegalStateException ex) {
            writeError(response, HttpServletResponse.SC_FORBIDDEN, ex.getMessage(), request);
            return;
        }

        if (membership.getCompany() == null
                || membership.getCompany().getWorkspace() == null
                || !membership.getCompany().getWorkspace().isActive()) {
            writeError(response, HttpServletResponse.SC_FORBIDDEN, "The selected unit is unavailable.", request);
            return;
        }

        UnitContext context = new UnitContext(
                account,
                membership,
                membership.getCompany(),
                membership.getCompany().getWorkspace()
        );
        request.setAttribute(UnitContext.REQUEST_ATTRIBUTE, context);

        UsernamePasswordAuthenticationToken unitAuthentication = new UsernamePasswordAuthenticationToken(
                membership,
                null,
                authorityService.authoritiesFor(membership)
        );
        unitAuthentication.setDetails(authentication.getDetails());
        SecurityContextHolder.getContext().setAuthentication(unitAuthentication);

        filterChain.doFilter(request, response);
    }

    private Long parseUnitId(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            long value = Long.parseLong(raw.trim());
            if (value <= 0) {
                throw new NumberFormatException("non-positive");
            }
            return value;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("The selected unit id must be a positive integer.");
        }
    }

    private void writeError(HttpServletResponse response, int status, String message, HttpServletRequest request) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        body.put("path", request.getRequestURI());
        objectMapper.writeValue(response.getWriter(), body);
    }
}
