package com.example.app.guest.model;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "guest_notifications")
public class GuestNotification extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "guest_user_id", nullable = false)
    private GuestUser guestUser;

    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne
    @JoinColumn(name = "client_id")
    private Client client;

    @Enumerated(EnumType.STRING)
    @Column(name = "notification_type", nullable = false, length = 40)
    private GuestNotificationType notificationType;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String body;

    @Column(columnDefinition = "TEXT")
    private String payloadJson;

    private Instant readAt;
}
