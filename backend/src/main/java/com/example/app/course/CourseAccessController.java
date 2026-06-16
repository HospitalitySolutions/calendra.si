package com.example.app.course;

import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestProduct;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/course-access")
public class CourseAccessController {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_MEDIA_SECONDS = 7 * 24 * 60 * 60;

    private final GuestEntitlementRepository entitlements;
    private final CourseRepository courses;
    private final MembershipCourseRepository membershipCourses;
    private final CourseAccessProgressRepository progressRepository;

    public CourseAccessController(
            GuestEntitlementRepository entitlements,
            CourseRepository courses,
            MembershipCourseRepository membershipCourses,
            CourseAccessProgressRepository progressRepository
    ) {
        this.entitlements = entitlements;
        this.courses = courses;
        this.membershipCourses = membershipCourses;
        this.progressRepository = progressRepository;
    }

    @GetMapping("/{token}")
    @Transactional(readOnly = true)
    public CourseAccessResponse open(@PathVariable String token) {
        GuestEntitlement entitlement = loadActiveCourseEntitlement(token);
        List<Course> accessibleCourses = resolveAccessibleCourses(entitlement);
        if (accessibleCourses.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Course was not found.");
        }
        Course primary = accessibleCourses.get(0);
        Map<Long, CourseAccessProgress> progressByCourseId = progressRepository
                .findAllByEntitlementIdAndCourseIdIn(
                        entitlement.getId(),
                        accessibleCourses.stream().map(Course::getId).toList()
                )
                .stream()
                .collect(Collectors.toMap(row -> row.getCourse().getId(), row -> row));
        List<CourseItemResponse> courseItems = accessibleCourses.stream()
                .map(course -> toItem(course, progressByCourseId.get(course.getId())))
                .toList();
        CourseAccessProgress primaryProgress = progressByCourseId.get(primary.getId());
        return new CourseAccessResponse(
                String.valueOf(primary.getId()),
                entitlement.getProduct().getName() == null || entitlement.getProduct().getName().isBlank()
                        ? primary.getTitle()
                        : entitlement.getProduct().getName(),
                entitlement.getProduct().getDescription() == null || entitlement.getProduct().getDescription().isBlank()
                        ? primary.getDescription()
                        : entitlement.getProduct().getDescription(),
                primary.getMediaType().name(),
                primary.getThumbnailUrl(),
                primary.getBunnyLibraryId(),
                primary.getBunnyVideoId(),
                primary.getBunnyCdnUrl(),
                knownDuration(primary, primaryProgress),
                primaryProgress == null ? null : primaryProgress.getPositionSeconds(),
                primaryProgress == null ? null : primaryProgress.getDurationSeconds(),
                primaryProgress == null ? null : primaryProgress.getProgressPercent(),
                primaryProgress != null && primaryProgress.isCompleted(),
                primaryProgress == null || primaryProgress.getLastPlayedAt() == null ? null : primaryProgress.getLastPlayedAt().toString(),
                entitlement.getValidUntil() == null ? null : entitlement.getValidUntil().toString(),
                entitlement.getMetadataJson(),
                courseItems
        );
    }

