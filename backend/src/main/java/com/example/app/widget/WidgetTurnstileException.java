package com.example.app.widget;

import org.springframework.http.HttpStatus;

public class WidgetTurnstileException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public WidgetTurnstileException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
