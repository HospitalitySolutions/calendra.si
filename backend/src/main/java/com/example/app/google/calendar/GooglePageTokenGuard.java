package com.example.app.google.calendar;

import java.util.HashSet;
import java.util.Set;

/**
 * Stops a paginated Google API call when an upstream response repeats a page token.
 *
 * <p>Google page tokens should form a finite, non-repeating chain. Continuing after a repeated
 * token would request the same page forever and can keep a scheduled sync thread permanently
 * busy. The guard has no effect on a valid pagination sequence.</p>
 */
final class GooglePageTokenGuard {
    private final Set<String> seen = new HashSet<>();

    String next(String currentToken, String nextToken) {
        if (nextToken == null || nextToken.isBlank()) {
            return null;
        }
        if (nextToken.equals(currentToken) || !seen.add(nextToken)) {
            throw new IllegalStateException("Google API returned a repeated page token.");
        }
        return nextToken;
    }
}
