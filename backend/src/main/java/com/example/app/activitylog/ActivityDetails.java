package com.example.app.activitylog;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Small helper for activity-log metadata. Null/blank values are omitted so
 * business code can safely build compact details without Map.of null failures.
 */
public final class ActivityDetails {
    private ActivityDetails() {}

    public static Map<String, Object> of(Object... keyValues) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        if (keyValues == null) return result;
        if (keyValues.length % 2 != 0) {
            throw new IllegalArgumentException("ActivityDetails.of requires key/value pairs.");
        }
        for (int i = 0; i < keyValues.length; i += 2) {
            Object rawKey = keyValues[i];
            Object value = keyValues[i + 1];
            if (rawKey == null || value == null) continue;
            String key = String.valueOf(rawKey).trim();
            if (key.isBlank()) continue;
            if (value instanceof String s && s.isBlank()) continue;
            result.put(key, value);
        }
        return result;
    }
}
