package com.example.app.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;

/**
 * Binds flat {@code GOOGLE_CLIENT_ID} / {@code GOOGLE_CLIENT_SECRET} (common in env and AWS Secrets
 * Manager JSON) to a Google OAuth2 client registration. Without this, only
 * {@code spring.security.oauth2.client.registration.google.*} properties create a repository bean.
 */
@Configuration
public class GoogleOAuthClientRegistrationConfig {

    private static final Logger log = LoggerFactory.getLogger(GoogleOAuthClientRegistrationConfig.class);

    @Bean
    @ConditionalOnMissingBean(ClientRegistrationRepository.class)
    @Conditional(GoogleFlatOauthCredentialsPresentCondition.class)
    public ClientRegistrationRepository googleClientRegistrationFromFlatSecrets(Environment env) {
        String clientId = env.getProperty("GOOGLE_CLIENT_ID");
        String clientSecret = env.getProperty("GOOGLE_CLIENT_SECRET");
        String redirectUri = env.getProperty(
                "GOOGLE_OAUTH_REDIRECT_URI",
                "{baseUrl}/login/oauth2/code/{registrationId}"
        );

        // CommonOAuth2Provider was removed from spring-security-oauth2-client; use explicit Google OIDC endpoints.
        ClientRegistration registration = ClientRegistration.withRegistrationId("google")
                .clientId(clientId)
                .clientSecret(clientSecret)
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri(redirectUri)
                .scope("openid", "profile", "email")
                .authorizationUri("https://accounts.google.com/o/oauth2/v2/auth")
                .tokenUri("https://oauth2.googleapis.com/token")
                .userInfoUri("https://openidconnect.googleapis.com/v1/userinfo")
                .userNameAttributeName("sub")
                .jwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
                .clientName("Google")
                .build();

        log.info(
                "Registered Google OAuth2 client from GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (redirect-uri: {}).",
                redirectUri
        );

        return new InMemoryClientRegistrationRepository(registration);
    }
}
