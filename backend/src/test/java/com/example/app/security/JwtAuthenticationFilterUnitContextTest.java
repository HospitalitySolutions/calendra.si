package com.example.app.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.auth.LoginAccount;
import com.example.app.auth.LoginAccountRepository;
import com.example.app.auth.LoginAccountService;
import com.example.app.company.Company;
import com.example.app.securitycenter.SecurityCenterService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.workspace.Workspace;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

class JwtAuthenticationFilterUnitContextTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void installsTenantUserPrincipalBeforeProtectedControllerChain() throws Exception {
        JwtService jwtService = mock(JwtService.class);
        LoginAccountRepository loginAccounts = mock(LoginAccountRepository.class);
        SecurityCenterService securityCenterService = mock(SecurityCenterService.class);
        AuthCookieService authCookieService = mock(AuthCookieService.class);
        LoginAccountService loginAccountService = mock(LoginAccountService.class);
        StaffAuthorityService authorityService = mock(StaffAuthorityService.class);

        UnitContextValidationFilter unitContextFilter = new UnitContextValidationFilter(
                loginAccountService,
                authorityService,
                new ObjectMapper()
        );
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(
                jwtService,
                loginAccounts,
                securityCenterService,
                authCookieService,
                unitContextFilter
        );

        LoginAccount account = new LoginAccount();
        account.setId(7L);
        account.setActive(true);

        Workspace workspace = new Workspace();
        workspace.setId(3L);
        workspace.setActive(true);

        Company company = new Company();
        company.setId(42L);
        company.setWorkspace(workspace);

        User membership = new User();
        membership.setId(11L);
        membership.setLoginAccount(account);
        membership.setCompany(company);
        membership.setRole(Role.ADMIN);
        membership.setActive(true);

        when(authCookieService.resolveTokenFromHeaderOrCookie(org.mockito.ArgumentMatchers.any()))
                .thenReturn("token");
        when(jwtService.parseAuthToken("token")).thenReturn(new JwtService.AuthTokenPayload(7L, null));
        when(loginAccounts.findById(7L)).thenReturn(Optional.of(account));
        when(jwtService.isTokenValid("token", 7L)).thenReturn(true);
        when(loginAccountService.requireMembership(account, 42L)).thenReturn(membership);
        when(authorityService.authoritiesFor(membership))
                .thenReturn(List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/settings");
        request.addHeader(UnitContextValidationFilter.UNIT_HEADER, "42");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<Object> principalSeenByController = new AtomicReference<>();

        filter.doFilter(request, response, (servletRequest, servletResponse) ->
                principalSeenByController.set(SecurityContextHolder.getContext().getAuthentication().getPrincipal()));

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(principalSeenByController.get()).isSameAs(membership);
        assertThat(request.getAttribute(UnitContext.REQUEST_ATTRIBUTE)).isInstanceOf(UnitContext.class);
        UnitContext context = (UnitContext) request.getAttribute(UnitContext.REQUEST_ATTRIBUTE);
        assertThat(context.loginAccount()).isSameAs(account);
        assertThat(context.membership()).isSameAs(membership);
        assertThat(context.unit()).isSameAs(company);
        assertThat(context.workspace()).isSameAs(workspace);
    }
}
