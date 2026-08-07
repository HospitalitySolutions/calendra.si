package com.example.app.activitylog;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(
        name = "activity_logs",
        indexes = {
                @Index(name = "idx_activity_logs_workspace_time", columnList = "workspace_id,occurred_at"),
                @Index(name = "idx_activity_logs_company_time", columnList = "company_id,occurred_at"),
                @Index(name = "idx_activity_logs_actor_time", columnList = "actor_user_id,occurred_at"),
                @Index(name = "idx_activity_logs_entity_time", columnList = "entity_type,entity_id,occurred_at"),
                @Index(name = "idx_activity_logs_location_time", columnList = "location_id,occurred_at")
        }
)
public class ActivityLog extends BaseEntity {
    @Column(name = "workspace_id", nullable = false)
    private Long workspaceId;

    @Column(name = "company_id", nullable = false)
    private Long companyId;

    @Column(name = "location_id")
    private Long locationId;

    @Column(name = "space_id")
    private Long spaceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_type", nullable = false, length = 40)
    private ActivityActorType actorType;

    @Column(name = "actor_login_account_id")
    private Long actorLoginAccountId;

    @Column(name = "actor_user_id")
    private Long actorUserId;

    @Column(name = "actor_name_snapshot", nullable = false, length = 240)
    private String actorNameSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "module", nullable = false, length = 40)
    private ActivityModule module;

    @Enumerated(EnumType.STRING)
    @Column(name = "action_code", nullable = false, length = 80)
    private ActivityAction actionCode;

    @Column(name = "entity_type", nullable = false, length = 80)
    private String entityType;

    @Column(name = "entity_id")
    private Long entityId;

    @Column(name = "entity_label", length = 320)
    private String entityLabel;

    @Column(name = "secondary_entity_type", length = 80)
    private String secondaryEntityType;

    @Column(name = "secondary_entity_id")
    private Long secondaryEntityId;

    @Column(name = "secondary_entity_label", length = 320)
    private String secondaryEntityLabel;

    @Column(name = "summary", nullable = false, length = 1000)
    private String summary;

    @Column(name = "details_json", columnDefinition = "TEXT")
    private String detailsJson;

    @Column(name = "source", nullable = false, length = 60)
    private String source;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;
}
