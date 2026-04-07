package com.example.app.security;

import com.example.app.auth.GoogleOAuth2SuccessHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {
    private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final GoogleOAuth2SuccessHandler googleOAuth2SuccessHandler;
    private final Environment environment;
    private final ObjectProvider<ClientRegistrationRepository> clientRegistrationRepository;
    private final CorsProperties corsProperties;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          GoogleOAuth2SuccessHandler googleOAuth2SuccessHandler,
                          Environment environment,
                          ObjectProvider<ClientRegistrationRepository> clientRegistrationRepository,
                          CorsProperties corsProperties) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.googleOAuth2SuccessHandler = googleOAuth2SuccessHandler;
        this.environment = environment;
        this.clientRegistrationRepository = clientRegistrationRepository;
        this.corsProperties = corsProperties;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // Only enable oauth2Login when a ClientRegistrationRepository exists (YAML, Secrets Manager
        // spring.* keys, or flat GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET via GoogleOAuthClientRegistrationConfig).
        boolean oauthLoginEnabled = clientRegistrationRepository.getIfAvailable() != null;

        http
                .cors(cors -> cors.configurationSource(request -> {
                    CorsConfiguration config = new CorsConfiguration();
                    List<String> configuredOrigins = corsProperties.getAllowedOrigins() == null
                            ? List.of()
                            : corsProperties.getAllowedOrigins().stream()
                            .map(String::trim)
                            .filter(s -> !s.isBlank())
                            .toList();
                    if (configuredOrigins.isEmpty()) {
                        configuredOrigins = List.of("http://localhost:3000");
                    }
                    List<String> exactOrigins = new ArrayList<>();
                    List<String> originPatterns = new ArrayList<>();
                    for (String origin : configuredOrigins) {
                        if (origin.contains("*")) {
                            originPatterns.add(origin);
                        } else {
                            exactOrigins.add(origin);
                        }
                    }
                    if (!exactOrigins.isEmpty()) {
                        config.setAllowedOrigins(exactOrigins);
                    }
                    if (!originPatterns.isEmpty()) {
                        config.setAllowedOriginPatterns(originPatterns);
                    }
                    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
                    config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"));
                    config.setExposedHeaders(List.of("Location", "Content-Disposition"));
                    config.setAllowCredentials(false);
                    return config;
                }))
                .csrf(AbstractHttpConfigurer::disable)
                .oauth2ResourceServer(AbstractHttpConfigurer::disable)
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                )
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers("/api/auth/**").permitAll();
                    auth.requestMatchers("/api/zoom/callback", "/api/google/callback").permitAll();
                    auth.requestMatchers("/api/stripe/webhook").permitAll();
                    auth.requestMatchers("/api/inbox/webhooks/**").permitAll();
                    auth.requestMatchers("/error").permitAll();
                    auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();
                    if (oauthLoginEnabled) {
                        auth.requestMatchers("/oauth2/**", "/login/oauth2/**").permitAll();
                    }
                    auth.anyRequest().authenticated();
                });

        if (oauthLoginEnabled) {
            http.oauth2Login(oauth2 -> {
                oauth2.successHandler(googleOAuth2SuccessHandler);
                oauth2.failureHandler((request, response, exception) -> {
                    String configuredRedirectUri = environment.getProperty(
                            "spring.security.oauth2.client.registration.google.redirect-uri",
                            "UNSET"
                    );
                    log.warn(
                            "Google OAuth login failed. path={}, query={}, redirectUri={}, exceptionType={}, message={}",
                            request.getRequestURI(),
                            request.getQueryString(),
                            configuredRedirectUri,
                            exception == null ? "n/a" : exception.getClass().getSimpleName(),
                            exception == null ? "Google authentication failed." : exception.getMessage()
                    );

                    String message = exception != null && exception.getMessage() != null
                            ? exception.getMessage()
                            : "Google authentication failed.";
                    String encoded = URLEncoder.encode(message, StandardCharsets.UTF_8);
                    response.sendRedirect("/?oauth_error=" + encoded);
                });
            });
        }

        http.exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) -> {
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType("application/json");
                            response.getWriter().write(new ObjectMapper().writeValueAsString(
                                    new LinkedHashMap<String, Object>() {{
                                        put("message", "Not authenticated.");
                                        put("path", request.getRequestURI());
                                    }}
                            ));
                        })
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                            response.setContentType("application/json");
                            response.getWriter().write(new ObjectMapper().writeValueAsString(
                                    new LinkedHashMap<String, Object>() {{
                                        put("message", "Access denied.");
                                        put("path", request.getRequestURI());
                                    }}
                            ));
                        })
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable);

        return http.build();
    }
}