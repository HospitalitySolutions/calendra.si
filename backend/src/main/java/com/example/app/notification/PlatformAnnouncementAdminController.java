package com.example.app.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/platform-admin/announcements")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class PlatformAnnouncementAdminController {
    private final PlatformAnnouncementRepository announcements;
    private final ObjectMapper objectMapper;

    public PlatformAnnouncementAdminController(PlatformAnnouncementRepository announcements, ObjectMapper objectMapper) {
        this.announcements = announcements;
        this.objectMapper = objectMapper;
    }

    public record AnnouncementRequest(
            String title,
            String message,
            String category,
            String severity,
            Instant startsAt,
            Instant expiresAt,
            boolean showBanner,
            String actionUrl,
            List<Long> targetCompanyIds,
            Boolean active
    ) {}

    public record AnnouncementResponse(
            Long id,
            String title,
            String message,
            String category,
            String severity,
            String startsAt,
            String expiresAt,
            boolean showBanner,
            String actionUrl,
            List<Long> targetCompanyIds,
            boolean active,
            String createdAt
    ) {}

    @GetMapping
    public List<AnnouncementResponse> list() {
        return announcements.findAllByOrderByCreatedAtDesc().stream().map(this::toResponse).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AnnouncementResponse create(@RequestBody AnnouncementRequest request) {
        PlatformAnnouncement row = new PlatformAnnouncement();
        apply(row, request);
        return toResponse(announcements.save(row));
    }

    @PutMapping("/{id}")
    public AnnouncementResponse update(@PathVariable Long id, @RequestBody AnnouncementRequest request) {
        PlatformAnnouncement row = announcements.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Announcement not found."));
        apply(row, request);
        return toResponse(announcements.save(row));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        if (!announcements.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Announcement not found.");
        announcements.deleteById(id);
    }

    private void apply(PlatformAnnouncement row, AnnouncementRequest request) {
        if (request == null || request.title() == null || request.title().isBlank()
                || request.message() == null || request.message().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title and message are required.");
        }
        row.setTitle(request.title().trim());
        row.setMessage(request.message().trim());
        row.setCategory(normalize(request.category(), "SYSTEM"));
        row.setSeverity(normalize(request.severity(), "NORMAL"));
        row.setStartsAt(request.startsAt() == null ? Instant.now() : request.startsAt());
        row.setExpiresAt(request.expiresAt());
        row.setShowBanner(request.showBanner());
        row.setActionUrl(blankToNull(request.actionUrl()));
        row.setActive(request.active() == null || request.active());
        try {
            List<Long> targets = request.targetCompanyIds() == null ? List.of() : request.targetCompanyIds().stream().distinct().toList();
            row.setTargetCompanyIdsJson(targets.isEmpty() ? null : objectMapper.writeValueAsString(targets));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid target companies.");
        }
    }

    private AnnouncementResponse toResponse(PlatformAnnouncement row) {
        List<Long> targets = List.of();
        try {
            if (row.getTargetCompanyIdsJson() != null && !row.getTargetCompanyIdsJson().isBlank()) {
                targets = objectMapper.readValue(row.getTargetCompanyIdsJson(), objectMapper.getTypeFactory().constructCollectionType(List.class, Long.class));
            }
        } catch (Exception ignored) {}
        return new AnnouncementResponse(
                row.getId(), row.getTitle(), row.getMessage(), row.getCategory(), row.getSeverity(),
                row.getStartsAt() == null ? null : row.getStartsAt().toString(),
                row.getExpiresAt() == null ? null : row.getExpiresAt().toString(),
                row.isShowBanner(), row.getActionUrl(), targets, row.isActive(),
                row.getCreatedAt() == null ? null : row.getCreatedAt().toString()
        );
    }

    private String normalize(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim().toUpperCase(java.util.Locale.ROOT);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
