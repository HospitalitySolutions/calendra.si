package com.example.app.inbox;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "scheduled_messages")
public class ScheduledMessage extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    /** The staff member who scheduled the message; used as the sender at dispatch time. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_user_id")
    private User senderUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageChannel channel;

    private String subject;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String body;

    @Column(nullable = false)
    private Instant nextRunAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageRecurrence recurrence = MessageRecurrence.NONE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ScheduledMessageStatus status = ScheduledMessageStatus.ACTIVE;

    private Instant lastRunAt;

    @Column(length = 2000)
    private String lastError;
}
