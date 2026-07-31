package com.example.app.common;

import com.example.app.ai.VoiceBookingFallbackException;
import com.example.app.client.ClientOnlineAccessBlockedException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ClientOnlineAccessBlockedException.class)
    public ResponseEntity<Map<String, Object>> clientOnlineAccessBlocked(
            ClientOnlineAccessBlockedException ex,
            HttpServletRequest request
    ) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now());
        body.put("status", HttpStatus.FORBIDDEN.value());
        body.put("error", HttpStatus.FORBIDDEN.getReasonPhrase());
        body.put("code", "CLIENT_ONLINE_ACCESS_BLOCKED");
        body.put("message", ex.getMessage());
        body.put("path", request == null ? null : request.getRequestURI());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> validation(MethodArgumentNotValidException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "Validation failed"));
    }

    @ExceptionHandler(VoiceBookingFallbackException.class)
    public ResponseEntity<Map<String, Object>> voiceBookingFallback(VoiceBookingFallbackException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", ex.getMessage());
        body.put("code", ex.getReason().name());
        body.put("startTime", ex.getStartTime());
        body.put("endTime", ex.getEndTime());
        body.put("clientId", ex.getClientId());
        return ResponseEntity.status(ex.getStatus()).body(body);
    }
}
