package com.example.app.securitycenter;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "security_alert_preferences", uniqueConstraints = {
        @UniqueConstraint(name = "uk_security_alert_preferences_user", columnNames = "user_id")
})
public class SecurityAlertPreference extends BaseEntity {

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private boolean factorChangeAlertsEnabled = true;

    @Column(nullable = false)
    private boolean suspiciousSignInAlertsEnabled = true;
}
