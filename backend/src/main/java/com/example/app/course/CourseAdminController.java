package com.example.app.course;

import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestOrderItemRepository;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.settings.CourseModuleAccessService;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/courses")
@PreAuthorize("hasRole('ADMIN')")
public class CourseAdminController {
    private final CourseRepository courses;
    private final GuestProductRepository products;
    private final GuestOrderItemRepository orderItems;
    private final GuestEntitlementRepository entitlements;
    private final MembershipCourseRepository membershipCourses;
    private final BunnyMediaService bunnyMediaService;
    private final CourseModuleAccessService courseModuleAccessService;

    @Autowired
    public CourseAdminController(
            CourseRepository courses,
            GuestProductRepository products,
            GuestOrderItemRepository orderItems,
            GuestEntitlementRepository entitlements,
            MembershipCourseRepository membershipCourses,
            BunnyMediaService bunnyMediaService,
            CourseModuleAccessService courseModuleAccessService
    ) {
        this.courses = courses;
        this.products = products;
        this.orderItems = orderItems;
        this.entitlements = entitlements;
        this.membershipCourses = membershipCourses;
        this.bunnyMediaService = bunnyMediaService;
        this.courseModuleAccessService = courseModuleAccessService;
    }

    /** Backwards-compatible constructor for older unit tests. Runtime wiring uses the @Autowired constructor above. */
    public CourseAdminController(
            CourseRepository courses,
            GuestProductRepository products,
            GuestOrderItemRepository orderItems,
            GuestEntitlementRepository entitlements,
            MembershipCourseRepository membershipCourses,
            BunnyMediaService bunnyMediaService
    ) {
        this(courses, products, orderItems, entitlements, membershipCourses, bunnyMediaService, null);
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<CourseResponse> list(@AuthenticationPrincipal User me) {
        return courses.findAllByCompanyIdOrderBySortOrderAscIdAsc(me.getCompany().getId()).stream()
                .map(this::toResponse)
                .toList();
    }

    @PostMapping
    @Transactional
    public CourseResponse create(@RequestBody CourseRequest request, @AuthenticationPrincipal User me) {
        assertCoursesEnabled(me.getCompany().getId());
        Course course = new Course();
        course.setCompany(me.getCompany());
        apply(course, request);
        course = courses.save(course);
        return toResponse(course);
    }

    @PutMapping("/{id}")
    @Transactional
    public CourseResponse update(@PathVariable Long id, @RequestBody CourseRequest request, @AuthenticationPrincipal User me) {
        Course course = courses.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found."));
        if (isRequestedActive(request)) {
            assertCoursesEnabled(me.getCompany().getId());
        }
        apply(course, request);
        return toResponse(courses.save(course));
    }

    @PostMapping("/{id}/media/direct-upload")
    @Transactional
    public DirectUploadSessionResponse createDirectUploadSession(
            @PathVariable Long id,
            @RequestBody DirectUploadSessionRequest request,
            @RequestParam(name = "deleteOld", defaultValue = "false") boolean deleteOld,
            @AuthenticationPrincipal User me
    ) {
        Course course = courses.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found."));
        assertCoursesEnabled(me.getCompany().getId());
        if (course.getMediaType() != CourseMediaType.VIDEO) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct Bunny upload is supported for video courses. Audio upload still uses protected backend upload.");
        }
        String contentType = request == null ? null : request.contentType();
        if (contentType != null && !contentType.toLowerCase(Locale.ROOT).startsWith("video/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please upload a video file for video courses.");
        }
        CourseMediaSnapshot oldMedia = snapshotMedia(course);
        try {
            BunnyMediaService.DirectVideoUploadSession session = bunnyMediaService.createDirectVideoUploadSession(
                    course,
                    request == null ? null : request.fileName(),
                    contentType
            );
            if (deleteOld) {
                try {
                    deletePreviousMedia(oldMedia, session.bunnyLibraryId(), session.bunnyVideoId(), null);
                } catch (Exception ex) {
                    cleanupNewDirectVideo(session);
                    throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Old course media could not be deleted from Bunny: " + ex.getMessage());
                }
            }
            course.setStatus(CourseStatus.PROCESSING);
            course.setActive(false);
            course.setBunnyLibraryId(session.bunnyLibraryId());
            course.setBunnyLibraryName(session.bunnyLibraryName());
            course.setBunnyVideoId(session.bunnyVideoId());
            course.setBunnyStoragePath(null);
            course.setBunnyCdnUrl(null);
            course.setFileName(session.fileName());
            course.setContentType(session.contentType());
            course.setMetadataJson("{\"uploadStatus\":\"DIRECT_UPLOAD_PENDING\",\"deleteOldMedia\":" + deleteOld + "}");
            courses.save(course);
            return new DirectUploadSessionResponse(
                    session.uploadType(),
                    session.uploadUrl(),
                    session.bunnyLibraryId(),
                    session.bunnyLibraryName(),
                    session.bunnyVideoId(),
                    session.authorizationSignature(),
                    session.authorizationExpire(),
                    session.fileName(),
                    session.contentType(),
                    session.title()
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Could not create Bunny direct upload session: " + ex.getMessage());
        }
    }

    @PostMapping("/{id}/media/direct-complete")
    @Transactional
    public CourseResponse completeDirectUpload(
            @PathVariable Long id,
            @RequestBody DirectUploadCompleteRequest request,
            @AuthenticationPrincipal User me
    ) {
        Course course = courses.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found."));
        assertCoursesEnabled(me.getCompany().getId());
        if (course.getMediaType() != CourseMediaType.VIDEO) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Direct upload completion is supported for video courses only.");
        }
        String videoId = request == null ? null : request.bunnyVideoId();
        if (videoId == null || videoId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bunny video id is required.");
        }
        if (course.getBunnyVideoId() != null && !course.getBunnyVideoId().isBlank() && !course.getBunnyVideoId().equals(videoId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The completed video id does not match the current course upload session.");
        }
        course.setBunnyVideoId(videoId);
        if (request.fileName() != null && !request.fileName().isBlank()) course.setFileName(request.fileName().trim());
        if (request.contentType() != null && !request.contentType().isBlank()) course.setContentType(request.contentType().trim());
        course.setMetadataJson("{\"uploadStatus\":\"UPLOADED_TO_BUNNY_STREAM_DIRECT\"}");
        course.setStatus(CourseStatus.ACTIVE);
        course.setActive(true);
        return toResponse(courses.save(course));
    }

    @PostMapping("/{id}/media")
    @Transactional
    public CourseResponse uploadMedia(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @RequestParam(name = "deleteOld", defaultValue = "false") boolean deleteOld,
            @AuthenticationPrincipal User me
    ) {
        Course course = courses.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found."));
        assertCoursesEnabled(me.getCompany().getId());
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Upload file is required.");
        }
        String contentType = file.getContentType();
        if (course.getMediaType() == CourseMediaType.VIDEO && contentType != null && !contentType.toLowerCase(Locale.ROOT).startsWith("video/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please upload a video file for video courses.");
        }
        if (course.getMediaType() == CourseMediaType.AUDIO && contentType != null && !contentType.toLowerCase(Locale.ROOT).startsWith("audio/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please upload an audio file for audio courses.");
        }
        CourseMediaSnapshot oldMedia = snapshotMedia(course);
        try {
            course.setStatus(CourseStatus.PROCESSING);
            BunnyMediaService.CourseUploadResult result = bunnyMediaService.upload(course, file);
            if (deleteOld) {
                try {
                    deletePreviousMedia(oldMedia, result.bunnyLibraryId(), result.bunnyVideoId(), result.bunnyStoragePath());
                } catch (Exception ex) {
                    cleanupUploadedReplacement(result);
                    throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Old course media could not be deleted from Bunny: " + ex.getMessage());
                }
            }
            if (result.bunnyLibraryId() != null) course.setBunnyLibraryId(result.bunnyLibraryId());
            if (result.bunnyLibraryName() != null) course.setBunnyLibraryName(result.bunnyLibraryName());
            if (result.bunnyVideoId() != null) {
                course.setBunnyVideoId(result.bunnyVideoId());
                course.setBunnyStoragePath(null);
                course.setBunnyCdnUrl(null);
            }
            if (result.bunnyStoragePath() != null || result.bunnyCdnUrl() != null) {
                course.setBunnyVideoId(null);
                course.setBunnyStoragePath(result.bunnyStoragePath());
                course.setBunnyCdnUrl(result.bunnyCdnUrl());
            }
            course.setFileName(file.getOriginalFilename());
            course.setContentType(contentType);
            course.setMetadataJson("{\"uploadStatus\":" + jsonString(result.uploadStatus()) + ",\"deleteOldMedia\":" + deleteOld + "}");
            boolean mediaReady = course.getMediaType() == CourseMediaType.AUDIO
                    ? (result.bunnyStoragePath() != null || result.bunnyCdnUrl() != null)
                    : result.bunnyVideoId() != null;
            course.setStatus(mediaReady ? CourseStatus.ACTIVE : CourseStatus.PROCESSING);
            course.setActive(mediaReady);
            return toResponse(courses.save(course));
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            course.setStatus(CourseStatus.DRAFT);
            courses.save(course);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Course media upload failed: " + ex.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Course course = courses.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Course not found."));
        GuestProduct product = course.getGuestProduct();
        if (product != null && (orderItems.countByProductId(product.getId()) > 0 || entitlements.countByProductId(product.getId()) > 0)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This course already has purchases. Archive it instead of deleting it.");
        }
        if (membershipCourses.countByCourseId(course.getId()) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This course is included in at least one membership. Remove it from memberships first.");
        }
        try {
            bunnyMediaService.deleteCourseMedia(course);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Course media could not be deleted from Bunny: " + ex.getMessage());
        }
        if (product != null) products.delete(product);
        courses.delete(course);
    }

    private void assertCoursesEnabled(Long companyId) {
        if (courseModuleAccessService != null) {
            courseModuleAccessService.assertEnabled(companyId);
        }
    }

    private static boolean isRequestedActive(CourseRequest request) {
        return request == null || request.active() == null || Boolean.TRUE.equals(request.active());
    }

    private void apply(Course course, CourseRequest request) {
        String title = request.title() == null ? "" : request.title().trim();
        if (title.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Course title is required.");
        BigDecimal price = request.priceGross() == null ? BigDecimal.ZERO : request.priceGross().setScale(2, RoundingMode.HALF_UP);
        if (price.compareTo(BigDecimal.ZERO) < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Course price must be zero or greater.");
        course.setTitle(title);
        course.setDescription(trimToNull(request.description()));
        course.setMediaType(parseMediaType(request.mediaType()));
        course.setPriceGross(price);
        course.setCurrency(normalizeCurrency(request.currency()));
        course.setActive(request.active() == null || Boolean.TRUE.equals(request.active()));
        course.setGuestVisible(request.guestVisible() == null || Boolean.TRUE.equals(request.guestVisible()));
        course.setSortOrder(request.sortOrder() == null ? 0 : request.sortOrder());
        course.setThumbnailUrl(trimToNull(request.thumbnailUrl()));
        CourseStatus requestedStatus = parseStatus(request.status());
        if (requestedStatus != null) course.setStatus(requestedStatus);
    }

    private CourseResponse toResponse(Course course) {
        return new CourseResponse(
                course.getId(),
                course.getGuestProduct() == null ? null : course.getGuestProduct().getId(),
                course.getTitle(),
                course.getDescription(),
                course.getMediaType().name(),
                course.getStatus().name(),
                course.getPriceGross(),
                course.getCurrency(),
                course.isActive(),
                course.isGuestVisible(),
                course.getSortOrder(),
                course.getThumbnailUrl(),
                course.getBunnyLibraryId(),
                course.getBunnyLibraryName(),
                course.getBunnyVideoId(),
                course.getBunnyStoragePath(),
                course.getBunnyCdnUrl(),
                course.getDurationSeconds(),
                course.getFileName(),
                course.getContentType(),
                course.getCreatedAt(),
                course.getUpdatedAt()
        );
    }

    private static CourseMediaType parseMediaType(String raw) {
        if (raw == null || raw.isBlank()) return CourseMediaType.VIDEO;
        try { return CourseMediaType.valueOf(raw.trim().toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported course media type."); }
    }

    private static CourseStatus parseStatus(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try { return CourseStatus.valueOf(raw.trim().toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported course status."); }
    }

    private static String normalizeCurrency(String raw) {
        String normalized = raw == null || raw.trim().isBlank() ? "EUR" : raw.trim().toUpperCase(Locale.ROOT);
        if (normalized.length() != 3) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Currency must be a 3-letter code.");
        return normalized;
    }

    private static String trimToNull(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String jsonString(String value) {
        if (value == null) return "null";
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private CourseMediaSnapshot snapshotMedia(Course course) {
        return new CourseMediaSnapshot(
                course.getBunnyLibraryId(),
                course.getBunnyLibraryName(),
                course.getBunnyVideoId(),
                course.getBunnyStoragePath()
        );
    }

    private void deletePreviousMedia(
            CourseMediaSnapshot oldMedia,
            String replacementLibraryId,
            String replacementVideoId,
            String replacementStoragePath
    ) {
        if (oldMedia == null) return;
        boolean sameVideo = sameText(oldMedia.bunnyVideoId(), replacementVideoId)
                && sameText(oldMedia.bunnyLibraryId(), replacementLibraryId);
        if (hasText(oldMedia.bunnyVideoId()) && !sameVideo) {
            bunnyMediaService.deleteVideoMedia(oldMedia.bunnyLibraryId(), oldMedia.bunnyLibraryName(), oldMedia.bunnyVideoId());
        }
        boolean sameAudio = sameText(oldMedia.bunnyStoragePath(), replacementStoragePath);
        if (hasText(oldMedia.bunnyStoragePath()) && !sameAudio) {
            bunnyMediaService.deleteAudioMedia(oldMedia.bunnyStoragePath());
        }
    }

    private void cleanupNewDirectVideo(BunnyMediaService.DirectVideoUploadSession session) {
        try {
            if (session != null) {
                bunnyMediaService.deleteVideoMedia(session.bunnyLibraryId(), session.bunnyLibraryName(), session.bunnyVideoId());
            }
        } catch (Exception ignored) {
            // Best-effort cleanup only; the original Bunny delete error is returned to the user.
        }
    }

    private void cleanupUploadedReplacement(BunnyMediaService.CourseUploadResult result) {
        try {
            bunnyMediaService.deleteUploadedMedia(result);
        } catch (Exception ignored) {
            // Best-effort cleanup only; the original Bunny delete error is returned to the user.
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isBlank();
    }

    private static boolean sameText(String left, String right) {
        return Objects.equals(trimToNull(left), trimToNull(right));
    }

    private record CourseMediaSnapshot(
            String bunnyLibraryId,
            String bunnyLibraryName,
            String bunnyVideoId,
            String bunnyStoragePath
    ) {}

    public record DirectUploadSessionRequest(
            String fileName,
            String contentType,
            Long sizeBytes
    ) {}

    public record DirectUploadCompleteRequest(
            String bunnyVideoId,
            String fileName,
            String contentType
    ) {}

    public record DirectUploadSessionResponse(
            String uploadType,
            String uploadUrl,
            String bunnyLibraryId,
            String bunnyLibraryName,
            String bunnyVideoId,
            String authorizationSignature,
            long authorizationExpire,
            String fileName,
            String contentType,
            String title
    ) {}

    public record CourseRequest(
            String title,
            String description,
            String mediaType,
            String status,
            BigDecimal priceGross,
            String currency,
            Boolean active,
            Boolean guestVisible,
            Integer sortOrder,
            String thumbnailUrl
    ) {}

    public record CourseResponse(
            Long id,
            Long guestProductId,
            String title,
            String description,
            String mediaType,
            String status,
            BigDecimal priceGross,
            String currency,
            boolean active,
            boolean guestVisible,
            int sortOrder,
            String thumbnailUrl,
            String bunnyLibraryId,
            String bunnyLibraryName,
            String bunnyVideoId,
            String bunnyStoragePath,
            String bunnyCdnUrl,
            Integer durationSeconds,
            String fileName,
            String contentType,
            Instant createdAt,
            Instant updatedAt
    ) {}
}
