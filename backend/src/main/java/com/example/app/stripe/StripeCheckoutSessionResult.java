package com.example.app.stripe;

import java.time.OffsetDateTime;

public record StripeCheckoutSessionResult(
        String id,
        String url,
        String status,
        OffsetDateTime expiresAt
) {
}
