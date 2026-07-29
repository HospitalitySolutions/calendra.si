package com.example.app.session;

import com.example.app.google.calendar.GoogleCalendarEntityType;
import com.example.app.google.calendar.GoogleCalendarSyncQueueService;
import com.example.app.security.SecurityUtils;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookings/personal-blocks")
public class PersonalCalendarBlockController {
    private final PersonalCalendarBlockRepository repo;
    private final UserRepository users;
    private final GoogleCalendarSyncQueueService googleCalendarSyncQueueService;

    public PersonalCalendarBlockController(PersonalCalendarBlockRepository repo, UserRepository users, GoogleCalendarSyncQueueService googleCalendarSyncQueueService) {
        this.repo = repo;
        this.users = users;
        this.googleCalendarSyncQueueService = googleCalendarSyncQueueService;
    }

    public record PersonalBlockRequest(String startTime, String endTime, String task, String notes, Long consultantId, Boolean visibleToAdmins) {}
    public record PersonalBlockResponse(Long id, Long ownerId, LocalDateTime startTime, LocalDateTime endTime, String task, String notes, boolean visibleToAdmins) {}
    public record AvailabilityReleaseRequest(
            String startTime,
            String endTime,
            Long consultantId,
            boolean indefinite,
            LocalDate startDate,
            LocalDate endDate
    ) {}
    public record AvailabilityReleaseResponse(int replacedMarkers, int createdMarkers) {}
    private record AvailabilityMarkerPlan(
            PersonalCalendarBlock marker,
            List<AvailabilityBlockMetadata.Metadata> replacements,
            boolean changed
    ) {}

