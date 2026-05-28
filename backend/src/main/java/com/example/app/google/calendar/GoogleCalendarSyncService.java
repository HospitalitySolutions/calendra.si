package com.example.app.google.calendar;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.session.CalendarTodo;
import com.example.app.session.CalendarTodoRepository;
import com.example.app.session.PersonalCalendarBlock;
import com.example.app.session.PersonalCalendarBlockRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.client.HttpClientErrorException;

@Service
public class GoogleCalendarSyncService {
    private final GoogleCalendarConfig config;
    private final GoogleCalendarConnectionService connectionService;
    private final GoogleCalendarApiClient apiClient;
    private final GoogleCalendarEventMapper mapper;
    private final GoogleCalendarConnectionRepository connections;
    private final GoogleCalendarEventLinkRepository links;
    private final SessionBookingRepository bookings;
    private final PersonalCalendarBlockRepository personalBlocks;
    private final CalendarTodoRepository todos;
    private final ClientRepository clients;

    public GoogleCalendarSyncService(GoogleCalendarConfig config, GoogleCalendarConnectionService connectionService, GoogleCalendarApiClient apiClient, GoogleCalendarEventMapper mapper, GoogleCalendarConnectionRepository connections, GoogleCalendarEventLinkRepository links, SessionBookingRepository bookings, PersonalCalendarBlockRepository personalBlocks, CalendarTodoRepository todos, ClientRepository clients) {
        this.config = config;
        this.connectionService = connectionService;
        this.apiClient = apiClient;
        this.mapper = mapper;
        this.connections = connections;
        this.links = links;
        this.bookings = bookings;
        this.personalBlocks = personalBlocks;
        this.todos = todos;
        this.clients = clients;
    }

    @Transactional
    public void upsertToGoogle(GoogleCalendarSyncJob job) throws Exception {
        GoogleCalendarConnection c = requireConnection(job);
        if (c.getStatus() != GoogleCalendarConnectionStatus.ACTIVE || c.getSyncDirection() == GoogleCalendarSyncDirection.GOOGLE_TO_CALENDRA || job.getAppEntityType() == null) return;
        if (job.getAppEntityType() == GoogleCalendarEntityType.TODO) {
            upsertTodoToGoogleTask(job, c);
            return;
        }
        ObjectNode event = switch (job.getAppEntityType()) {
            case SESSION_BOOKING -> mapper.toGoogleEvent(loadBooking(job));
            case PERSONAL_SESSION -> mapper.toGoogleEvent(loadPersonalBlock(job));
            case TODO -> mapper.toGoogleEvent(loadTodo(job));
            case GOOGLE_BUSY_BLOCK -> null;
        };
        if (event == null) return;
        String eventHash = mapper.hash(event);
        GoogleCalendarEventLink link = links.findByConnection_IdAndCompany_IdAndAppEntityTypeAndAppEntityId(c.getId(), job.getCompany().getId(), job.getAppEntityType(), job.getAppEntityId()).orElse(null);
        JsonNode googleEvent;
        String token = connectionService.accessToken(c);
        if (link == null || link.getDeletedAt() != null || link.getGoogleEventId() == null || link.getGoogleEventId().isBlank()) {
            googleEvent = apiClient.insertEvent(token, c.getCalendarId(), event);
            if (link == null) {
                link = new GoogleCalendarEventLink();
                link.setCompany(job.getCompany());
                link.setConnection(c);
                link.setCalendarId(c.getCalendarId());
                link.setAppEntityType(job.getAppEntityType());
                link.setAppEntityId(job.getAppEntityId());
                link.setOrigin(GoogleCalendarEventOrigin.CALENDRA);
            }
        } else {
            googleEvent = apiClient.updateEvent(token, link.getCalendarId(), link.getGoogleEventId(), event);
        }
        applyGoogleFields(link, googleEvent, eventHash);
        links.save(link);
    }

    private void upsertTodoToGoogleTask(GoogleCalendarSyncJob job, GoogleCalendarConnection c) throws Exception {
        if (c.getScopes() != null && !c.getScopes().contains("https://www.googleapis.com/auth/tasks")) {
            c.setStatus(GoogleCalendarConnectionStatus.NEEDS_RECONNECT);
            c.setLastError("Reconnect Google Calendar to add Google Tasks permission so Calendra ToDos can sync as Google Tasks.");
            connections.save(c);
            return;
        }
        CalendarTodo todo = loadTodo(job);
        ObjectNode task = mapper.toGoogleTask(todo);
        String taskHash = mapper.hash(task);
        GoogleCalendarEventLink link = links.findByConnection_IdAndCompany_IdAndAppEntityTypeAndAppEntityId(c.getId(), job.getCompany().getId(), GoogleCalendarEntityType.TODO, job.getAppEntityId()).orElse(null);
        String token = connectionService.accessToken(c);
        if (link != null && link.getGoogleIcalUid() != null && link.getGoogleEventId() != null && !link.getGoogleEventId().isBlank()) {
            apiClient.deleteEvent(token, link.getCalendarId(), link.getGoogleEventId());
            link.setCalendarId(null);
            link.setGoogleIcalUid(null);
            link.setGoogleEventId(null);
            link.setDeletedAt(null);
        }
        String taskListId = link != null && link.getCalendarId() != null && !link.getCalendarId().isBlank()
                ? link.getCalendarId()
                : apiClient.defaultTaskListId(token);
        JsonNode googleTask;
        if (link == null || link.getDeletedAt() != null || link.getGoogleEventId() == null || link.getGoogleEventId().isBlank()) {
            googleTask = apiClient.insertTask(token, taskListId, task);
            if (link == null) {
                link = new GoogleCalendarEventLink();
                link.setCompany(job.getCompany());
                link.setConnection(c);
                link.setAppEntityType(GoogleCalendarEntityType.TODO);
                link.setAppEntityId(job.getAppEntityId());
                link.setOrigin(GoogleCalendarEventOrigin.CALENDRA);
            }
        } else {
            try {
                googleTask = apiClient.updateTask(token, taskListId, link.getGoogleEventId(), task);
            } catch (HttpClientErrorException.NotFound notFound) {
                googleTask = apiClient.insertTask(token, taskListId, task);
            }
        }
        applyGoogleTaskFields(link, googleTask, taskListId, taskHash);
        links.save(link);
    }

