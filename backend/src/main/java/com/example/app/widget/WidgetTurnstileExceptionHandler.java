package com.example.app.widget;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class WidgetTurnstileExceptionHandler {

    @ExceptionHandler(WidgetTurnstileException.class)
    public ResponseEntity<Map<String, Object>> handle(
            WidgetTurnstileException ex,
            HttpServletRequest request
    ) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now());
        body.put("status", ex.getStatus().value());
        body.put("error", ex.getStatus().getReasonPhrase());
        body.put("code", ex.getCode());
        body.put("message", ex.getMessage());
        body.put("path", request == null ? null : request.getRequestURI());
        return ResponseEntity.status(ex.getStatus()).body(body);
    }
}
