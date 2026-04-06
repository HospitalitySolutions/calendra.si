package com.example.app.fiscal;

public record FiscalResponse(
        boolean success,
        String zoi,
        String eor,
        String qr,
        String messageId,
        String error,
        String requestBody,
        String responseBody,
        Integer httpStatus
) {}