    @Transactional
    public void deleteFromGoogle(GoogleCalendarSyncJob job) throws Exception {
        GoogleCalendarConnection c = requireConnection(job);
        String token = connectionService.accessToken(c);
        var entityLinks = links.findAllByCompany_IdAndAppEntityTypeAndAppEntityId(job.getCompany().getId(), job.getAppEntityType(), job.getAppEntityId());
        for (GoogleCalendarEventLink link : entityLinks) {
            if (!link.getConnection().getId().equals(c.getId())) continue;
            if (link.getGoogleEventId() != null && !link.getGoogleEventId().isBlank()) {
                if (job.getAppEntityType() == GoogleCalendarEntityType.TODO) {
                    try {
                        apiClient.deleteTask(token, link.getCalendarId(), link.getGoogleEventId());
                    } catch (HttpClientErrorException taskDeleteError) {
                        if (!HttpStatus.FORBIDDEN.equals(taskDeleteError.getStatusCode()) && !HttpStatus.BAD_REQUEST.equals(taskDeleteError.getStatusCode())) throw taskDeleteError;
                    }
                    apiClient.deleteEvent(token, link.getCalendarId(), link.getGoogleEventId());
                } else {
                    apiClient.deleteEvent(token, link.getCalendarId(), link.getGoogleEventId());
                }
            }
            link.setDeletedAt(Instant.now());
            link.setSyncStatus("DELETED");
            link.setLastError(null);
            links.save(link);
        }
    }

    @Transactional
    public void pullFromGoogle(GoogleCalendarSyncJob job, boolean forceFullSync) throws Exception {
        GoogleCalendarConnection c = requireConnection(job);
        if (c.getStatus() != GoogleCalendarConnectionStatus.ACTIVE || c.getSyncDirection() == GoogleCalendarSyncDirection.CALENDRA_TO_GOOGLE) return;
        String token = connectionService.accessToken(c);
        GoogleTaskPullResult taskPull = pullGoogleTasksFromGoogle(c, token);
        GoogleTaskMirrorIndex taskMirrorIndex = taskPull.taskMirrorIndex();
        String syncToken = forceFullSync ? null : c.getSyncToken();
        String pageToken = null;
        String nextSyncToken = null;
        try {
            do {
                var page = apiClient.listEvents(token, c.getCalendarId(), syncToken, pageToken);
                for (JsonNode event : page.events()) consumeGoogleEvent(c, event, taskMirrorIndex);
                pageToken = page.nextPageToken();
                if (page.nextSyncToken() != null && !page.nextSyncToken().isBlank()) nextSyncToken = page.nextSyncToken();
            } while (pageToken != null && !pageToken.isBlank());
        } catch (GoogleCalendarSyncTokenExpiredException expired) {
            if (!forceFullSync) {
                c.setSyncToken(null);
                connections.saveAndFlush(c);
                pullFromGoogle(job, true);
                return;
            }
            throw expired;
        }
        String tasksWarning = taskPull.warning();
        if (nextSyncToken != null && !nextSyncToken.isBlank()) c.setSyncToken(nextSyncToken);
        if (forceFullSync) c.setLastFullSyncAt(Instant.now()); else c.setLastIncrementalSyncAt(Instant.now());
        c.setLastError(tasksWarning);
        connections.save(c);
    }

    @Transactional
    public void fullSync(GoogleCalendarSyncJob job) throws Exception {
        GoogleCalendarConnection c = requireConnection(job);
        pullFromGoogle(job, true);
        pushExistingFutureCalendraItems(c);
    }

    private void pushExistingFutureCalendraItems(GoogleCalendarConnection c) throws Exception {
        if (c.getStatus() != GoogleCalendarConnectionStatus.ACTIVE || c.getSyncDirection() == GoogleCalendarSyncDirection.GOOGLE_TO_CALENDRA) return;
        LocalDateTime from = LocalDateTime.now().minusDays(Math.max(1, config.getFullSyncLookbackDays()));
        LocalDateTime to = LocalDateTime.now().plusDays(Math.max(1, config.getFullSyncLookaheadDays()));
        Long companyId = c.getCompany().getId();
        Long ownerId = c.getUser() == null ? null : c.getUser().getId();
        List<CalendarPushRef> refs = new ArrayList<>();
        List<SessionBooking> bookingRows = ownerId == null
                ? bookings.findByCompanyIdAndStartTimeGreaterThanEqualAndStartTimeLessThan(companyId, from, to)
                : bookings.findByConsultantIdAndCompanyIdAndStartTimeGreaterThanEqualAndStartTimeLessThan(ownerId, companyId, from, to);
        for (SessionBooking b : bookingRows) {
            if (b.getId() != null
                    && !isCancelledBooking(b)
                    && !hasGoogleOriginLink(c, GoogleCalendarEntityType.SESSION_BOOKING, b.getId())) {
                refs.add(new CalendarPushRef(GoogleCalendarEntityType.SESSION_BOOKING, b.getId()));
            }
        }
        List<PersonalCalendarBlock> blockRows = ownerId == null
                ? personalBlocks.findByCompanyAndDateRange(companyId, from, to)
                : personalBlocks.findByOwnerAndDateRange(ownerId, companyId, from, to);
        for (PersonalCalendarBlock b : blockRows) {
            if (b.getId() != null && !isAvailabilityMarker(b.getTask()) && !isImportedGoogleBlock(b.getTask())) refs.add(new CalendarPushRef(GoogleCalendarEntityType.PERSONAL_SESSION, b.getId()));
        }
        List<CalendarTodo> todoRows = ownerId == null
                ? todos.findByCompanyAndDateRange(companyId, from, to)
                : todos.findByOwnerAndDateRange(ownerId, companyId, from, to);
        for (CalendarTodo t : todoRows) {
            if (t.getId() != null && !hasGoogleOriginLink(c, GoogleCalendarEntityType.TODO, t.getId())) refs.add(new CalendarPushRef(GoogleCalendarEntityType.TODO, t.getId()));
        }
        for (CalendarPushRef ref : refs) {
            GoogleCalendarSyncJob pushJob = new GoogleCalendarSyncJob();
            pushJob.setCompany(c.getCompany());
            pushJob.setConnection(c);
            pushJob.setAppEntityType(ref.type());
            pushJob.setAppEntityId(ref.id());
            pushJob.setAction(GoogleCalendarSyncAction.UPSERT_TO_GOOGLE);
            upsertToGoogle(pushJob);
        }
    }

