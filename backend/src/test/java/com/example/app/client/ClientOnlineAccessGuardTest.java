package com.example.app.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class ClientOnlineAccessGuardTest {

    @Test
    void blockedClientRaisesPublicSafeLocalizedException() {
        Client client = new Client();
        client.setOnlineBookingBlocked(true);

        ClientOnlineAccessBlockedException exception = assertThrows(
                ClientOnlineAccessBlockedException.class,
                () -> ClientOnlineAccessGuard.requireAllowed(client, "sl-SI")
        );

        assertEquals(
                "Rezervacije ali nakupa s tem e-poštnim naslovom trenutno ni mogoče dokončati. Za pomoč se obrnite neposredno na ponudnika.",
                exception.getMessage()
        );
    }
}
