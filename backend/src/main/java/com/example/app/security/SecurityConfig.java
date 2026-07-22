package com.example.app.security;

import com.example.app.auth.GoogleOAuth2SuccessHandler;
import com.example.app.guest.auth.GuestJwtAuthenticationFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Optional;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final GuestJwtAuthenticationFilter guestJwtAuthenticationFilter;
    private final GoogleOAuth2SuccessHandler googleOAuth2SuccessHandler;
    private final Environment environment;
    private final ObjectProvider<ClientRegistrationRepository> clientRegistrationRepository;
    private final CorsProperties corsProperties;
    private final CsrfCookieFilter csrfCookieFilter;
    private final TenantPermissionAuthorizationFilter tenantPermissionAuthorizationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          GuestJwtAuthenticationFilter guestJwtAuthenticationFilter,
                          GoogleOAuth2SuccessHandler googleOAuth2SuccessHandler,
                          Environment environment,
                          ObjectProvider<ClientRegistrationRepository> clientRegistrationRepository,
                          CorsProperties corsProperties,
                          CsrfCookieFilter csrfCookieFilter,
                          TenantPermissionAuthorizationFilter tenantPermissionAuthorizationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.guestJwtAuthenticationFilter = guestJwtAuthenticationFilter;
        this.googleOAuth2SuccessHandler = googleOAuth2SuccessHandler;
        this.environment = environment;
        this.clientRegistrationRepository = clientRegistrationRepository;
        this.corsProperties = corsProperties;
        this.csrfCookieFilter = csrfCookieFilter;
        this.tenantPermissionAuthorizationFilter = tenantPermissionAuthorizationFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        boolean oauthLoginEnabled = clientRegistrationRepository.getIfAvailable() != null;

        CookieCsrfTokenRepository csrfTokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfTokenRepository.setCookieName("XSRF-TOKEN");
        csrfTokenRepository.setHeaderName("X-XSRF-TOKEN");
        csrfTokenRepository.setCookiePath("/");

        CsrfTokenRequestAttributeHandler csrfRequestHandler = new CsrfTokenRequestAttributeHandler();

        RequestMatcher csrfIgnoredRequestMatcher = request -> {
            String path = request.getRequestURI();
            String method = request.getMethod();
            String platform = request.getHeader("X-App-Platform");
            String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);

            if (HttpMethod.OPTIONS.matches(method)) {
                return true;
            }
            if (platform != null && platform.trim().equalsIgnoreCase("native")) {
                return true;
            }
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                return true;
            }

            // Guest mobile API is token-based and called by native apps, not browser forms.
            // Keep CSRF for the existing browser/session app, but ignore it for the guest API.
            return path.startsWith("/api/guest/")
                    || path.startsWith("/api/public/widget/")
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
                    || path.equals("/error")
                    || path.equals("/api/auth/login")
                    || path.equals("/api/auth/csrf")
                    || path.startsWith("/api/auth/mfa/");
        };

        http
                .cors(cors -> cors.configurationSource(request -> {
                    CorsConfiguration config = new CorsConfiguration();
                    config.setAllowedOrigins(Optional.ofNullable(corsProperties.getAllowedOrigins()).orElse(List.of()));
                    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
                    config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key", "idempotency-key", "X-App-Platform", "X-Requested-With", "X-XSRF-TOKEN", "X-CSRF-TOKEN"));
                    config.setAllowCredentials(true);
                    config.setMaxAge(3600L);
                    return config;
                }))
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokenRepository)
                        .csrfTokenRequestHandler(csrfRequestHandler)
                        .ignoringRequestMatchers(csrfIgnoredRequestMatcher)
                )
                .oauth2ResourceServer(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                )
                .authorizeHttpRequests(auth -> {
                    // SSE responses use servlet async dispatch after the initial authenticated request.
                    // Do not re-authorize those internal ASYNC/ERROR dispatches, otherwise Spring Security
                    // can see them as anonymous after the response stream is already open and log
                    // "Access Denied" / "response is already committed". The initial REQUEST dispatch
                    // is still protected by the matchers below.
                    auth.dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR).permitAll();

                    auth.requestMatchers("/api/auth/**").permitAll();
                    auth.requestMatchers(HttpMethod.GET,
                            "/api/actuator/health",
                            "/api/actuator/health/**",
                            "/api/actuator/info",
                            "/actuator/health",
                            "/actuator/health/**",
                            "/actuator/info"
                    ).permitAll();
                    auth.requestMatchers(HttpMethod.GET, "/api/register/catalog", "/api/register/public-pricing").permitAll();
                    auth.requestMatchers(HttpMethod.POST, "/api/register/contact").permitAll();
                    auth.requestMatchers("/api/guest/auth/**").permitAll();
                    auth.requestMatchers(HttpMethod.POST, "/api/guest/tenants/resolve-code").permitAll();
                    auth.requestMatchers(HttpMethod.GET, "/api/guest/tenants/invite/**").permitAll();
                    auth.requestMatchers(HttpMethod.GET, "/api/guest/tenants/search").permitAll();
                    auth.requestMatchers("/api/zoom/callback", "/api/google/callback", "/api/google/calendar/callback", "/api/google/calendar/webhook").permitAll();
                    auth.requestMatchers("/api/stripe/webhook").permitAll();
                    auth.requestMatchers("/api/guest/paypal/**", "/api/guest/stripe/**").permitAll();
                    auth.requestMatchers(HttpMethod.GET, "/api/course-access/**").permitAll();
                    auth.requestMatchers(HttpMethod.POST, "/api/course-access/**").permitAll();

                    auth.requestMatchers("/api/public/widget/**").permitAll();
                    auth.requestMatchers("/api/public/company-directory/**").permitAll();
                    auth.requestMatchers("/api/public-bookings/manage/**").permitAll();
                    auth.requestMatchers("/api/public-waitlists/**").permitAll();
                    auth.requestMatchers("/api/public/demo-bookings/**").permitAll();
                    auth.requestMatchers("/widget/**").permitAll();

                    auth.requestMatchers("/api/inbox/webhooks/**").permitAll();
                    auth.requestMatchers("/error").permitAll();
                    auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();

                    if (oauthLoginEnabled) {
                        auth.requestMatchers("/oauth2/**", "/login/oauth2/**").permitAll();
                    }

                    auth.requestMatchers("/api/guest/**").authenticated();
                    auth.anyRequest().authenticated();
                });

        if (oauthLoginEnabled) {
            http.oauth2Login(oauth2 -> {
                oauth2.successHandler(googleOAuth2SuccessHandler);
                oauth2.failureHandler((request, response, exception) -> {
                    log.warn(
                            "OAuth login failed. path={}, query={}, exceptionType={}, message={}",
                            request.getRequestURI(),
                            request.getQueryString(),
                            exception == null ? "n/a" : exception.getClass().getSimpleName(),
                            exception == null ? "OAuth authentication failed." : exception.getMessage()
                    );

                    String message = exception != null && exception.getMessage() != null
                            ? exception.getMessage()
                            : "OAuth authentication failed.";
                    String encoded = URLEncoder.encode(message, StandardCharsets.UTF_8);
                    String frontendBaseUrl = environment.getProperty("APP_AUTH_FRONTEND_URL", environment.getProperty("APP_PUBLIC_BASE_URL", "http://localhost:3000"));
                    response.sendRedirect(frontendBaseUrl + "/login?oauth_error=" + encoded);
                });
            });
        }

        http.exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) -> {
                            if (response.isCommitted()) {
                                return;
                            }
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType("application/json");

                            Map<String, Object> body = new LinkedHashMap<>();
                            body.put("message", "Not authenticated.");
                            body.put("path", request.getRequestURI());

                            response.getWriter().write(new ObjectMapper().writeValueAsString(body));
                        })
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            if (response.isCommitted()) {
                                return;
                            }
                            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                            response.setContentType("application/json");

                            String message = "Access denied.";
                            if (accessDeniedException != null && accessDeniedException.getClass().getSimpleName().toLowerCase().contains("csrf")) {
                                message = "CSRF token missing or invalid.";
                            }

                            Map<String, Object> body = new LinkedHashMap<>();
                            body.put("message", message);
                            body.put("path", request.getRequestURI());

                            response.getWriter().write(new ObjectMapper().writeValueAsString(body));
                        })
                )
                .addFilterAfter(csrfCookieFilter, CsrfFilter.class)
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(tenantPermissionAuthorizationFilter, JwtAuthenticationFilter.class)
                .addFilterBefore(guestJwtAuthenticationFilter, JwtAuthenticationFilter.class)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable);

        return http.build();
    }
}