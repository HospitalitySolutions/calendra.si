package com.example.app.widget;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/**
 * Keeps public widget order failures safe for anonymous callers while still
 * returning enough detail to diagnose configuration and stale-slot problems.
 */
@RestControllerAdvice(assignableTypes = PublicWidgetOrderController.class)
public class PublicWidgetOrderExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(PublicWidgetOrderExceptionHandler.class);

    public record WidgetOrderErrorResponse(
            Instant timestamp,
            int status,
            String error,
            String code,
            String message,
            String path
    ) {}

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<WidgetOrderErrorResponse> handle(
            ResponseStatusException exception,
            HttpServletRequest request
    ) {
        int status = exception.getStatusCode().value();
        String message = exception.getReason() == null || exception.getReason().isBlank()
                ? "Widget booking request failed."
                : exception.getReason();
        String path = request == null ? null : request.getRequestURI();
        String code = errorCode(status, message);

        log.warn(
                "Public widget order request rejected: status={}, code={}, path={}, reason={}",
                status,
                code,
                path,
                message
        );

        HttpStatus resolved = HttpStatus.resolve(status);
        return ResponseEntity.status(exception.getStatusCode()).body(new WidgetOrderErrorResponse(
                Instant.now(),
                status,
                resolved == null ? "Request failed" : resolved.getReasonPhrase(),
                code,
                message,
                path
        ));
    }

    private static String errorCode(int status, String message) {
        if (status == HttpStatus.UNAUTHORIZED.value()) return "WIDGET_GUEST_SESSION_INVALID";
        if (status == HttpStatus.NOT_FOUND.value()) return "WIDGET_ORDER_RESOURCE_NOT_FOUND";
        if (status == HttpStatus.CONFLICT.value()) {
            String reason = normalize(message);
            if (reason.contains("reservation has expired")) return "WIDGET_SLOT_HOLD_EXPIRED";
            if (reason.contains("no longer available")) return "WIDGET_SLOT_UNAVAILABLE";
            return "WIDGET_ORDER_CONFLICT";
        }
        if (status == HttpStatus.TOO_MANY_REQUESTS.value()) return "WIDGET_ORDER_RATE_LIMITED";

        String reason = normalize(message);
        if (reason.contains("website widget")) return "WIDGET_SERVICE_NOT_AVAILABLE";
        if (reason.contains("guest app")) return "WIDGET_SERVICE_VISIBILITY_MISMATCH";
        if (reason.contains("payment method")) return "WIDGET_PAYMENT_METHOD_INVALID";
        if (reason.contains("selected slot") || reason.contains("slot identifier")) return "WIDGET_SLOT_INVALID";
        if (reason.contains("location")) return "WIDGET_LOCATION_INVALID";
        if (reason.contains("service")) return "WIDGET_SERVICE_INVALID";
        return "WIDGET_ORDER_REQUEST_INVALID";
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