    @PostMapping("/{token}/progress")
    @Transactional
    public CourseProgressResponse saveProgress(@PathVariable String token, @RequestBody CourseProgressRequest request) {
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Progress payload is required.");
        GuestEntitlement entitlement = loadActiveCourseEntitlement(token);
        Long courseId = parseCourseId(request.courseId());
        List<Course> accessibleCourses = resolveAccessibleCourses(entitlement);
        Course course = accessibleCourses.stream()
                .filter(item -> item.getId().equals(courseId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Course is not part of this access link."));

        int durationSeconds = clampOptionalSeconds(request.durationSeconds());
        int positionSeconds = clampSeconds(request.positionSeconds());
        if (durationSeconds > 0) {
            positionSeconds = Math.min(positionSeconds, durationSeconds);
            if (course.getDurationSeconds() == null || course.getDurationSeconds() <= 0) {
                course.setDurationSeconds(durationSeconds);
                courses.save(course);
            }
        }
        int effectiveDuration = durationSeconds > 0
                ? durationSeconds
                : (course.getDurationSeconds() == null ? 0 : Math.max(0, course.getDurationSeconds()));
        BigDecimal progressPercent = calculateProgressPercent(positionSeconds, effectiveDuration);
        boolean completed = Boolean.TRUE.equals(request.completed()) || progressPercent.compareTo(BigDecimal.valueOf(90)) >= 0;
        Instant now = Instant.now();

        CourseAccessProgress progress = progressRepository.findByEntitlementIdAndCourseId(entitlement.getId(), course.getId())
                .orElseGet(() -> {
                    CourseAccessProgress created = new CourseAccessProgress();
                    created.setEntitlement(entitlement);
                    created.setCourse(course);
                    return created;
                });
        progress.setPositionSeconds(positionSeconds);
        if (effectiveDuration > 0) progress.setDurationSeconds(effectiveDuration);
        progress.setProgressPercent(completed ? BigDecimal.valueOf(100).setScale(2, RoundingMode.HALF_UP) : progressPercent);
        progress.setCompleted(progress.isCompleted() || completed);
        if (progress.isCompleted() && progress.getCompletedAt() == null) progress.setCompletedAt(now);
        progress.setLastPlayedAt(now);
        progress = progressRepository.save(progress);

        return toProgressResponse(progress);
    }

    private GuestEntitlement loadActiveCourseEntitlement(String token) {
        if (token == null || token.isBlank()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        GuestEntitlement entitlement = entitlements.findByCourseAccessToken(token.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Course access not found."));
        if (entitlement.getEntitlementType() != EntitlementType.COURSE || entitlement.getProduct() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This QR code is not a course access card.");
        }
        Instant now = Instant.now();
        if (entitlement.getStatus() != EntitlementStatus.ACTIVE
                || (entitlement.getValidFrom() != null && entitlement.getValidFrom().isAfter(now))
                || (entitlement.getValidUntil() != null && !entitlement.getValidUntil().isAfter(now))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Course access is not active.");
        }
        validateMembershipSource(entitlement, now);
        return entitlement;
    }

    private List<Course> resolveAccessibleCourses(GuestEntitlement entitlement) {
        GuestProduct product = entitlement.getProduct();
        Long companyId = entitlement.getCompany() == null ? null : entitlement.getCompany().getId();
        if (companyId == null || product == null) return List.of();
        Set<Long> ids = new LinkedHashSet<>();
        if (product.getCourse() != null) {
            ids.add(product.getCourse().getId());
        }
        JsonNode metadata = readMetadata(entitlement.getMetadataJson());
        JsonNode courseId = metadata.path("courseId");
        if (courseId.canConvertToLong()) {
            ids.add(courseId.asLong());
        }
        JsonNode included = metadata.path("includedCourseIds");
        if (included.isArray()) {
            for (JsonNode node : included) {
                if (node.canConvertToLong()) ids.add(node.asLong());
            }
        }
        if (ids.isEmpty() && product.getId() != null) {
            membershipCourses.findAllByMembershipProductIdAndCompanyIdOrderByCourseTitleAsc(product.getId(), companyId)
                    .forEach(row -> {
                        if (row.getCourse() != null) ids.add(row.getCourse().getId());
                    });
        }
        List<Course> result = new ArrayList<>();
        for (Long id : ids) {
            courses.findByIdAndCompanyId(id, companyId)
                    .filter(course -> course.isActive() && course.getStatus() == CourseStatus.ACTIVE)
                    .ifPresent(result::add);
        }
        return result;
    }

    private void validateMembershipSource(GuestEntitlement entitlement, Instant now) {
        JsonNode root = readMetadata(entitlement.getMetadataJson());
        String source = root.path("courseAccessSource").asText("");
        if (!"MEMBERSHIP".equalsIgnoreCase(source)) return;
        JsonNode membershipIdNode = root.path("membershipEntitlementId");
        if (!membershipIdNode.canConvertToLong()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Membership access is not active.");
        }
        GuestEntitlement membership = entitlements.findById(membershipIdNode.asLong())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Membership access is not active."));
        if (membership.getStatus() != EntitlementStatus.ACTIVE
                || (membership.getValidFrom() != null && membership.getValidFrom().isAfter(now))
                || (membership.getValidUntil() != null && !membership.getValidUntil().isAfter(now))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Membership access is not active.");
        }
    }

    private JsonNode readMetadata(String raw) {
        if (raw == null || raw.isBlank()) return JSON.createObjectNode();
        try {
            return JSON.readTree(raw);
        } catch (Exception ex) {
            return JSON.createObjectNode();
        }
    }

    private CourseItemResponse toItem(Course course, CourseAccessProgress progress) {
        return new CourseItemResponse(
                String.valueOf(course.getId()),
                course.getTitle(),
                course.getDescription(),
                course.getMediaType().name(),
                course.getThumbnailUrl(),
                course.getBunnyLibraryId(),
                course.getBunnyVideoId(),
                course.getBunnyCdnUrl(),
                knownDuration(course, progress),
                progress == null ? null : progress.getPositionSeconds(),
                progress == null ? null : progress.getDurationSeconds(),
                progress == null ? null : progress.getProgressPercent(),
                progress != null && progress.isCompleted(),
                progress == null || progress.getLastPlayedAt() == null ? null : progress.getLastPlayedAt().toString()
        );
    }

    private CourseProgressResponse toProgressResponse(CourseAccessProgress progress) {
        return new CourseProgressResponse(
                String.valueOf(progress.getCourse().getId()),
                progress.getPositionSeconds(),
                progress.getDurationSeconds(),
                progress.getProgressPercent(),
                progress.isCompleted(),
                progress.getLastPlayedAt() == null ? null : progress.getLastPlayedAt().toString()
        );
    }

    private Integer knownDuration(Course course, CourseAccessProgress progress) {
        if (course.getDurationSeconds() != null && course.getDurationSeconds() > 0) return course.getDurationSeconds();
        if (progress != null && progress.getDurationSeconds() != null && progress.getDurationSeconds() > 0) return progress.getDurationSeconds();
        return null;
    }

    private Long parseCourseId(String raw) {
        if (raw == null || raw.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Course id is required.");
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Course id is invalid.");
        }
    }

    private int clampSeconds(Integer value) {
        if (value == null) return 0;
        return Math.max(0, Math.min(MAX_MEDIA_SECONDS, value));
    }

    private int clampOptionalSeconds(Integer value) {
        if (value == null || value <= 0) return 0;
        return clampSeconds(value);
    }

    private BigDecimal calculateProgressPercent(int positionSeconds, int durationSeconds) {
        if (durationSeconds <= 0 || positionSeconds <= 0) return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        double rawPercent = Math.max(0, Math.min(100, (positionSeconds * 100.0) / durationSeconds));
        return BigDecimal.valueOf(rawPercent).setScale(2, RoundingMode.HALF_UP);
    }

    public record CourseItemResponse(
            String courseId,
            String title,
            String description,
            String mediaType,
            String thumbnailUrl,
            String bunnyLibraryId,
            String bunnyVideoId,
            String mediaUrl,
            Integer durationSeconds,
            Integer progressPositionSeconds,
            Integer progressDurationSeconds,
            BigDecimal progressPercent,
            Boolean completed,
            String lastPlayedAt
    ) {}

    public record CourseAccessResponse(
            String courseId,
            String title,
            String description,
            String mediaType,
            String thumbnailUrl,
            String bunnyLibraryId,
            String bunnyVideoId,
            String mediaUrl,
            Integer durationSeconds,
            Integer progressPositionSeconds,
            Integer progressDurationSeconds,
            BigDecimal progressPercent,
            Boolean completed,
            String lastPlayedAt,
            String validUntil,
            String accessMetadataJson,
            List<CourseItemResponse> courses
    ) {}

    public record CourseProgressRequest(
            String courseId,
            Integer positionSeconds,
            Integer durationSeconds,
            Boolean completed
    ) {}

    public record CourseProgressResponse(
            String courseId,
            Integer positionSeconds,
            Integer durationSeconds,
            BigDecimal progressPercent,
            Boolean completed,
            String lastPlayedAt
    ) {}
}
