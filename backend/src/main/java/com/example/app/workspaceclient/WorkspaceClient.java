package com.example.app.workspaceclient;

import com.example.app.common.BaseEntity;
import com.example.app.workspace.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.util.Locale;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "workspace_clients",
        uniqueConstraints = @UniqueConstraint(name = "uq_workspace_client_public_id", columnNames = "public_id")
)
public class WorkspaceClient extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(name = "public_id", nullable = false, length = 36)
    private String publicId;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    private String email;
    private String phone;

    @Column(name = "normalized_email")
    private String normalizedEmail;

    @Column(name = "normalized_phone", length = 64)
    private String normalizedPhone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WorkspaceClientStatus status = WorkspaceClientStatus.ACTIVE;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "merged_into_id")
    private WorkspaceClient mergedInto;

    @PrePersist
    @PreUpdate
    void normalize() {
        if (publicId == null || publicId.isBlank()) {
            publicId = UUID.randomUUID().toString();
        }
        firstName = cleanRequired(firstName, "Client");
        lastName = cleanRequired(lastName, "");
        email = normalizeEmail(email);
        phone = cleanNullable(phone);
        normalizedEmail = email;
        normalizedPhone = normalizePhone(phone);
        if (status == null) status = WorkspaceClientStatus.ACTIVE;
    }

    public static String normalizeEmail(String value) {
        String cleaned = cleanNullable(value);
        return cleaned == null ? null : cleaned.toLowerCase(Locale.ROOT);
    }

    public static String normalizePhone(String value) {
        String cleaned = cleanNullable(value);
        if (cleaned == null) return null;
        String digits = cleaned.replaceAll("[^0-9]", "");
        return digits.isBlank() ? null : digits;
    }

    private static String cleanRequired(String value, String fallback) {
        String cleaned = cleanNullable(value);
        return cleaned == null ? fallback : cleaned;
    }

    private static String cleanNullable(String value) {
        if (value == null) return null;
        String cleaned = value.trim();
        return cleaned.isEmpty() ? null : cleaned;
    }
}
