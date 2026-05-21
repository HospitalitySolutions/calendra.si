package com.example.app.google;

import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Stores Google OAuth tokens per user (consultant) for Google Meet. */
@Getter
@Setter
@Entity
@Table(name = "google_oauth_tokens", uniqueConstraints = @UniqueConstraint(columnNames = "user_id"))
public class GoogleOAuthToken {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 2000)
    private String accessToken;

    @Column(length = 2000)
    private String refreshToken;

    @Column(nullable = false)
    private Instant expiresAt;
}
