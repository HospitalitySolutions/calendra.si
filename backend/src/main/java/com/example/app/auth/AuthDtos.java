package com.example.app.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public class AuthDtos {
    public record LoginRequest(@Email String email, @NotBlank String password) {}
    public record AuthResponse(String token, UserMeResponse user) {}
    public record UserMeResponse(Long id, String firstName, String lastName, String email, String role) {}
}