    private void consumeGoogleEvent(GoogleCalendarConnection c, JsonNode event, GoogleTaskMirrorIndex taskMirrorIndex) {
        String eventId = event.path("id").asText(null);
        if (eventId == null || eventId.isBlank()) return;
        GoogleCalendarEventLink link = links.findByConnection_IdAndCalendarIdAndGoogleEventId(c.getId(), c.getCalendarId(), eventId).orElse(null);
        if (isGoogleCalendarTaskEvent(event) || matchesGoogleTaskMirror(event, taskMirrorIndex)) {
            removePreviouslyImportedTaskMirror(link);
            return;
        }
        if ("cancelled".equalsIgnoreCase(event.path("status").asText(null))) {
            if (link != null) handleGoogleCancelledEvent(link);
            return;
        }
        if (link != null) {
            updateMappedEntityFromGoogle(link, event);
            applyGoogleFields(link, event, link.getLastSyncedHash());
            links.save(link);
            return;
        }
        var ref = mapper.entityRefFromExtendedProperties(event);
        if (ref != null && ref.companyId().equals(c.getCompany().getId())) {
            GoogleCalendarEventLink recreated = new GoogleCalendarEventLink();
            recreated.setCompany(c.getCompany());
            recreated.setConnection(c);
            recreated.setCalendarId(c.getCalendarId());
            recreated.setGoogleEventId(eventId);
            recreated.setAppEntityType(ref.type());
            recreated.setAppEntityId(ref.id());
            recreated.setOrigin(GoogleCalendarEventOrigin.CALENDRA);
            applyGoogleFields(recreated, event, null);
            links.save(recreated);
            updateMappedEntityFromGoogle(recreated, event);
            return;
        }
        importExternalGoogleEvent(c, event);
    }

    private GoogleTaskPullResult pullGoogleTasksFromGoogle(GoogleCalendarConnection c, String token) throws Exception {
        GoogleTaskMirrorIndex taskMirrorIndex = new GoogleTaskMirrorIndex();
        if (c.getSyncDirection() == GoogleCalendarSyncDirection.CALENDRA_TO_GOOGLE) return new GoogleTaskPullResult(null, taskMirrorIndex);
        if (c.getScopes() != null && !c.getScopes().contains("https://www.googleapis.com/auth/tasks")) {
            return new GoogleTaskPullResult("Reconnect Google Calendar to add Google Tasks permission so Google Tasks can sync with Calendra ToDos.", taskMirrorIndex);
        }
        for (GoogleCalendarApiClient.TaskListSummary taskList : apiClient.listTaskLists(token)) {
            String pageToken = null;
            do {
                GoogleCalendarApiClient.TasksPage page = apiClient.listTasks(token, taskList.id(), pageToken);
                for (JsonNode task : page.tasks()) {
                    taskMirrorIndex.add(task);
                    consumeGoogleTask(c, page.taskListId(), task);
                }
                pageToken = page.nextPageToken();
            } while (pageToken != null && !pageToken.isBlank());
        }
        return new GoogleTaskPullResult(null, taskMirrorIndex);
    }

    private void consumeGoogleTask(GoogleCalendarConnection c, String taskListId, JsonNode task) {
        String taskId = task.path("id").asText(null);
        if (taskId == null || taskId.isBlank() || taskListId == null || taskListId.isBlank()) return;
        GoogleCalendarEventLink link = links.findByConnection_IdAndCalendarIdAndGoogleEventId(c.getId(), taskListId, taskId).orElse(null);
        if (isGoogleTaskDeletedOrCompleted(task)) {
            if (link != null) handleGoogleDeletedTask(link);
            return;
        }
        if (link != null) {
            updateMappedEntityFromGoogleTask(link, task);
            applyGoogleTaskFields(link, task, taskListId, link.getLastSyncedHash());
            links.save(link);
            return;
        }
        if (c.getUser() == null) return;
        LocalDateTime due = startFromGoogleTask(task);
        if (due == null) return;
        CalendarTodo todo = new CalendarTodo();
        todo.setCompany(c.getCompany());
        todo.setOwner(c.getUser());
        todo.setStartTime(due);
        todo.setTask(limit(task.path("title").asText("Google Task"), 200));
        todo.setNotes(limit(task.path("notes").asText(null), 1000));
        todo = todos.save(todo);

        GoogleCalendarEventLink imported = new GoogleCalendarEventLink();
        imported.setCompany(c.getCompany());
        imported.setConnection(c);
        imported.setCalendarId(taskListId);
        imported.setGoogleEventId(taskId);
        imported.setAppEntityType(GoogleCalendarEntityType.TODO);
        imported.setAppEntityId(todo.getId());
        imported.setOrigin(GoogleCalendarEventOrigin.GOOGLE);
        applyGoogleTaskFields(imported, task, taskListId, null);
        links.save(imported);
    }

