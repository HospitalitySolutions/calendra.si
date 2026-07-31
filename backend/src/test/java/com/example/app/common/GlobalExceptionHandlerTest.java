package com.example.app.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.client.ClientOnlineAccessBlockedException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class GlobalExceptionHandlerTest {

    @Test
    void blockedClientResponseIncludesGuestFacingMessage() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRequestURI()).thenReturn("/api/public/widget/3DAV/guest-session");
        String message = "Rezervacije ali nakupa s tem e-poštnim naslovom trenutno ni mogoče dokončati. Za pomoč se obrnite neposredno na ponudnika.";

        ResponseEntity<Map<String, Object>> response = new GlobalExceptionHandler()
                .clientOnlineAccessBlocked(new ClientOnlineAccessBlockedException(message), request);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertEquals("CLIENT_ONLINE_ACCESS_BLOCKED", response.getBody().get("code"));
        assertEquals(message, response.getBody().get("message"));
        assertEquals("/api/public/widget/3DAV/guest-session", response.getBody().get("path"));
    }
}
