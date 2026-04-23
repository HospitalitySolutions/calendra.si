package com.example.app.auth;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/**
 * Holds a self-serve signup payload until the guest confirms their email; no tenant or user exists yet.
 */
@Getter
@Setter
@Entity
@Table(name = "signup_email_intents")
public class SignupEmailIntent extends BaseEntity {

    @Column(nullable = false, unique = true, length = 128)
    private String token;

    @Column(nullable = false, length = 255)
    private String email;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String payloadJson;

    @Column(nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private boolean active = true;
}