    private void updateMappedEntityFromGoogleTask(GoogleCalendarEventLink link, JsonNode task) {
        if (link.getAppEntityType() != GoogleCalendarEntityType.TODO) return;
        todos.findById(link.getAppEntityId()).ifPresentOrElse(todo -> {
            LocalDateTime due = startFromGoogleTask(task, todo);
            if (due != null) todo.setStartTime(due);
            String title = task.path("title").asText(null);
            if (title != null && !title.isBlank()) todo.setTask(limit(title, 200));
            todo.setNotes(limit(task.path("notes").asText(null), 1000));
            todos.save(todo);
            clearConflict(link);
        }, () -> markConflict(link, "CONFLICT_ENTITY_MISSING", "Mapped ToDo no longer exists."));
    }

    private void handleGoogleDeletedTask(GoogleCalendarEventLink link) {
        if (link.getAppEntityType() == GoogleCalendarEntityType.TODO) {
            todos.findById(link.getAppEntityId()).ifPresent(todos::delete);
            markDeleted(link, "DELETED_IN_GOOGLE", null);
            links.save(link);
        }
    }

    private void updateMappedEntityFromGoogle(GoogleCalendarEventLink link, JsonNode event) {
        LocalDateTime start = mapper.startFromGoogleEvent(event);
        LocalDateTime end = mapper.endFromGoogleEvent(event);
        if (link.getOrigin() == GoogleCalendarEventOrigin.CALENDRA && link.getAppEntityType() == GoogleCalendarEntityType.SESSION_BOOKING && !link.getConnection().isAllowGoogleToModifyBookings()) {
            bookings.findById(link.getAppEntityId()).ifPresent(b -> {
                if (start != null && end != null && (!start.equals(b.getStartTime()) || !end.equals(b.getEndTime()))) {
                    markConflict(link, "CONFLICT_GOOGLE_CHANGE_BLOCKED", "Google changed a Calendra booking, but this connection is configured not to modify bookings from Google.");
                }
            });
            return;
        }
        String summary = event.path("summary").asText(null);
        String description = event.path("description").asText(null);
        switch (link.getAppEntityType()) {
            case SESSION_BOOKING -> bookings.findById(link.getAppEntityId()).ifPresentOrElse(
                    b -> {
                        if (link.getOrigin() == GoogleCalendarEventOrigin.GOOGLE) {
                            updateImportedBookingFromGoogle(link, b, event, start, end, description);
                        } else {
                            updateBookingTimeIfValid(link, b, start, end, description);
                        }
                    },
                    () -> markConflict(link, "CONFLICT_ENTITY_MISSING", "Mapped Calendra booking no longer exists."));
            case PERSONAL_SESSION -> personalBlocks.findById(link.getAppEntityId()).ifPresentOrElse(b -> {
                if (!validWindow(link, start, end)) return;
                b.setStartTime(start);
                b.setEndTime(end);
                if (summary != null && !summary.isBlank()) b.setTask(limit(stripPrefix(summary, "Personal:"), 200));
                b.setNotes(limit(description, 1000));
                personalBlocks.save(b);
            }, () -> markConflict(link, "CONFLICT_ENTITY_MISSING", "Mapped personal calendar block no longer exists."));
            case TODO -> todos.findById(link.getAppEntityId()).ifPresentOrElse(t -> {
                if (start == null) { markConflict(link, "CONFLICT_TIME_INVALID", "Google ToDo event has no usable start time."); return; }
                t.setStartTime(start);
                if (summary != null && !summary.isBlank()) t.setTask(limit(stripPrefix(summary, "ToDo:"), 200));
                t.setNotes(limit(description, 1000));
                todos.save(t);
            }, () -> markConflict(link, "CONFLICT_ENTITY_MISSING", "Mapped ToDo no longer exists."));
            case GOOGLE_BUSY_BLOCK -> personalBlocks.findById(link.getAppEntityId()).ifPresentOrElse(b -> {
                if (!validWindow(link, start, end)) return;
                b.setStartTime(start);
                b.setEndTime(end);
                if (summary != null && !summary.isBlank()) b.setTask(limit("Google: " + stripPrefix(summary, "Google:"), 200));
                b.setNotes(limit(description, 1000));
                personalBlocks.save(b);
            }, () -> markConflict(link, "CONFLICT_ENTITY_MISSING", "Imported Google busy block no longer exists."));
        }
    }

    private void updateBookingTimeIfValid(GoogleCalendarEventLink link, SessionBooking b, LocalDateTime start, LocalDateTime end, String description) {
        Long companyId = b.getCompany().getId();
        if (!companyId.equals(link.getCompany().getId())) {
            markConflict(link, "CONFLICT_TENANT_MISMATCH", "Mapped booking belongs to a different tenant.");
            return;
        }
        if (!validWindow(link, start, end)) return;
        if (b.getConsultant() != null && bookings.existsOverlappingForConsultantExceptBooking(companyId, b.getConsultant().getId(), start, end, b.getId())) {
            markConflict(link, "CONFLICT_CONSULTANT", "Google moved this booking to a time where the consultant already has another session.");
            return;
        }
        if (b.getSpace() != null && bookings.existsOverlappingForSpaceExceptBooking(companyId, b.getSpace().getId(), start, end, b.getId())) {
            markConflict(link, "CONFLICT_SPACE", "Google moved this booking to a time where the space is already occupied.");
            return;
        }
        b.setStartTime(start);
        b.setEndTime(end);
        if (description != null && !description.isBlank()) b.setNotes(limit(description, 1000));
        bookings.save(b);
        clearConflict(link);
    }

