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
                || path.startsWith("/api/customer/v1/")
                || path.startsWith("/api/public/widget/")
                || path.equals("/api/public/location-directory")
                || path.startsWith("/api/public/location-directory/")
                || path.startsWith("/api/public-bookings/manage/")
                || path.startsWith("/api/public-waitlists/")
                || path.startsWith("/api/public/demo-bookings/")
                || path.startsWith("/api/course-access/")
                || path.startsWith("/book/")
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
        if (authentication == null) {
            filterChain.doFilter(request, response);
            return;
        }

        if (authentication.getPrincipal() instanceof User membership) {
            installRequestContextIfMissing(membership, request);
            filterChain.doFilter(request, response);
            return;
        }

        if (!(authentication.getPrincipal() instanceof LoginAccount account)) {
            filterChain.doFilter(request, response);
            return;
        }

        if (!resolveAndInstall(account, request, response, authentication.getDetails())) {
            return;
        }

        filterChain.doFilter(request, response);
    }


    /**
     * Resolves the selected operating-unit membership and installs the tenant-scoped
     * {@link User} authentication. JwtAuthenticationFilter also calls this method so
     * controller principals remain correct even if a servlet container invokes this
     * filter before the Spring Security chain.
     */
    boolean resolveAndInstall(
            LoginAccount account,
            HttpServletRequest request,
            HttpServletResponse response,
            Object authenticationDetails
    ) throws IOException {
        Long requestedCompanyId;
        try {
            requestedCompanyId = requestedCompanyId(request);
        } catch (IllegalArgumentException ex) {
            writeError(response, HttpServletResponse.SC_BAD_REQUEST, ex.getMessage(), request);
            return false;
        }

        final User membership;
        try {
            membership = loginAccountService.requireMembership(account, requestedCompanyId);
        } catch (SecurityException | IllegalStateException ex) {
            writeError(response, HttpServletResponse.SC_FORBIDDEN, ex.getMessage(), request);
            return false;
        }

        if (membership.getCompany() == null
                || membership.getCompany().getWorkspace() == null
                || !membership.getCompany().getWorkspace().isActive()) {
            writeError(response, HttpServletResponse.SC_FORBIDDEN, "The selected unit is unavailable.", request);
            return false;
        }

        request.setAttribute(UnitContext.REQUEST_ATTRIBUTE, new UnitContext(
                account,
                membership,
                membership.getCompany(),
                membership.getCompany().getWorkspace()
        ));

        UsernamePasswordAuthenticationToken unitAuthentication = new UsernamePasswordAuthenticationToken(
                membership,
                null,
                authorityService.authoritiesFor(membership)
        );
        unitAuthentication.setDetails(authenticationDetails);
        SecurityContextHolder.getContext().setAuthentication(unitAuthentication);
        return true;
    }

    boolean requiresUnitContext(HttpServletRequest request) {
        return !shouldNotFilter(request);
    }

    private Long requestedCompanyId(HttpServletRequest request) {
        String requestedUnit = request.getHeader(UNIT_HEADER);
        if ((requestedUnit == null || requestedUnit.isBlank())
                && request.getRequestURI().equals("/api/bookings/stream")) {
            // Native EventSource does not support custom request headers.
            requestedUnit = request.getParameter("unitId");
        }
        return parseUnitId(requestedUnit);
    }

    private void installRequestContextIfMissing(User membership, HttpServletRequest request) {
        if (request.getAttribute(UnitContext.REQUEST_ATTRIBUTE) != null
                || membership == null
                || membership.getLoginAccount() == null
                || membership.getCompany() == null
                || membership.getCompany().getWorkspace() == null) {
            return;
        }
        request.setAttribute(UnitContext.REQUEST_ATTRIBUTE, new UnitContext(
                membership.getLoginAccount(),
                membership,
                membership.getCompany(),
                membership.getCompany().getWorkspace()
        ));
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
