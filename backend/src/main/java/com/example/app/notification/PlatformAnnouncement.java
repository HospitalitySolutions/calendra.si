package com.example.app.notification;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "platform_announcements")
public class PlatformAnnouncement extends BaseEntity {
    @Column(nullable = false, length = 180)
    private String title;

    @Column(nullable = false, length = 2000)
    private String message;

    @Column(nullable = false, length = 40)
    private String category = "SYSTEM";

    @Column(nullable = false, length = 20)
    private String severity = "NORMAL";

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "show_banner", nullable = false)
    private boolean showBanner;

    @Column(name = "action_url", length = 600)
    private String actionUrl;

    @Column(name = "target_company_ids_json", columnDefinition = "TEXT")
    private String targetCompanyIdsJson;

    @Column(nullable = false)
    private boolean active = true;
}
