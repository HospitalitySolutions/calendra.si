package com.example.app.course;

import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestProduct;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
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

    public CourseAccessController(GuestEntitlementRepository entitlements) {
        this.entitlements = entitlements;
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
        GuestProduct product = entitlement.getProduct();
        Course course = product.getCourse();
        if (course == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Course was not found.");
        }
        return new CourseAccessResponse(
                String.valueOf(course.getId()),
                course.getTitle(),
                course.getDescription(),
                course.getMediaType().name(),
                course.getThumbnailUrl(),
                course.getBunnyLibraryId(),
                course.getBunnyVideoId(),
                course.getBunnyCdnUrl(),
                course.getDurationSeconds(),
                entitlement.getValidUntil() == null ? null : entitlement.getValidUntil().toString(),
                entitlement.getMetadataJson()
        );
    }

    private void validateMembershipSource(GuestEntitlement entitlement, Instant now) {
        String raw = entitlement.getMetadataJson();
        if (raw == null || raw.isBlank()) return;
        try {
            JsonNode root = JSON.readTree(raw);
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
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Course access is not active.");
        }
    }

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
            String accessMetadataJson
    ) {}
}