    private void importExternalGoogleEvent(GoogleCalendarConnection c, JsonNode event) {
        String importMode = c.getImportGoogleEventsAs() == null || c.getImportGoogleEventsAs().isBlank()
                ? "BOOKED_SESSION"
                : c.getImportGoogleEventsAs().trim();
        if ("IGNORE".equalsIgnoreCase(importMode)) return;
        if ("BOOKED_SESSION".equalsIgnoreCase(importMode)) {
            importExternalGoogleEventAsBooking(c, event);
            return;
        }
        if (!"PERSONAL_BLOCK".equalsIgnoreCase(importMode)) return;
        if (c.getUser() == null) return;
        String eventId = event.path("id").asText(null);
        if (eventId == null || eventId.isBlank()) return;
        GoogleCalendarEventLink existingByIcal = findExistingExternalEventByIcalUid(c, event);
        if (existingByIcal != null) {
            updateMappedEntityFromGoogle(existingByIcal, event);
            applyGoogleFields(existingByIcal, event, existingByIcal.getLastSyncedHash());
            links.save(existingByIcal);
            return;
        }
        LocalDateTime start = mapper.startFromGoogleEvent(event);
        LocalDateTime end = mapper.endFromGoogleEvent(event);
        if (start == null) return;
        if (end == null || !end.isAfter(start)) end = start.plusMinutes(30);
        PersonalCalendarBlock block = new PersonalCalendarBlock();
        block.setCompany(c.getCompany());
        block.setOwner(c.getUser());
        block.setStartTime(start);
        block.setEndTime(end);
        block.setTask(limit("Google: " + event.path("summary").asText("Google event"), 200));
        block.setNotes(limit(event.path("description").asText(null), 1000));
        block = personalBlocks.save(block);
        GoogleCalendarEventLink link = new GoogleCalendarEventLink();
        link.setCompany(c.getCompany());
        link.setConnection(c);
        link.setCalendarId(c.getCalendarId());
        link.setGoogleEventId(eventId);
        link.setAppEntityType(GoogleCalendarEntityType.GOOGLE_BUSY_BLOCK);
        link.setAppEntityId(block.getId());
        link.setOrigin(GoogleCalendarEventOrigin.GOOGLE);
        applyGoogleFields(link, event, null);
        links.save(link);
    }

    private void importExternalGoogleEventAsBooking(GoogleCalendarConnection c, JsonNode event) {
        String eventId = event.path("id").asText(null);
        if (eventId == null || eventId.isBlank()) return;
        GoogleCalendarEventLink existingByIcal = findExistingExternalEventByIcalUid(c, event);
        if (existingByIcal != null) {
            updateMappedEntityFromGoogle(existingByIcal, event);
            applyGoogleFields(existingByIcal, event, existingByIcal.getLastSyncedHash());
            links.save(existingByIcal);
            return;
        }
        LocalDateTime start = mapper.startFromGoogleEvent(event);
        LocalDateTime end = mapper.endFromGoogleEvent(event);
        if (start == null) return;
        if (end == null || !end.isAfter(start)) end = start.plusMinutes(30);

        ImportedGoogleGuest guest = guestFromGoogleEvent(c, event);
        Client client = resolveClientForGoogleGuest(c, null, guest);

        SessionBooking booking = new SessionBooking();
        booking.setCompany(c.getCompany());
        booking.setClient(client);
        booking.setConsultant(c.getUser());
        booking.setBookingGroupKey(UUID.randomUUID().toString());
        booking.setStartTime(start);
        booking.setEndTime(end);
        booking.setBookingStatus(SessionBookingStatus.RESERVED);
        booking.setSourceChannel("GOOGLE_CALENDAR");
        booking.setSourceOrderId(limit("google:" + eventId, 64));
        booking.setNotes(limit(event.path("description").asText(null), 1000));
        applyGoogleMeetingFields(booking, event);
        booking = bookings.save(booking);

        GoogleCalendarEventLink link = new GoogleCalendarEventLink();
        link.setCompany(c.getCompany());
        link.setConnection(c);
        link.setCalendarId(c.getCalendarId());
        link.setGoogleEventId(eventId);
        link.setAppEntityType(GoogleCalendarEntityType.SESSION_BOOKING);
        link.setAppEntityId(booking.getId());
        link.setOrigin(GoogleCalendarEventOrigin.GOOGLE);
        applyGoogleFields(link, event, null);
        links.save(link);
    }

    private GoogleCalendarEventLink findExistingExternalEventByIcalUid(GoogleCalendarConnection c, JsonNode event) {
        String iCalUid = event.path("iCalUID").asText(null);
        boolean recurringInstance = event.hasNonNull("recurringEventId");
        if (recurringInstance || iCalUid == null || iCalUid.isBlank()) return null;
        return links.findFirstByConnection_IdAndGoogleIcalUidAndDeletedAtIsNull(c.getId(), iCalUid).orElse(null);
    }

    private void updateImportedBookingFromGoogle(GoogleCalendarEventLink link, SessionBooking booking, JsonNode event, LocalDateTime start, LocalDateTime end, String description) {
        if (!validWindow(link, start, end)) return;
        Long companyId = booking.getCompany().getId();
        if (!companyId.equals(link.getCompany().getId())) {
            markConflict(link, "CONFLICT_TENANT_MISMATCH", "Mapped booking belongs to a different tenant.");
            return;
        }
        if (booking.getConsultant() != null && bookings.existsOverlappingForConsultantExceptBooking(companyId, booking.getConsultant().getId(), start, end, booking.getId())) {
            markConflict(link, "CONFLICT_CONSULTANT", "Google moved this booking to a time where the consultant already has another session.");
            return;
        }
        if (booking.getSpace() != null && bookings.existsOverlappingForSpaceExceptBooking(companyId, booking.getSpace().getId(), start, end, booking.getId())) {
            markConflict(link, "CONFLICT_SPACE", "Google moved this booking to a time where the space is already occupied.");
            return;
        }
        booking.setStartTime(start);
        booking.setEndTime(end);
        booking.setNotes(limit(description, 1000));
        booking.setClient(resolveClientForGoogleGuest(link.getConnection(), booking.getClient(), guestFromGoogleEvent(link.getConnection(), event)));
        applyGoogleMeetingFields(booking, event);
        bookings.save(booking);
        clearConflict(link);
    }

