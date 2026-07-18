package com.example.app.waitlist;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "waitlist_slot_skips", uniqueConstraints = @UniqueConstraint(name = "uq_waitlist_skip_slot", columnNames = {"waitlist_request_id", "slot_start", "employee_id"}))
public class WaitlistSlotSkip extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "waitlist_request_id", nullable = false)
    private WaitlistRequest request;

    @Column(name = "slot_start", nullable = false)
    private LocalDateTime slotStart;

    @Column(name = "slot_end", nullable = false)
    private LocalDateTime slotEnd;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private User employee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "skipped_by_user_id")
    private User skippedBy;
}
