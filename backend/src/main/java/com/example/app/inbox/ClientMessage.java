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
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "client_messages")
public class ClientMessage extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_user_id")
    private User senderUser;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageChannel channel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageDirection direction;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MessageStatus status;

    @Column(nullable = false)
    private String recipient;

    private String subject;

    @Lob
    @Column(nullable = false)
    private String body;

    private String externalMessageId;

    @Column(length = 2000)
    private String errorMessage;

    private Instant sentAt;
}