    private Client resolveClientForGoogleGuest(GoogleCalendarConnection c, Client currentClient, ImportedGoogleGuest guest) {
        String normalizedEmail = Client.normalizeEmailStorage(guest.email());
        if (normalizedEmail != null) {
            Client existing = clients.findAllByCompanyIdAndNormalizedEmail(c.getCompany().getId(), normalizedEmail).stream().findFirst().orElse(null);
            if (existing != null) return existing;
            if (isClientFromSameCompany(c, currentClient) && Client.normalizeEmailStorage(currentClient.getEmail()) == null) {
                applyGoogleGuestToClient(currentClient, guest, normalizedEmail);
                return clients.save(currentClient);
            }
        } else if (isClientFromSameCompany(c, currentClient)) {
            applyGoogleGuestToClient(currentClient, guest, null);
            return clients.save(currentClient);
        }
        Client client = new Client();
        client.setCompany(c.getCompany());
        client.setAssignedTo(c.getUser());
        applyGoogleGuestToClient(client, guest, normalizedEmail);
        return clients.save(client);
    }

    private boolean isClientFromSameCompany(GoogleCalendarConnection c, Client client) {
        return client != null
                && client.getCompany() != null
                && client.getCompany().getId() != null
                && client.getCompany().getId().equals(c.getCompany().getId());
    }

    private void applyGoogleGuestToClient(Client client, ImportedGoogleGuest guest, String normalizedEmail) {
        client.setFirstName(guest.firstName());
        client.setLastName(guest.lastName());
        if (normalizedEmail != null || client.getEmail() == null) {
            client.setEmail(normalizedEmail);
        }
    }

    private ImportedGoogleGuest guestFromGoogleEvent(GoogleCalendarConnection c, JsonNode event) {
        String summary = event.path("summary").asText(null);
        String[] nameParts = splitGoogleSummaryName(summary);
        return new ImportedGoogleGuest(nameParts[0], nameParts[1], firstGuestEmail(c, event));
    }

    private String[] splitGoogleSummaryName(String summary) {
        String title = summary == null ? "" : summary.trim();
        if (title.isBlank()) return new String[]{"Google", "Event"};
        String[] words = title.split("\\s+");
        String firstName = words.length > 0 && !words[0].isBlank() ? words[0] : "Google";
        String lastName = words.length > 1 ? words[1] : "";
        return new String[]{limit(firstName, 255), limit(lastName, 255)};
    }

    private String firstGuestEmail(GoogleCalendarConnection c, JsonNode event) {
        String connectedAccount = Client.normalizeEmailStorage(c.getGoogleAccountEmail());
        for (JsonNode attendee : event.path("attendees")) {
            String email = Client.normalizeEmailStorage(attendee.path("email").asText(null));
            if (email == null) continue;
            if (attendee.path("self").asBoolean(false)) continue;
            if (attendee.path("resource").asBoolean(false)) continue;
            if (connectedAccount != null && connectedAccount.equals(email)) continue;
            return email;
        }
        return null;
    }

    private void applyGoogleMeetingFields(SessionBooking booking, JsonNode event) {
        String meetingLink = event.path("hangoutLink").asText(null);
        if (meetingLink == null || meetingLink.isBlank()) {
            for (JsonNode entryPoint : event.path("conferenceData").path("entryPoints")) {
                if ("video".equalsIgnoreCase(entryPoint.path("entryPointType").asText(null))) {
                    String uri = entryPoint.path("uri").asText(null);
                    if (uri != null && !uri.isBlank()) {
                        meetingLink = uri;
                        break;
                    }
                }
            }
        }
        if (meetingLink != null && !meetingLink.isBlank()) {
            booking.setMeetingLink(limit(meetingLink, 500));
            booking.setMeetingProvider("google");
        } else {
            booking.setMeetingLink(null);
            booking.setMeetingProvider(null);
        }
    }

    private record ImportedGoogleGuest(String firstName, String lastName, String email) {}

    private void handleGoogleCancelledEvent(GoogleCalendarEventLink link) {
        switch (link.getAppEntityType()) {
            case GOOGLE_BUSY_BLOCK, PERSONAL_SESSION -> {
                personalBlocks.findById(link.getAppEntityId()).ifPresent(personalBlocks::delete);
                markDeleted(link, "DELETED_IN_GOOGLE", null);
            }
            case TODO -> {
                todos.findById(link.getAppEntityId()).ifPresent(todos::delete);
                markDeleted(link, "DELETED_IN_GOOGLE", null);
            }
            case SESSION_BOOKING -> handleGoogleDeletedBooking(link);
        }
        links.save(link);
    }

    private void handleGoogleDeletedBooking(GoogleCalendarEventLink link) {
        GoogleCalendarBookingDeletePolicy policy = link.getConnection().getBookingDeletePolicy() == null ? GoogleCalendarBookingDeletePolicy.MARK_CONFLICT : link.getConnection().getBookingDeletePolicy();
        if (policy == GoogleCalendarBookingDeletePolicy.CANCEL_BOOKING) {
            bookings.findById(link.getAppEntityId()).ifPresent(b -> {
                b.setBookingStatus(SessionBookingStatus.CANCELLED);
                bookings.save(b);
            });
            markDeleted(link, "DELETED_IN_GOOGLE", "Google event was deleted, so the Calendra booking was cancelled according to this connection's delete policy.");
            return;
        }
        if (policy == GoogleCalendarBookingDeletePolicy.RECREATE_GOOGLE_EVENT) {
            markDeleted(link, "DELETED_RECREATING", "Google event was deleted. Calendra kept the booking and will recreate the Google event.");
            GoogleCalendarSyncJob recreate = new GoogleCalendarSyncJob();
            recreate.setCompany(link.getCompany());
            recreate.setConnection(link.getConnection());
            recreate.setAppEntityType(link.getAppEntityType());
            recreate.setAppEntityId(link.getAppEntityId());
            recreate.setAction(GoogleCalendarSyncAction.UPSERT_TO_GOOGLE);
            try {
                upsertToGoogle(recreate);
            } catch (Exception e) {
                markConflict(link, "CONFLICT_GOOGLE_DELETED", "Google event was deleted and Calendra could not recreate it: " + clean(e.getMessage()));
            }
            return;
        }
        markConflict(link, "CONFLICT_GOOGLE_DELETED", "Google event was deleted, but Calendra kept the booking. Review before cancelling or recreating.");
        link.setDeletedAt(Instant.now());
    }

