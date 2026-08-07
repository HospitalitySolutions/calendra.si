package com.example.app.activitylog;

import com.example.app.user.User;
import com.example.app.company.Company;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;

@Service
public class ActivityLogService {
    private final ActivityLogRepository repository;
    private final ObjectMapper objectMapper;

    public ActivityLogService(ActivityLogRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public ActivityLog recordUser(
            User actor,
            ActivityModule module,
            ActivityAction action,
            String entityType,
            Long entityId,
            String entityLabel,
            String summary,
            Long locationId,
            Long spaceId,
            Map<String, ?> details
    ) {
        return recordUser(actor, module, action, entityType, entityId, entityLabel,
                null, null, null, summary, locationId, spaceId, details);
    }

    public ActivityLog recordUser(
            User actor,
            ActivityModule module,
            ActivityAction action,
            String entityType,
            Long entityId,
            String entityLabel,
            String secondaryEntityType,
            Long secondaryEntityId,
            String secondaryEntityLabel,
            String summary,
            Long locationId,
            Long spaceId,
            Map<String, ?> details
    ) {
        if (actor == null || actor.getCompany() == null || actor.getCompany().getWorkspace() == null) {
            throw new IllegalArgumentException("Authenticated company/workspace is required for activity logging.");
        }

        ActivityLog row = new ActivityLog();
        row.setWorkspaceId(actor.getCompany().getWorkspace().getId());
        row.setCompanyId(actor.getCompany().getId());
        row.setLocationId(locationId);
        row.setSpaceId(spaceId);
        row.setActorType(ActivityActorType.USER);
        row.setActorUserId(actor.getId());
        row.setActorLoginAccountId(actor.getLoginAccount() == null ? null : actor.getLoginAccount().getId());
        row.setActorNameSnapshot(displayName(actor));
        row.setModule(module);
        row.setActionCode(action);
        row.setEntityType(trim(entityType, 80, "UNKNOWN"));
        row.setEntityId(entityId);
        row.setEntityLabel(trim(entityLabel, 320, null));
        row.setSecondaryEntityType(trim(secondaryEntityType, 80, null));
        row.setSecondaryEntityId(secondaryEntityId);
        row.setSecondaryEntityLabel(trim(secondaryEntityLabel, 320, null));
        row.setSummary(trim(summary, 1000, action.name()));
        row.setDetailsJson(writeDetails(details));
        row.setSource("WEB_APP");
        row.setOccurredAt(Instant.now());
        return repository.save(row);
    }

    public ActivityLog recordExternal(
            Company company,
            ActivityActorType actorType,
            String actorName,
            String source,
            ActivityModule module,
            ActivityAction action,
            String entityType,
            Long entityId,
            String entityLabel,
            String secondaryEntityType,
            Long secondaryEntityId,
            String secondaryEntityLabel,
            String summary,
            Long locationId,
            Long spaceId,
            Map<String, ?> details
    ) {
        if (company == null || company.getWorkspace() == null) {
            throw new IllegalArgumentException("Company/workspace is required for activity logging.");
        }
        ActivityLog row = new ActivityLog();
        row.setWorkspaceId(company.getWorkspace().getId());
        row.setCompanyId(company.getId());
        row.setLocationId(locationId);
        row.setSpaceId(spaceId);
        row.setActorType(actorType == null ? ActivityActorType.SYSTEM : actorType);
        row.setActorNameSnapshot(trim(actorName, 240, row.getActorType().name()));
        row.setModule(module);
        row.setActionCode(action);
        row.setEntityType(trim(entityType, 80, "UNKNOWN"));
        row.setEntityId(entityId);
        row.setEntityLabel(trim(entityLabel, 320, null));
        row.setSecondaryEntityType(trim(secondaryEntityType, 80, null));
        row.setSecondaryEntityId(secondaryEntityId);
        row.setSecondaryEntityLabel(trim(secondaryEntityLabel, 320, null));
        row.setSummary(trim(summary, 1000, action.name()));
        row.setDetailsJson(writeDetails(details));
        row.setSource(trim(source, 60, "SYSTEM"));
        row.setOccurredAt(Instant.now());
        return repository.save(row);
    }

    private String writeDetails(Map<String, ?> details) {
        if (details == null || details.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(details);
        } catch (JsonProcessingException ex) {
            return null;
        }
    }

    private static String displayName(User user) {
        String name = ((user.getFirstName() == null ? "" : user.getFirstName().trim()) + " "
                + (user.getLastName() == null ? "" : user.getLastName().trim())).trim();
        if (!name.isBlank()) return name;
        if (user.getEmail() != null && !user.getEmail().isBlank()) return user.getEmail().trim();
        return "User";
    }

    private static String trim(String value, int max, String fallback) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) return fallback;
        return normalized.length() <= max ? normalized : normalized.substring(0, max);
    }
}
