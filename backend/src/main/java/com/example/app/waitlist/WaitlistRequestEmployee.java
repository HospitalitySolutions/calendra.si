package com.example.app.waitlist;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "waitlist_request_employees", uniqueConstraints = @UniqueConstraint(name = "uq_waitlist_request_employee", columnNames = {"waitlist_request_id", "employee_id"}))
public class WaitlistRequestEmployee extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "waitlist_request_id", nullable = false)
    private WaitlistRequest request;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private User employee;
}