    private boolean validWindow(GoogleCalendarEventLink link, LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null || !end.isAfter(start)) {
            markConflict(link, "CONFLICT_TIME_INVALID", "Google event has an invalid start/end time.");
            return false;
        }
        return true;
    }

    private void markConflict(GoogleCalendarEventLink link, String status, String message) {
        link.setSyncStatus(status);
        link.setLastError(limit(message, 2000));
    }

    private void clearConflict(GoogleCalendarEventLink link) {
        link.setSyncStatus("SYNCED");
        link.setLastError(null);
        link.setDeletedAt(null);
    }

    private void markDeleted(GoogleCalendarEventLink link, String status, String message) {
        link.setDeletedAt(Instant.now());
        link.setSyncStatus(status);
        link.setLastError(limit(message, 2000));
    }

    private boolean isGoogleCalendarTaskEvent(JsonNode event) {
        String eventType = event.path("eventType").asText(null);
        if ("task".equalsIgnoreCase(eventType) || "todo".equalsIgnoreCase(eventType)) return true;
        if (event.has("taskProperties") || event.has("todoProperties")) return true;
        String sourceTitle = event.path("source").path("title").asText(null);
        String sourceUrl = event.path("source").path("url").asText(null);
        return containsIgnoreCase(sourceTitle, "task") || containsIgnoreCase(sourceUrl, "tasks.google");
    }

    private boolean matchesGoogleTaskMirror(JsonNode event, GoogleTaskMirrorIndex taskMirrorIndex) {
        if (taskMirrorIndex == null || taskMirrorIndex.isEmpty()) return false;
        String eventId = event.path("id").asText(null);
        if (eventId != null && taskMirrorIndex.taskIds().contains(eventId)) return true;
        String title = event.path("summary").asText(null);
        LocalDateTime start = mapper.startFromGoogleEvent(event);
        if (start == null || title == null || title.isBlank()) return false;
        return looksLikeGoogleTaskMirrorEvent(event) && taskMirrorIndex.titleDateKeys().contains(taskTitleDateKey(title, start.toLocalDate()));
    }

    private boolean looksLikeGoogleTaskMirrorEvent(JsonNode event) {
        if (event.path("attendees").isArray() && event.path("attendees").size() > 0) return false;
        if (hasText(event.path("hangoutLink").asText(null))) return false;
        if (hasText(event.path("location").asText(null))) return false;
        JsonNode conferenceEntryPoints = event.path("conferenceData").path("entryPoints");
        if (conferenceEntryPoints.isArray() && conferenceEntryPoints.size() > 0) return false;
        String visibility = event.path("visibility").asText(null);
        String transparency = event.path("transparency").asText(null);
        return visibility == null || visibility.isBlank() || "private".equalsIgnoreCase(visibility) || "transparent".equalsIgnoreCase(transparency);
    }

    private void removePreviouslyImportedTaskMirror(GoogleCalendarEventLink link) {
        if (link == null || link.getOrigin() != GoogleCalendarEventOrigin.GOOGLE) return;
        switch (link.getAppEntityType()) {
            case SESSION_BOOKING -> bookings.findById(link.getAppEntityId()).ifPresent(bookings::delete);
            case GOOGLE_BUSY_BLOCK, PERSONAL_SESSION -> personalBlocks.findById(link.getAppEntityId()).ifPresent(personalBlocks::delete);
            case TODO -> { return; }
        }
        markDeleted(link, "DELETED_GOOGLE_TASK_MIRROR", "Google Task calendar mirror ignored because Google Tasks sync imports it as a Calendra ToDo.");
        links.save(link);
    }

    private boolean isGoogleTaskDeletedOrCompleted(JsonNode task) {
        return task.path("deleted").asBoolean(false) || "completed".equalsIgnoreCase(task.path("status").asText(null));
    }

    private LocalDateTime startFromGoogleTask(JsonNode task) {
        return startFromGoogleTask(task, null);
    }

    private LocalDateTime startFromGoogleTask(JsonNode task, CalendarTodo existingTodo) {
        GoogleTaskDue due = parseGoogleTaskDue(task.path("due").asText(null));
        if (due == null) return null;
        if (due.dateOnly()) {
            LocalTime displayTime = visibleTodoTime(existingTodo);
            return due.date().atTime(displayTime);
        }
        return due.dateTime();
    }

    private GoogleTaskDue parseGoogleTaskDue(String due) {
        if (due == null || due.isBlank()) return null;
        ZoneId zone = ZoneId.of(config.getTimezone());
        try {
            OffsetDateTime parsed = OffsetDateTime.parse(due);
            boolean dateOnly = parsed.toLocalTime().equals(LocalTime.MIDNIGHT);
            LocalDate date = dateOnly ? parsed.toLocalDate() : parsed.atZoneSameInstant(zone).toLocalDate();
            LocalDateTime dateTime = dateOnly ? null : parsed.atZoneSameInstant(zone).toLocalDateTime();
            return new GoogleTaskDue(date, dateTime, dateOnly);
        } catch (Exception ignored) {
            try {
                Instant parsed = Instant.parse(due);
                LocalDateTime dateTime = parsed.atZone(zone).toLocalDateTime();
                boolean dateOnly = dateTime.toLocalTime().equals(LocalTime.MIDNIGHT);
                return new GoogleTaskDue(dateTime.toLocalDate(), dateOnly ? null : dateTime, dateOnly);
            } catch (Exception ignoredAgain) {
                return null;
            }
        }
    }

    private LocalTime visibleTodoTime(CalendarTodo existingTodo) {
        if (existingTodo != null && existingTodo.getStartTime() != null) {
            LocalTime current = existingTodo.getStartTime().toLocalTime();
            if (!current.equals(LocalTime.MIDNIGHT)) return current;
        }
        return LocalTime.of(9, 0);
    }

    private void applyGoogleTaskFields(GoogleCalendarEventLink link, JsonNode googleTask, String taskListId, String hash) {
        link.setCalendarId(taskListId);
        link.setGoogleEventId(googleTask.path("id").asText(link.getGoogleEventId()));
        link.setGoogleEtag(googleTask.path("etag").asText(null));
        link.setGoogleIcalUid(null);
        String updated = googleTask.path("updated").asText(null);
        if (updated != null && !updated.isBlank()) try { link.setGoogleUpdatedAt(Instant.parse(updated)); } catch (Exception ignored) {}
        link.setLastSyncedHash(hash);
        link.setLastSyncedAt(Instant.now());
        link.setDeletedAt(null);
        if (link.getSyncStatus() == null || !link.getSyncStatus().startsWith("CONFLICT")) {
            link.setSyncStatus("SYNCED");
            link.setLastError(null);
        }
    }

    private boolean hasGoogleOriginLink(GoogleCalendarConnection c, GoogleCalendarEntityType type, Long entityId) {
        if (c == null || c.getId() == null || c.getCompany() == null || c.getCompany().getId() == null || entityId == null) return false;
        return links.findByConnection_IdAndCompany_IdAndAppEntityTypeAndAppEntityId(c.getId(), c.getCompany().getId(), type, entityId)
                .filter(link -> link.getDeletedAt() == null)
                .map(link -> link.getOrigin() == GoogleCalendarEventOrigin.GOOGLE)
                .orElse(false);
    }

    private boolean isCancelledBooking(SessionBooking booking) {
        String status = booking.getBookingStatus();
        return status != null && (SessionBookingStatus.CANCELLED.equalsIgnoreCase(status) || SessionBookingStatus.NO_SHOW.equalsIgnoreCase(status));
    }

    private boolean isAvailabilityMarker(String task) {
        return "__availability_block__".equalsIgnoreCase(task == null ? "" : task.trim());
    }

    private boolean isImportedGoogleBlock(String task) {
        return task != null && task.trim().regionMatches(true, 0, "Google:", 0, "Google:".length());
    }

    private record GoogleTaskPullResult(String warning, GoogleTaskMirrorIndex taskMirrorIndex) {}
    private record GoogleTaskDue(LocalDate date, LocalDateTime dateTime, boolean dateOnly) {}

    private static class GoogleTaskMirrorIndex {
        private final Set<String> taskIds = new HashSet<>();
        private final Set<String> titleDateKeys = new HashSet<>();

        void add(JsonNode task) {
            if (task == null || task.path("deleted").asBoolean(false)) return;
            String id = task.path("id").asText(null);
            if (id != null && !id.isBlank()) taskIds.add(id);
            String title = task.path("title").asText(null);
            LocalDate dueDate = localDateFromGoogleTaskDue(task.path("due").asText(null));
            if (title != null && !title.isBlank() && dueDate != null) titleDateKeys.add(taskTitleDateKey(title, dueDate));
        }

        boolean isEmpty() { return taskIds.isEmpty() && titleDateKeys.isEmpty(); }
        Set<String> taskIds() { return taskIds; }
        Set<String> titleDateKeys() { return titleDateKeys; }
    }

    private record CalendarPushRef(GoogleCalendarEntityType type, Long id) {}

    private SessionBooking loadBooking(GoogleCalendarSyncJob job) { return bookings.findById(job.getAppEntityId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking not found")); }
    private PersonalCalendarBlock loadPersonalBlock(GoogleCalendarSyncJob job) { return personalBlocks.findById(job.getAppEntityId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Personal calendar block not found")); }
    private CalendarTodo loadTodo(GoogleCalendarSyncJob job) { return todos.findById(job.getAppEntityId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Calendar todo not found")); }
    private GoogleCalendarConnection requireConnection(GoogleCalendarSyncJob job) { if (job.getConnection() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Google Calendar connection missing."); return job.getConnection(); }

    private void applyGoogleFields(GoogleCalendarEventLink link, JsonNode googleEvent, String hash) {
        link.setCalendarId(link.getConnection().getCalendarId());
        link.setGoogleEventId(googleEvent.path("id").asText(link.getGoogleEventId()));
        link.setGoogleEtag(googleEvent.path("etag").asText(null));
        link.setGoogleIcalUid(googleEvent.path("iCalUID").asText(null));
        String updated = googleEvent.path("updated").asText(null);
        if (updated != null && !updated.isBlank()) try { link.setGoogleUpdatedAt(Instant.parse(updated)); } catch (Exception ignored) {}
        link.setLastSyncedHash(hash);
        link.setLastSyncedAt(Instant.now());
        link.setDeletedAt(null);
        if (link.getSyncStatus() == null || !link.getSyncStatus().startsWith("CONFLICT")) {
            link.setSyncStatus("SYNCED");
            link.setLastError(null);
        }
    }

    private static LocalDate localDateFromGoogleTaskDue(String due) {
        if (due == null || due.isBlank()) return null;
        try {
            return OffsetDateTime.parse(due).toLocalDate();
        } catch (Exception ignored) {
            try {
                return Instant.parse(due).atZone(ZoneId.systemDefault()).toLocalDate();
            } catch (Exception ignoredAgain) {
                return null;
            }
        }
    }

    private static String taskTitleDateKey(String title, LocalDate date) {
        if (title == null || date == null) return null;
        return title.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT) + "|" + date;
    }

    private static boolean hasText(String value) { return value != null && !value.isBlank(); }
    private static boolean containsIgnoreCase(String value, String needle) { return value != null && needle != null && value.toLowerCase(Locale.ROOT).contains(needle.toLowerCase(Locale.ROOT)); }
    private static String stripPrefix(String value, String prefix) { if (value == null) return null; String t = value.trim(); return t.regionMatches(true, 0, prefix, 0, prefix.length()) ? t.substring(prefix.length()).trim() : t; }
    private static String clean(String value) { return value == null || value.isBlank() ? "Unknown error" : limit(value, 1900); }
    private static String limit(String value, int max) { return value == null || value.length() <= max ? value : value.substring(0, max); }
}
