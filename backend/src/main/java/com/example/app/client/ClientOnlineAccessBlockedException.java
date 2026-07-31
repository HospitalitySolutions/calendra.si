package com.example.app.client;

/**
 * Public-safe exception raised when a tenant has disabled a client's online
 * booking and purchasing access. The message is intentionally neutral and can
 * be returned to website-widget and guest-app users.
 */
public final class ClientOnlineAccessBlockedException extends RuntimeException {
    public ClientOnlineAccessBlockedException(String message) {
        super(message);
    }
}
