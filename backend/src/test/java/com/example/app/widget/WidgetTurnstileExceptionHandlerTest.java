package com.example.app.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class WidgetTurnstileExceptionHandlerTest {

    @Test
    void responseIncludesMachineReadableCodeAndGuestFacingMessage() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRequestURI()).thenReturn("/api/public/widget/21HQ/guest-session");
        WidgetTurnstileException exception = new WidgetTurnstileException(
                HttpStatus.BAD_REQUEST,
                "WIDGET_TURNSTILE_EXPIRED",
                "Verification expired or was already used. Please complete it again."
        );

        ResponseEntity<Map<String, Object>> response = new WidgetTurnstileExceptionHandler().handle(exception, request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("WIDGET_TURNSTILE_EXPIRED", response.getBody().get("code"));
        assertEquals(exception.getMessage(), response.getBody().get("message"));
        assertEquals("/api/public/widget/21HQ/guest-session", response.getBody().get("path"));
    }
}
