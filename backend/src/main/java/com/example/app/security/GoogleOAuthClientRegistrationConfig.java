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
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * Binds flat OAuth secret names (common in env files and AWS Secrets Manager JSON) to Spring OAuth2 client
 * registrations. Spring Boot only auto-binds keys under spring.security.oauth2.client.registration.*.
 */
@Configuration
public class GoogleOAuthClientRegistrationConfig {

    private static final Logger log = LoggerFactory.getLogger(GoogleOAuthClientRegistrationConfig.class);

    private final AppleOAuthClientSecretGenerator appleClientSecretGenerator;

    public GoogleOAuthClientRegistrationConfig(AppleOAuthClientSecretGenerator appleClientSecretGenerator) {
        this.appleClientSecretGenerator = appleClientSecretGenerator;
    }

    @Bean
    @ConditionalOnMissingBean(ClientRegistrationRepository.class)
    @Conditional(GoogleFlatOauthCredentialsPresentCondition.class)
    public ClientRegistrationRepository socialClientRegistrationFromFlatSecrets(Environment env) {
        List<ClientRegistration> registrations = new ArrayList<>();

        if (hasGoogleCredentials(env)) {
            registrations.add(googleRegistration(env));
        }
        if (hasAppleCredentials(env)) {
            registrations.add(appleRegistration(env));
        }

        if (registrations.isEmpty()) {
            throw new IllegalStateException("No OAuth client registrations could be created from flat secrets.");
        }

        log.info("Registered {} OAuth2 client(s) from flat environment/secrets configuration.", registrations.size());
        return new InMemoryClientRegistrationRepository(registrations);
    }

    private ClientRegistration googleRegistration(Environment env) {
        String clientId = env.getProperty("GOOGLE_CLIENT_ID");
        String clientSecret = env.getProperty("GOOGLE_CLIENT_SECRET");
        String redirectUri = env.getProperty(
                "GOOGLE_OAUTH_REDIRECT_URI",
                "{baseUrl}/login/oauth2/code/{registrationId}"
        );

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

        log.info("Registered Google OAuth2 client from GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (redirect-uri: {}).", redirectUri);
        return registration;
    }

    private ClientRegistration appleRegistration(Environment env) {
        String clientId = env.getProperty("APPLE_CLIENT_ID");
        String redirectUri = env.getProperty(
                "APPLE_OAUTH_REDIRECT_URI",
                "{baseUrl}/login/oauth2/code/{registrationId}"
        );
        String clientSecret = appleClientSecretGenerator.resolveClientSecret(env, clientId);

        ClientRegistration registration = ClientRegistration.withRegistrationId("apple")
                .clientId(clientId)
                .clientSecret(clientSecret)
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri(redirectUri)
                .scope("openid", "email", "name")
                .authorizationUri("https://appleid.apple.com/auth/authorize?response_mode=form_post")
                .tokenUri("https://appleid.apple.com/auth/token")
                .jwkSetUri("https://appleid.apple.com/auth/keys")
                .userNameAttributeName("sub")
                .clientName("Apple")
                .build();

        log.info("Registered Apple OAuth2 client from APPLE_CLIENT_ID (redirect-uri: {}).", redirectUri);
        return registration;
    }

    private static boolean hasGoogleCredentials(Environment env) {
        return StringUtils.hasText(env.getProperty("GOOGLE_CLIENT_ID"))
                && StringUtils.hasText(env.getProperty("GOOGLE_CLIENT_SECRET"));
    }

    private static boolean hasAppleCredentials(Environment env) {
        return StringUtils.hasText(env.getProperty("APPLE_CLIENT_ID"))
                && (
                StringUtils.hasText(env.getProperty("APPLE_CLIENT_SECRET"))
                        || (
                        StringUtils.hasText(env.getProperty("APPLE_TEAM_ID"))
                                && StringUtils.hasText(env.getProperty("APPLE_KEY_ID"))
                                && (
                                StringUtils.hasText(env.getProperty("APPLE_PRIVATE_KEY"))
                                        || StringUtils.hasText(env.getProperty("APPLE_PRIVATE_KEY_BASE64"))
                        )
                )
        );
    }
}
