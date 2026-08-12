package com.example.app.group;

import com.example.app.client.Client;
import com.example.app.common.TimeService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.user.User;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Applies a saved group membership delta to all still-upcoming RESERVED occurrences
 * that are linked to the group. Historical, cancelled, no-show and checked-out
 * occurrences are deliberately left untouched.
 */
@Service
public class ClientGroupBookingSyncService {
    private final ClientGroupRepository groups;
    private final SessionBookingRepository bookings;
    private final SessionBookingCreationService bookingCreationService;
    private final TimeService timeService;

    public ClientGroupBookingSyncService(
            ClientGroupRepository groups,
            SessionBookingRepository bookings,
            SessionBookingCreationService bookingCreationService,
            TimeService timeService
    ) {
        this.groups = groups;
        this.bookings = bookings;
        this.bookingCreationService = bookingCreationService;
        this.timeService = timeService;
    }

    public record SkippedSession(Long bookingId, String reason) {}

    public record SyncResult(
            int eligibleSessionCount,
            int updatedSessionCount,
            int unchangedSessionCount,
            int skippedSessionCount,
            int addedParticipants,
            int removedParticipants,
            List<SkippedSession> skippedSessions
    ) {}

    public SyncResult syncFutureSessions(
            Long groupId,
            List<Long> requestedAddedClientIds,
            List<Long> requestedRemovedClientIds,
            User actor
    ) {
        if (actor == null || actor.getCompany() == null || actor.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        Long companyId = actor.getCompany().getId();
        ClientGroup group = groups.findByIdAndCompanyId(groupId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found."));

        Set<Long> currentMemberIds = group.getMembers().stream()
                .map(Client::getId)
                .filter(Objects::nonNull)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));

        // The membership mutation happens before the user chooses whether to refresh
        // sessions. Only apply additions that are still members and removals that are
        // still absent, so a stale dialog can never undo a newer group edit.
        LinkedHashSet<Long> addedClientIds = sanitizeIds(requestedAddedClientIds);
        addedClientIds.retainAll(currentMemberIds);
        LinkedHashSet<Long> removedClientIds = sanitizeIds(requestedRemovedClientIds);
        removedClientIds.removeAll(currentMemberIds);

        List<Occurrence> occurrences = eligibleOccurrences(companyId, groupId);
        int updatedSessions = 0;
        int unchangedSessions = 0;
        int addedParticipants = 0;
        int removedParticipants = 0;
        List<SkippedSession> skipped = new ArrayList<>();

        for (Occurrence occurrence : occurrences) {
            SessionBooking representative = occurrence.representative();
            Long representativeId = representative.getId();
            LinkedHashSet<Long> currentClientIds = occurrence.activeRows().stream()
                    .map(SessionBooking::getClient)
                    .filter(Objects::nonNull)
                    .map(Client::getId)
                    .filter(Objects::nonNull)
                    .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));

            boolean changed = false;
            boolean occurrenceSkipped = false;
            String firstSkipReason = null;

            // Apply only the membership delta that triggered the prompt. This preserves
            // guests that were intentionally added/removed on one occurrence only.
            for (Long clientId : removedClientIds) {
                if (!currentClientIds.contains(clientId)) continue;
                try {
                    var response = bookingCreationService.removeGroupSessionParticipant(representativeId, clientId, actor);
                    if (response != null && response.id() != null) representativeId = response.id();
                    currentClientIds.remove(clientId);
                    removedParticipants++;
                    changed = true;
                } catch (ResponseStatusException ex) {
                    if (!isSkippableValidation(ex)) throw ex;
                    occurrenceSkipped = true;
                    if (firstSkipReason == null) firstSkipReason = validationReason(ex);
                }
            }

            for (Long clientId : addedClientIds) {
                if (currentClientIds.contains(clientId)) continue;
                try {
                    var response = bookingCreationService.addGroupSessionParticipant(representativeId, clientId, actor);
                    if (response != null && response.id() != null) representativeId = response.id();
                    currentClientIds.add(clientId);
                    addedParticipants++;
                    changed = true;
                } catch (ResponseStatusException ex) {
                    if (!isSkippableValidation(ex)) throw ex;
                    occurrenceSkipped = true;
                    if (firstSkipReason == null) firstSkipReason = validationReason(ex);
                }
            }

            if (changed) updatedSessions++;
            else unchangedSessions++;
            if (occurrenceSkipped) {
                skipped.add(new SkippedSession(
                        representative.getId(),
                        firstSkipReason == null ? "Session could not be synchronized." : firstSkipReason
                ));
            }
        }

        return new SyncResult(
                occurrences.size(),
                updatedSessions,
                unchangedSessions,
                skipped.size(),
                addedParticipants,
                removedParticipants,
                List.copyOf(skipped)
        );
    }

    private List<Occurrence> eligibleOccurrences(Long companyId, Long groupId) {
        LocalDateTime now = timeService.localDateTime(ZoneId.systemDefault(), companyId);
        List<SessionBooking> rows = bookings.findByCompanyIdAndClientGroupIdOrderByStartTimeAsc(companyId, groupId);
        Map<String, List<SessionBooking>> byOccurrence = new LinkedHashMap<>();
        for (SessionBooking row : rows) {
            if (row == null || row.getStartTime() == null || !row.getStartTime().isAfter(now)) continue;
            byOccurrence.computeIfAbsent(groupKey(row), ignored -> new ArrayList<>()).add(row);
        }

        List<Occurrence> result = new ArrayList<>();
        for (List<SessionBooking> occurrenceRows : byOccurrence.values()) {
            List<SessionBooking> activeRows = occurrenceRows.stream()
                    .filter(row -> SessionBookingStatus.RESERVED.equals(
                            SessionBookingStatus.normalizeStored(row.getBookingStatus())))
                    .sorted(Comparator.comparing(SessionBooking::getId))
                    .toList();
            if (activeRows.isEmpty()) continue;

            // If this logical occurrence has already moved into an attended state,
            // do not let a later group edit rewrite its participant/billing history.
            boolean alreadyAttended = occurrenceRows.stream().anyMatch(row -> {
                String status = SessionBookingStatus.normalizeStored(row.getBookingStatus());
                return SessionBookingStatus.CHECKED_OUT.equals(status)
                        || SessionBookingStatus.NO_SHOW.equals(status)
                        || SessionBookingStatus.ONGOING.equals(status);
            });
            if (alreadyAttended) continue;

            SessionBooking representative = activeRows.get(0);
            result.add(new Occurrence(representative, activeRows));
        }
        result.sort(Comparator.comparing(item -> item.representative().getStartTime()));
        return result;
    }

    private static boolean isSkippableValidation(ResponseStatusException ex) {
        int status = ex.getStatusCode().value();
        return status == HttpStatus.BAD_REQUEST.value() || status == HttpStatus.CONFLICT.value();
    }

    private static String validationReason(ResponseStatusException ex) {
        String reason = ex.getReason();
        return reason == null || reason.isBlank() ? "Session could not be synchronized." : reason;
    }

    private static LinkedHashSet<Long> sanitizeIds(List<Long> ids) {
        LinkedHashSet<Long> result = new LinkedHashSet<>();
        if (ids == null) return result;
        for (Long id : ids) {
            if (id != null && id > 0) result.add(id);
        }
        return result;
    }

    private static String groupKey(SessionBooking booking) {
        String key = booking.getBookingGroupKey();
        if (key != null && !key.isBlank()) return key;
        return "legacy-" + booking.getId();
    }

    private record Occurrence(SessionBooking representative, List<SessionBooking> activeRows) {}
}
