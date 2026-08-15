package com.example.app.common;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        String msg = ex.getMostSpecificCause() != null
                ? String.valueOf(ex.getMostSpecificCause().getMessage())
                : String.valueOf(ex.getMessage());
        String lower = msg.toLowerCase();

        if (lower.contains("workspace active-user limit reached")) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
                    .body(Map.of(
                            "code", "USER_LIMIT_REACHED",
                            "message", "Your package user limit has been reached. Upgrade or increase your user count to add more."
                    ));
        }
        if (lower.contains("workspace consultant limit reached")) {
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
                    .body(Map.of(
                            "code", "CONSULTANT_LIMIT_REACHED",
                            "message", "Your package consultant limit has been reached. Upgrade or increase your user count to add more."
                    ));
        }
        if (lower.contains("client_id") && lower.contains("not-null")) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "Client is required for Individual billing. For Company billing, select a recipient company."));
        }
        if (lower.contains("uq_clients_company_normalized_email")
                || lower.contains("duplicate client email for tenant")) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "A client with this email already exists for this tenant."));
        }
        // Narrow match: global user.email unique violations mention the column; app_setting key "COMPANY_EMAIL" also contains "email" but is a different failure.
        if (lower.contains("users") && lower.contains("email")) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "Duplicate value detected. Email already exists."));
        }
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "Data integrity constraint violation."));
    }
}
