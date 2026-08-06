package com.example.app.widget;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

class PublicWidgetOrderExceptionHandlerTest {

    @Test
    void responseExposesSafeWebsiteVisibilityMismatchDetails() {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRequestURI()).thenReturn("/api/public/widget/21HOS/orders");
        ResponseStatusException exception = new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "This service is not available in the guest app."
        );

        ResponseEntity<PublicWidgetOrderExceptionHandler.WidgetOrderErrorResponse> response =
                new PublicWidgetOrderExceptionHandler().handle(exception, request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("WIDGET_SERVICE_VISIBILITY_MISMATCH", response.getBody().code());
        assertEquals(exception.getReason(), response.getBody().message());
        assertEquals("/api/public/widget/21HOS/orders", response.getBody().path());
    }
}
