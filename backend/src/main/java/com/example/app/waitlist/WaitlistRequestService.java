package com.example.app.waitlist;

import com.example.app.common.BaseEntity;
import com.example.app.session.SessionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "waitlist_request_services",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_waitlist_request_service",
                columnNames = {"waitlist_request_id", "service_id"}
        )
)
public class WaitlistRequestService extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "waitlist_request_id", nullable = false)
    private WaitlistRequest request;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "service_id")
    private SessionType service;

    @Column(name = "service_name_snapshot", nullable = false, length = 255)
    private String serviceNameSnapshot;

    @Column(name = "service_group_id_snapshot")
    private Long serviceGroupIdSnapshot;

    @Column(name = "service_group_name_snapshot", length = 120)
    private String serviceGroupNameSnapshot;

    @Column(name = "duration_minutes_snapshot")
    private Integer durationMinutesSnapshot;

    @Column(name = "sort_order_snapshot", nullable = false)
    private int sortOrderSnapshot;
}
