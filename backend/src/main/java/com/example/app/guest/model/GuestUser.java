package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "guest_users", uniqueConstraints = {
        @UniqueConstraint(columnNames = "email"),
        @UniqueConstraint(columnNames = "google_subject"),
        @UniqueConstraint(columnNames = "apple_subject")
})
public class GuestUser extends BaseEntity {
    @Column(nullable = false, length = 255)
    private String email;

    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Column(nullable = false, length = 120)
    private String firstName;

    @Column(nullable = false, length = 120)
    private String lastName;

    @Column(length = 60)
    private String phone;

    @Column(nullable = false, length = 8)
    private String language = "sl";

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean emailVerified = false;

    @Column(name = "notify_messages_enabled", nullable = false)
    private boolean notifyMessagesEnabled = true;

    @Column(name = "notify_reminders_enabled", nullable = false)
    private boolean notifyRemindersEnabled = true;

    @Column(name = "google_subject", length = 255)
    private String googleSubject;

    @Column(name = "apple_subject", length = 255)
    private String appleSubject;

    @Column(name = "stripe_customer_id", length = 255)
    private String stripeCustomerId;

    /** S3 object key for the guest's profile picture, or null if none. */
    @Column(name = "profile_picture_s3_key", length = 512)
    private String profilePictureS3Key;

    @Column(name = "profile_picture_content_type", length = 120)
    private String profilePictureContentType;

    private Instant lastLoginAt;
}
