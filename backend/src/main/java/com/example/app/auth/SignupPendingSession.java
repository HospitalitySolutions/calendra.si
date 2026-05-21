package com.example.app.auth;

import java.io.Serializable;

/**
 * Stored in the HTTP session while the user completes Google OAuth during self-serve signup.
 */
public record SignupPendingSession(
        /** When blank, Google signup uses the email returned by the provider. Otherwise it must match that address. */
        String email,
        String companyName,
        String firstName,
        String lastName,
        String phone,
        String packageName,
        Integer userCount,
        Integer smsCount,
        Integer spaceCount,
        String billingInterval,
        Boolean fiscalizationNeeded,
        /** Same shape as {@code location.search} on the register account page (includes leading {@code ?}). */
        String returnSearch
) implements Serializable {
}
