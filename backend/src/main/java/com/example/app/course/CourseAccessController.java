package com.example.app.course;

import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestProduct;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
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

    private final GuestEntitlementRepository entitlements;
    private final CourseRepository courses;
    private final MembershipCourseRepository membershipCourses;
    private final CourseAccessProgressRepository progressRepository;
    private final BunnyMediaService bunnyMediaService;

    @Autowired
    public CourseAccessController(
            GuestEntitlementRepository entitlements,
            CourseRepository courses,
            MembershipCourseRepository membershipCourses,
            CourseAccessProgressRepository progressRepository,
            BunnyMediaService bunnyMediaService
    ) {
        this.entitlements = entitlements;
        this.courses = courses;
        this.membershipCourses = membershipCourses;
        this.progressRepository = progressRepository;
        this.bunnyMediaService = bunnyMediaService;
    }

    /** Backwards-compatible constructor for older tests. Runtime wiring uses the @Autowired constructor above. */
    public CourseAccessController(
            GuestEntitlementRepository entitlements,
            CourseRepository courses,
            MembershipCourseRepository membershipCourses
    ) {
        this(entitlements, courses, membershipCourses, null, null);
    }

    @GetMapping("/{token}")
    @Transactional
    public CourseAccessResponse open(@PathVariable String token) {
        GuestEntitlement entitlement = loadActiveCourseEntitlement(token);
        List<Course> accessibleCourses = resolveAccessibleCourses(entitlement);
        if (accessibleCourses.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Course was not found.");
        }

        // Hydrate missing Bunny Stream durations for all included videos so the top
        // "Skupni čas" card can show the real total immediately, not only after a
        // learner opens each video in the browser.
        accessibleCourses.forEach(this::refreshMissingVideoDuration);

        Map<Long, CourseAccessProgress> progressByCourseId = loadProgressByCourseId(entitlement.getId());
        Course primary = accessibleCourses.get(0);
        CourseAccessProgress primaryProgress = progressByCourseId.get(primary.getId());
        List<CourseItemResponse> courseItems = accessibleCourses.stream()
                .map(course -> toItem(course, progressByCourseId.get(course.getId())))
                .toList();
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
                durationSeconds(primary, primaryProgress),
                progressPositionSeconds(primaryProgress),
                progressDurationSeconds(primary, primaryProgress),
                progressPercent(primaryProgress, primary.getDurationSeconds()),
                primaryProgress == null ? Boolean.FALSE : primaryProgress.isCompleted(),
                primaryProgress == null || primaryProgress.getLastPlayedAt() == null ? null : primaryProgress.getLastPlayedAt().toString(),
                entitlement.getValidUntil() == null ? null : entitlement.getValidUntil().toString(),
                entitlement.getMetadataJson(),
                courseItems
        );
    }

    @PostMapping("/{token}/progress")
    @Transactional
    public CourseProgressResponse saveProgress(@PathVariable String token, @RequestBody CourseProgressRequest request) {
        GuestEntitlement entitlement = loadActiveCourseEntitlement(token);
        if (request == null || request.courseId() == null || request.courseId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Course id is required.");
        }
        Long courseId = parseCourseId(request.courseId());
        List<Course> accessibleCourses = resolveAccessibleCourses(entitlement);
        Map<Long, Course> coursesById = accessibleCourses.stream()
                .collect(Collectors.toMap(Course::getId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Course course = coursesById.get(courseId);
        if (course == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Course was not found for this access link.");
        }

        Integer requestDuration = positiveInteger(request.durationSeconds());
        if (requestDuration == null) {
            refreshMissingVideoDuration(course);
        } else if (course.getDurationSeconds() == null || course.getDurationSeconds() <= 0) {
            course.setDurationSeconds(requestDuration);
        }

        CourseAccessProgress progress = progressRepository.findByEntitlement_IdAndCourse_Id(entitlement.getId(), course.getId())
                .orElseGet(() -> {
                    CourseAccessProgress created = new CourseAccessProgress();
                    created.setEntitlement(entitlement);
                    created.setCourse(course);
                    return created;
                });
        int position = Math.max(0, request.positionSeconds() == null ? progress.getPositionSeconds() : request.positionSeconds());
        Integer duration = requestDuration != null ? requestDuration : firstPositive(progress.getDurationSeconds(), course.getDurationSeconds());
        if (duration != null && duration > 0) position = Math.min(position, duration);
        boolean completed = Boolean.TRUE.equals(request.completed()) || (duration != null && duration > 0 && position >= Math.floor(duration * 0.9));
        double percent = computePercent(position, duration, completed, request.progressPercent());

        progress.setPositionSeconds(position);
        progress.setDurationSeconds(duration);
        progress.setProgressPercent(percent);
        progress.setCompleted(completed);
        progress.setLastPlayedAt(Instant.now());
        progress = progressRepository.save(progress);

        return toProgressResponse(progress, course.getDurationSeconds());
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

    private Map<Long, CourseAccessProgress> loadProgressByCourseId(Long entitlementId) {
        if (progressRepository == null || entitlementId == null) return Map.of();
        return progressRepository.findAllByEntitlement_Id(entitlementId).stream()
                .filter(progress -> progress.getCourse() != null && progress.getCourse().getId() != null)
                .collect(Collectors.toMap(progress -> progress.getCourse().getId(), Function.identity(), (left, right) -> left, LinkedHashMap::new));
    }

    private void refreshMissingVideoDuration(Course course) {
        if (course == null || course.getMediaType() != CourseMediaType.VIDEO) return;
        if (course.getDurationSeconds() != null && course.getDurationSeconds() > 0) return;
        if (bunnyMediaService == null) return;
        Integer duration = bunnyMediaService.fetchVideoDurationSeconds(course);
        if (duration != null && duration > 0) {
            course.setDurationSeconds(duration);
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

    private Long parseCourseId(String raw) {
        try {
            return Long.parseLong(raw.trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Course id is invalid.");
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
                durationSeconds(course, progress),
                progressPositionSeconds(progress),
                progressDurationSeconds(course, progress),
                progressPercent(progress, course.getDurationSeconds()),
                progress == null ? Boolean.FALSE : progress.isCompleted(),
                progress == null || progress.getLastPlayedAt() == null ? null : progress.getLastPlayedAt().toString()
        );
    }

    private CourseProgressResponse toProgressResponse(CourseAccessProgress progress, Integer courseDurationSeconds) {
        return new CourseProgressResponse(
                progress.getPositionSeconds(),
                firstPositive(progress.getDurationSeconds(), courseDurationSeconds),
                computePercent(progress.getPositionSeconds(), firstPositive(progress.getDurationSeconds(), courseDurationSeconds), progress.isCompleted(), progress.getProgressPercent()),
                progress.isCompleted(),
                progress.getLastPlayedAt() == null ? null : progress.getLastPlayedAt().toString()
        );
    }

    private Integer durationSeconds(Course course, CourseAccessProgress progress) {
        return firstPositive(progress == null ? null : progress.getDurationSeconds(), course == null ? null : course.getDurationSeconds());
    }

    private Integer progressPositionSeconds(CourseAccessProgress progress) {
        return progress == null ? 0 : Math.max(0, progress.getPositionSeconds());
    }

    private Integer progressDurationSeconds(Course course, CourseAccessProgress progress) {
        return firstPositive(progress == null ? null : progress.getDurationSeconds(), course == null ? null : course.getDurationSeconds());
    }

    private Double progressPercent(CourseAccessProgress progress, Integer durationSeconds) {
        if (progress == null) return 0.0;
        return computePercent(progress.getPositionSeconds(), firstPositive(progress.getDurationSeconds(), durationSeconds), progress.isCompleted(), progress.getProgressPercent());
    }

    private static double computePercent(Integer positionSeconds, Integer durationSeconds, boolean completed, Double requestedPercent) {
        if (completed) return 100.0;
        if (durationSeconds != null && durationSeconds > 0 && positionSeconds != null && positionSeconds > 0) {
            double value = (positionSeconds.doubleValue() / durationSeconds.doubleValue()) * 100.0;
            return clampPercent(value);
        }
        return clampPercent(requestedPercent == null ? 0.0 : requestedPercent);
    }

    private static double clampPercent(Double value) {
        if (value == null || value.isNaN() || value.isInfinite()) return 0.0;
        return Math.max(0.0, Math.min(100.0, Math.round(value * 10.0) / 10.0));
    }

    private static Integer positiveInteger(Integer value) {
        return value == null || value <= 0 ? null : value;
    }

    private static Integer firstPositive(Integer first, Integer second) {
        if (first != null && first > 0) return first;
        if (second != null && second > 0) return second;
        return null;
    }

    public record CourseProgressRequest(
            String courseId,
            Integer positionSeconds,
            Integer durationSeconds,
            Double progressPercent,
            Boolean completed
    ) {}

    public record CourseProgressResponse(
            Integer positionSeconds,
            Integer durationSeconds,
            Double progressPercent,
            Boolean completed,
            String lastPlayedAt
    ) {}

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
            Double progressPercent,
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
            Double progressPercent,
            Boolean completed,
            String lastPlayedAt,
            String validUntil,
            String accessMetadataJson,
            List<CourseItemResponse> courses
    ) {}
}
