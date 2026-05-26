package com.example.app.security;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.util.StringUtils;

/**
 * True when at least one flat OAuth provider configuration is present.
 */
public class GoogleFlatOauthCredentialsPresentCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        var env = context.getEnvironment();
        boolean googleConfigured = StringUtils.hasText(env.getProperty("GOOGLE_CLIENT_ID"))
                && StringUtils.hasText(env.getProperty("GOOGLE_CLIENT_SECRET"));
        boolean appleConfigured = StringUtils.hasText(env.getProperty("APPLE_CLIENT_ID"))
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
        return googleConfigured || appleConfigured;
    }
}
