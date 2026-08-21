package com.example.app.settings;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Canonical tenant/business type values shared by company configuration and public location presentation. */
public final class TenantConfigTypeCatalog {
    public static final String DEFAULT = "hair_salon";

    public static final Set<String> VALUES = Set.of(
            "hair_salon",
            "beauty_salon",
            "massage",
            "spa_sauna",
            "tattooing_piercing",
            "fitness_personal_training",
            "physical_therapy",
            "psychology_counselling",
            "yoga_pilates",
            "pet_services",
            "education_coaching",
            "other"
    );

    private static final Map<String, String> LEGACY = Map.of(
            "salon", "hair_salon",
            "gym", "fitness_personal_training",
            "therapy", "psychology_counselling",
            "spa", "spa_sauna",
            "personal_training", "fitness_personal_training"
    );

    private TenantConfigTypeCatalog() {}

    /** Returns the canonical value, or null when the supplied non-blank value is unknown. */
    public static String normalizeOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim()
                .toLowerCase(Locale.ROOT)
                .replace('-', '_')
                .replace(' ', '_');
        value = LEGACY.getOrDefault(value, value);
        return VALUES.contains(value) ? value : null;
    }

    public static String normalizeOrDefault(String raw) {
        String normalized = normalizeOrNull(raw);
        return normalized == null ? DEFAULT : normalized;
    }
}
