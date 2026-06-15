package com.example.app.google.calendar;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class GoogleCalendarProductionSecretValidator {
    private static final int MIN_PRODUCTION_SECRET_LENGTH = 32;

    private final GoogleCalendarConfig config;
    private final Environment environment;

    public GoogleCalendarProductionSecretValidator(GoogleCalendarConfig config, Environment environment) {
        this.config = config;
        this.environment = environment;
    }

    @PostConstruct
    public void validateProductionTokenEncryptionSecret() {
        if (!isProduction() || !config.isEnabled()) {
            return;
        }
        String secret = config.getTokenEncryptionSecret() == null ? "" : config.getTokenEncryptionSecret().trim();
        if (secret.isBlank()) {
            throw new IllegalStateException(
                    "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_SECRET must be set to a unique production secret when Google Calendar is enabled in production."
            );
        }
        if (secret.length() < MIN_PRODUCTION_SECRET_LENGTH) {
            throw new IllegalStateException(
                    "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_SECRET must be at least " + MIN_PRODUCTION_SECRET_LENGTH + " characters in production."
            );
        }
    }

    private boolean isProduction() {
        return Arrays.asList(environment.getActiveProfiles()).contains("production");
    }
}
