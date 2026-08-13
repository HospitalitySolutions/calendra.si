package com.example.app.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.example.app.auth.LoginAccountRepository;
import com.example.app.auth.LoginAccountService;
import com.example.app.securitycenter.SecurityCenterService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class JwtAuthenticationFilterCustomerPathTest {

    @Test
    void businessJwtFilterSkipsCustomerApi() {
        UnitContextValidationFilter unitContext = new UnitContextValidationFilter(
                mock(LoginAccountService.class),
                mock(StaffAuthorityService.class),
                new ObjectMapper()
        );
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(
                mock(JwtService.class),
                mock(LoginAccountRepository.class),
                mock(SecurityCenterService.class),
                mock(AuthCookieService.class),
                unitContext
        );

        assertThat(filter.shouldNotFilter(new MockHttpServletRequest("GET", "/api/customer/v1/home"))).isTrue();
        assertThat(filter.shouldNotFilter(new MockHttpServletRequest("GET", "/api/customer/v1/wallet"))).isTrue();
    }
}
