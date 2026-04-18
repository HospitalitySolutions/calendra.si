package com.example.app.security;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.util.StringUtils;

/**
 * True when {@code GOOGLE_CLIENT_ID} and {@code GOOGLE_CLIENT_SECRET} are both non-blank
 * (e.g. from AWS Secrets Manager JSON). Spring OAuth2 does not bind these flat keys automatically.
 */
public class GoogleFlatOauthCredentialsPresentCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        var env = context.getEnvironment();
        return StringUtils.hasText(env.getProperty("GOOGLE_CLIENT_ID"))
                && StringUtils.hasText(env.getProperty("GOOGLE_CLIENT_SECRET"));
    }
}
