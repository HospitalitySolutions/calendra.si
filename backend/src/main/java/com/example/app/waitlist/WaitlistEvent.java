package com.example.app.waitlist;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "waitlist_events", indexes = @Index(name = "idx_waitlist_event_request_time", columnList = "waitlist_request_id,occurred_at"))
public class WaitlistEvent extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "waitlist_request_id", nullable = false)
    private WaitlistRequest request;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "offer_id")
    private WaitlistOffer offer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id")
    private User actor;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 40)
    private WaitlistEventType eventType;

    @Column(length = 2000)
    private String detail;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;
}
