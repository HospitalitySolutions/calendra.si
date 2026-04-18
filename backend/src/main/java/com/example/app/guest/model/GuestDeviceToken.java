package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "guest_device_tokens", uniqueConstraints = @UniqueConstraint(columnNames = "push_token"))
public class GuestDeviceToken extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "guest_user_id", nullable = false)
    private GuestUser guestUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private GuestDevicePlatform platform;

    @Column(name = "push_token", nullable = false, length = 512)
    private String pushToken;

    @Column(length = 8)
    private String locale;

    @Column(nullable = false)
    private Instant lastSeenAt = Instant.now();
}