    @PostMapping
    @Transactional
    public PersonalBlockResponse create(@RequestBody PersonalBlockRequest req, @AuthenticationPrincipal User me) {
        var start = parseToLocalDateTime(req.startTime());
        var end = parseToLocalDateTime(req.endTime());
        if (req.task() == null || req.task().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "task is required");
        }
        User owner = resolveOwner(me, req.consultantId());
        var block = new PersonalCalendarBlock();
        block.setCompany(me.getCompany());
        block.setOwner(owner);
        block.setStartTime(start);
        block.setEndTime(end);
        block.setTask(req.task().trim());
        block.setNotes(req.notes() != null ? req.notes().trim() : null);
        block.setVisibleToAdmins(Boolean.TRUE.equals(req.visibleToAdmins()));
        block = repo.save(block);
        googleCalendarSyncQueueService.enqueueUpsert(block.getCompany(), block.getOwner().getId(), GoogleCalendarEntityType.PERSONAL_SESSION, block.getId());
        return toResponse(block);
    }

    /**
     * Removes an opened interval from hidden availability-block markers.
     *
     * <p>This is performed server-side and transactionally because calendar responses expose
     * expanded recurring occurrences that all share the same database id. Editing those expanded
     * rows directly can leave the recurrence metadata unchanged or update/delete the same marker
     * more than once.</p>
     */
    @PostMapping("/availability/release")
    @Transactional
    public AvailabilityReleaseResponse releaseAvailability(
            @RequestBody AvailabilityReleaseRequest req,
            @AuthenticationPrincipal User me
    ) {
        var companyId = me.getCompany().getId();
        User owner = resolveOwner(me, req.consultantId());
        LocalDateTime start = parseToLocalDateTime(req.startTime());
        LocalDateTime end = parseToLocalDateTime(req.endTime());
        if (!end.isAfter(start) || !end.toLocalTime().isAfter(start.toLocalTime())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "End time must be after start time within the same day");
        }

        LocalDate rangeStart = req.startDate() != null ? req.startDate() : start.toLocalDate();
        LocalDate rangeEnd = req.indefinite()
                ? null
                : (req.endDate() != null ? req.endDate() : end.toLocalDate());
        if (!req.indefinite() && (rangeEnd == null || rangeEnd.isBefore(rangeStart))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "End date must be on or after start date");
        }
        AvailabilityBlockMetadata.Metadata opened = new AvailabilityBlockMetadata.Metadata(
                rangeStart.getDayOfWeek(),
                start.toLocalTime(),
                end.toLocalTime(),
                req.indefinite(),
                rangeStart,
                rangeEnd
        );

        List<PersonalCalendarBlock> markers = repo.findAvailabilityBlockMarkersForOwner(owner.getId(), companyId);
        List<AvailabilityMarkerPlan> plans = new ArrayList<>();
        Set<AvailabilityBlockMetadata.Metadata> retainedMetadata = new LinkedHashSet<>();
        for (PersonalCalendarBlock markerBlock : markers) {
            Optional<AvailabilityBlockMetadata.Metadata> parsed = AvailabilityBlockMetadata.parse(markerBlock);
            if (parsed.isEmpty()) {
                parsed = legacyConcreteMetadata(markerBlock);
            }
            if (parsed.isEmpty()) {
                // Preserve unusual legacy cross-midnight markers rather than changing their semantics.
                continue;
            }
            AvailabilityBlockMetadata.Metadata blocked = parsed.get();
            List<AvailabilityBlockMetadata.Metadata> replacements;
            try {
                replacements = AvailabilityBlockMetadata.subtract(blocked, opened);
            } catch (IllegalArgumentException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
            }
            boolean changed = !(replacements.size() == 1 && replacements.get(0).equals(blocked));
            plans.add(new AvailabilityMarkerPlan(markerBlock, replacements, changed));
            if (!changed) {
                retainedMetadata.add(blocked);
            }
        }

        int replacedMarkers = 0;
        int createdMarkers = 0;
        for (AvailabilityMarkerPlan plan : plans) {
            if (!plan.changed()) continue;
            PersonalCalendarBlock markerBlock = plan.marker();
            googleCalendarSyncQueueService.enqueueDelete(
                    markerBlock.getCompany(), GoogleCalendarEntityType.PERSONAL_SESSION, markerBlock.getId());
            repo.delete(markerBlock);
            replacedMarkers++;
        }
        for (AvailabilityMarkerPlan plan : plans) {
            if (!plan.changed()) continue;
            PersonalCalendarBlock markerBlock = plan.marker();
            for (AvailabilityBlockMetadata.Metadata replacement : plan.replacements()) {
                // Old clients could split one expanded occurrence more than once while retaining the
                // same recurrence notes. Avoid recreating duplicate residual markers during repair.
                if (!retainedMetadata.add(replacement)) continue;
                PersonalCalendarBlock saved = new PersonalCalendarBlock();
                saved.setCompany(markerBlock.getCompany());
                saved.setOwner(markerBlock.getOwner());
                LocalDate anchorDate = firstOccurrenceDate(replacement);
                saved.setStartTime(anchorDate.atTime(replacement.startTime()));
                saved.setEndTime(anchorDate.atTime(replacement.endTime()));
                saved.setTask(AvailabilityBlockMetadata.TASK);
                saved.setNotes(AvailabilityBlockMetadata.notes(replacement));
                saved.setVisibleToAdmins(false);
                saved = repo.save(saved);
                googleCalendarSyncQueueService.enqueueUpsert(
                        saved.getCompany(), saved.getOwner().getId(), GoogleCalendarEntityType.PERSONAL_SESSION, saved.getId());
                createdMarkers++;
            }
        }
        return new AvailabilityReleaseResponse(replacedMarkers, createdMarkers);
    }

    @PutMapping("/{id}")
    @Transactional
    public PersonalBlockResponse update(@PathVariable Long id, @RequestBody PersonalBlockRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var block = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!block.getCompany().getId().equals(companyId)
                || (!SecurityUtils.isAdmin(me) && !block.getOwner().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var start = parseToLocalDateTime(req.startTime());
        var end = parseToLocalDateTime(req.endTime());
        if (req.task() == null || req.task().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "task is required");
        }
        block.setStartTime(start);
        block.setEndTime(end);
        block.setTask(req.task().trim());
        block.setNotes(req.notes() != null ? req.notes().trim() : null);
        block.setVisibleToAdmins(Boolean.TRUE.equals(req.visibleToAdmins()));
        block = repo.save(block);
        googleCalendarSyncQueueService.enqueueUpsert(block.getCompany(), block.getOwner().getId(), GoogleCalendarEntityType.PERSONAL_SESSION, block.getId());
        return toResponse(block);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var block = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!block.getCompany().getId().equals(me.getCompany().getId())
                || (!SecurityUtils.isAdmin(me) && !block.getOwner().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        googleCalendarSyncQueueService.enqueueDelete(block.getCompany(), GoogleCalendarEntityType.PERSONAL_SESSION, block.getId());
        repo.delete(block);
    }

    private User resolveOwner(User me, Long consultantId) {
        if (!SecurityUtils.isAdmin(me) || consultantId == null) {
            return me;
        }
        User owner = users.findByIdAndCompanyId(consultantId, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant"));
        if (!owner.isConsultant()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected user is not marked as consultant");
        }
        return owner;
    }

    private static Optional<AvailabilityBlockMetadata.Metadata> legacyConcreteMetadata(PersonalCalendarBlock block) {
        if (block == null || block.getStartTime() == null || block.getEndTime() == null
                || !block.getEndTime().isAfter(block.getStartTime())) {
            return Optional.empty();
        }
        LocalDate startDate = block.getStartTime().toLocalDate();
        LocalDate endDate = block.getEndTime().toLocalDate();
        LocalTime startTime = block.getStartTime().toLocalTime();
        LocalTime endTime = block.getEndTime().toLocalTime();
        if (endDate.isAfter(startDate) && LocalTime.MIDNIGHT.equals(endTime)
                && endDate.equals(startDate.plusDays(1))) {
            endDate = startDate;
            endTime = LocalTime.of(23, 59, 59);
        }
        boolean sameDay = startDate.equals(endDate);
        boolean finiteAllDayRange = LocalTime.MIDNIGHT.equals(startTime)
                && LocalTime.of(23, 59, 59).equals(endTime);
        if (!sameDay && !finiteAllDayRange) {
            return Optional.empty();
        }
        return Optional.of(new AvailabilityBlockMetadata.Metadata(
                startDate.getDayOfWeek(),
                startTime,
                endTime,
                false,
                startDate,
                endDate
        ));
    }

    private static LocalDate firstOccurrenceDate(AvailabilityBlockMetadata.Metadata metadata) {
        if (metadata.startDate() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Availability marker start date is missing");
        }
        boolean dailyAllDayRange = !metadata.indefinite()
                && metadata.endDate() != null
                && metadata.endDate().isAfter(metadata.startDate())
                && LocalTime.MIDNIGHT.equals(metadata.startTime())
                && LocalTime.of(23, 59, 59).equals(metadata.endTime());
        return dailyAllDayRange
                ? metadata.startDate()
                : metadata.startDate().with(TemporalAdjusters.nextOrSame(metadata.dayOfWeek()));
    }

    private static PersonalBlockResponse toResponse(PersonalCalendarBlock b) {
        return new PersonalBlockResponse(b.getId(), b.getOwner().getId(), b.getStartTime(), b.getEndTime(), b.getTask(), b.getNotes(), b.isVisibleToAdmins());
    }

    private static LocalDateTime parseToLocalDateTime(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startTime/endTime are required");
        }
        try {
            if (value.endsWith("Z") || value.matches(".*[+-]\\d\\d:\\d\\d$")) {
                return java.time.OffsetDateTime.parse(value).toLocalDateTime();
            }
            return LocalDateTime.parse(value, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date-time: " + value);
        }
    }
}
