package com.example.app.zoom;

import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** Stores Zoom OAuth tokens per user (consultant). */
@Getter
@Setter
@Entity
@Table(name = "zoom_oauth_tokens", uniqueConstraints = @UniqueConstraint(columnNames = "user_id"))
public class ZoomOAuthToken {
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
