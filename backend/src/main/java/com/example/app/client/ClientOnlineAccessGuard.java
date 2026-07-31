package com.example.app.client;

import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Enforces the tenant-controlled restriction for client-initiated online bookings,
 * reschedules, waitlist requests and purchases. Tenant staff can still manage the
 * client and create bookings manually.
 */
public final class ClientOnlineAccessGuard {
    private ClientOnlineAccessGuard() {}

    public static void requireAllowed(Client client, String locale) {
        if (client != null && client.isOnlineBookingBlocked()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, publicMessage(locale));
        }
    }

    public static String publicMessage(String locale) {
        String normalized = locale == null ? "" : locale.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("sl")) {
            return "Rezervacije ali nakupa s tem e-poštnim naslovom trenutno ni mogoče dokončati. Za pomoč se obrnite neposredno na ponudnika.";
        }
        if (normalized.startsWith("sr")) {
            return "Rezervaciju ili kupovinu trenutno nije moguće završiti sa ovom adresom e-pošte. Za pomoć se obratite direktno pružaocu usluge.";
        }
        return "A booking or purchase cannot currently be completed with this email address. Please contact the provider directly for assistance.";
    }
}
