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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    public CourseAccessController(
            GuestEntitlementRepository entitlements,
            CourseRepository courses,
            MembershipCourseRepository membershipCourses
    ) {
        this.entitlements = entitlements;
        this.courses = courses;
        this.membershipCourses = membershipCourses;
    }

    @GetMapping("/{token}")
    @Transactional(readOnly = true)
    public CourseAccessResponse open(@PathVariable String token) {
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
        List<Course> accessibleCourses = resolveAccessibleCourses(entitlement);
        if (accessibleCourses.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Course was not found.");
        }
        Course primary = accessibleCourses.get(0);
        List<CourseItemResponse> courseItems = accessibleCourses.stream()
                .map(this::toItem)
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
                primary.getDurationSeconds(),
                entitlement.getValidUntil() == null ? null : entitlement.getValidUntil().toString(),
                entitlement.getMetadataJson(),
                courseItems
        );
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

    private CourseItemResponse toItem(Course course) {
        return new CourseItemResponse(
                String.valueOf(course.getId()),
                course.getTitle(),
                course.getDescription(),
                course.getMediaType().name(),
                course.getThumbnailUrl(),
                course.getBunnyLibraryId(),
                course.getBunnyVideoId(),
                course.getBunnyCdnUrl(),
                course.getDurationSeconds()
        );
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
            Integer durationSeconds
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
            String validUntil,
            String accessMetadataJson,
            List<CourseItemResponse> courses
    ) {}
}
