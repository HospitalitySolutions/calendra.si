package com.example.app.ai;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.CalendarTodo;
import com.example.app.session.CalendarTodoRepository;
import com.example.app.session.PersonalCalendarBlock;
import com.example.app.session.PersonalCalendarBlockRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingController;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.text.Normalizer;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VoiceBookingService {
    private static final DateTimeFormatter ISO_LOCAL = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final Locale SLOVENIAN_LOCALE = Locale.forLanguageTag("sl-SI");
    private static final String AVAILABILITY_BLOCK_TASK = "__availability_block__";

    private final OpenAiConfig openAiConfig;
    private final ClientRepository clientRepository;
    private final BookableSlotRepository bookableSlotRepository;
    private final SessionBookingRepository bookingRepository;
    private final SessionBookingCreationService bookingCreationService;
    private final PersonalCalendarBlockRepository personalBlockRepository;
    private final CalendarTodoRepository todoRepository;
    private final AppSettingRepository settings;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.reminders.timezone:Europe/Ljubljana}")
    private String remindersTimezone;

    public VoiceBookingService(
            OpenAiConfig openAiConfig,
            ClientRepository clientRepository,
            BookableSlotRepository bookableSlotRepository,
            SessionBookingRepository bookingRepository,
            SessionBookingCreationService bookingCreationService,
            PersonalCalendarBlockRepository personalBlockRepository,
            CalendarTodoRepository todoRepository,
            AppSettingRepository settings) {
        this.openAiConfig = openAiConfig;
        this.clientRepository = clientRepository;
        this.bookableSlotRepository = bookableSlotRepository;
        this.bookingRepository = bookingRepository;
        this.bookingCreationService = bookingCreationService;
        this.personalBlockRepository = personalBlockRepository;
        this.todoRepository = todoRepository;
        this.settings = settings;
    }

    private enum UiLang {
        SL,
        EN
    }

    private enum VoiceActionType {
        BOOK_SESSION("book_session", false),
        CANCEL_SESSION("cancel_session", true),
        CREATE_PERSONAL("create_personal", false),
        CANCEL_PERSONAL("cancel_personal", true),
        CREATE_TODO("create_todo", false),
        CANCEL_TODO("cancel_todo", true),
        OPEN_AVAILABILITY("open_availability", false),
        BLOCK_AVAILABILITY("block_availability", false);

        private final String wireName;
        private final boolean confirmationRequired;

        VoiceActionType(String wireName, boolean confirmationRequired) {
            this.wireName = wireName;
            this.confirmationRequired = confirmationRequired;
        }

        public String wireName() {
            return wireName;
        }

        public boolean requiresConfirmation() {
            return confirmationRequired;
        }
    }

    private record TimeWindow(LocalTime start, LocalTime end) {}

    public record VoiceActionResponse(
            String action,
            String targetType,
            Long targetId,
            String message,
            SessionBookingController.BookingResponse booking,
            Long bookingId,
            Long clientId,
            String clientName,
            String title,
            LocalDateTime startTime,
            LocalDateTime endTime,
            boolean confirmationRequired
    ) {}

    @Transactional
    public VoiceActionResponse handleTranscript(String transcript, User me, boolean confirmCancellation, String localeTag) {
        if (!openAiConfig.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "OpenAI is not configured.");
        }
        if (transcript == null || transcript.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transcript is empty.");
        }

        UiLang lang = resolveUiLang(localeTag, transcript);
        ZoneId zone = ZoneId.of(remindersTimezone);
        String todayIso = LocalDate.now(zone).toString();
        Long companyId = me.getCompany().getId();
        List<Client> visibleClients = SecurityUtils.isAdmin(me)
                ? clientRepository.findAllByCompanyId(companyId)
                : clientRepository.findByAssignedToIdAndCompanyId(me.getId(), companyId);
        visibleClients = visibleClients.stream().filter(c -> !c.isAnonymized()).toList();

        String transcriptText = transcript.trim();
        JsonNode parsed = callOpenAiForJson(transcriptText, todayIso, zone.getId(), visibleClients);
        ParsedVoiceFields fields = extractVoiceFields(parsed);
        VoiceActionType action = resolveAction(fields.action(), transcriptText);
        if (!fields.completeFor(action)) {
            parsed = callOpenAiRepairJson(transcriptText, todayIso, zone.getId(), parsed, visibleClients);
            fields = extractVoiceFields(parsed);
            action = resolveAction(fields.action(), transcriptText);
        }
        if (!fields.completeFor(action)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    msg(
                            lang,
                            "Iz povedanega ni bilo mogoče razbrati dovolj podatkov. Poskusite npr.: »Dodaj osebno Kosilo za 27. april od 12:00 do 13:00«, »Dodaj opravek Pokliči Marka za 27. april ob 12:00«, »Odpri za 27. april od 12:00 do 15:00« ali »Rezerviraj Tino Jekler 28. marca ob 14:00«.",
                            "I could not extract enough details. Try for example: “Add personal Lunch for April 27 from 12 to 15”, “Add todo Call Marko for April 27 at 12”, “Open availability for April 27 from 12 to 15”, or “Book Tina Jekler on March 28 at 14:00”."));
        }

        LocalDate sessionDate = parseDate(fields.dateIso(), lang);
        LocalTime sessionTime = parseTime(fields.timeStr(), false, lang);
        LocalTime sessionEndTime = parseTime(fields.endTimeStr(), true, lang);

        return switch (action) {
            case BOOK_SESSION -> bookFromVoice(me, fields, sessionDate, sessionTime, parsed, zone, lang, confirmCancellation);
            case CANCEL_SESSION -> {
                Long cancelClientId = null;
                String fn = fields.firstName();
                String ln = fields.lastName();
                if (fn != null && !fn.isBlank() && ln != null && !ln.isBlank()) {
                    cancelClientId = resolveClientId(fn, ln, me, false, lang);
                }
                yield cancelBookingFromVoice(me, sessionDate, sessionTime, cancelClientId, confirmCancellation, lang);
            }
            case CREATE_PERSONAL -> createPersonalFromVoice(me, fields.title(), sessionDate, sessionTime, sessionEndTime, zone, lang);
            case CANCEL_PERSONAL -> cancelPersonalFromVoice(me, fields.title(), sessionDate, sessionTime, confirmCancellation, lang);
            case CREATE_TODO -> createTodoFromVoice(me, fields.title(), sessionDate, sessionTime, zone, lang);
            case CANCEL_TODO -> cancelTodoFromVoice(me, fields.title(), sessionDate, sessionTime, confirmCancellation, lang);
            case OPEN_AVAILABILITY -> openAvailabilityFromVoice(me, sessionDate, sessionTime, sessionEndTime, zone, lang);
            case BLOCK_AVAILABILITY -> blockAvailabilityFromVoice(me, sessionDate, sessionTime, sessionEndTime, zone, lang);
        };
    }

    private VoiceActionResponse bookFromVoice(
            User me,
            ParsedVoiceFields fields,
            LocalDate sessionDate,
            LocalTime sessionTime,
            JsonNode parsed,
            ZoneId zone,
            UiLang lang,
            boolean confirmBooking) {
        long clientId = resolveClientId(fields.firstName(), fields.lastName(), me, true, lang);
        enforceClientNameUppercase(clientId);
        if (sessionTime == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    msg(lang, "Za rezervacijo povejte tudi uro, npr. »ob 14:00«.", "For a booking, please also say the time, for example “at 14:00”."));
        }

        int durationMinutes = defaultSessionLengthMinutes(me.getCompany().getId());
        if (parsed.has("durationMinutes") && !parsed.get("durationMinutes").isNull()) {
            int d = parsed.get("durationMinutes").asInt(0);
            if (d > 0 && d <= 24 * 60) {
                durationMinutes = d;
            }
        }

        LocalDateTime start = LocalDateTime.of(sessionDate, sessionTime);
        ensureNotInPast(start, zone, lang);
        LocalDateTime end = start.plusMinutes(durationMinutes);
        String clientName = clientRepository.findById(clientId)
                .map(c -> displayClientName(c.getFirstName(), c.getLastName()))
                .orElse(null);

        String startTime = start.format(ISO_LOCAL);
        String endTime = end.format(ISO_LOCAL);
        if (!confirmBooking) {
            return new VoiceActionResponse(
                    "book_review",
                    "booking",
                    null,
                    msg(lang, "Potrdite rezervacijo termina.", "Please confirm booking creation."),
                    null,
                    null,
                    clientId,
                    clientName,
                    null,
                    start,
                    end,
                    true);
        }

        Long consultantId = SecurityUtils.isAdmin(me) ? me.getId() : null;
        var req = new SessionBookingController.BookingRequest(
                clientId,
                consultantId,
                startTime,
                endTime,
                null,
                null,
                "",
                null,
                false,
                null,
                null);

        long consultantForSlot = me.getId();
        if (isBookableEnabled(me.getCompany().getId()) && !coversBookableSlot(me.getCompany().getId(), consultantForSlot, start, end)) {
            throw new VoiceBookingFallbackException(
                    HttpStatus.BAD_REQUEST,
                    msg(lang, "Ta termin ni v razpoložljivem času.", "This time is outside available booking hours."),
                    startTime,
                    endTime,
                    clientId,
                    VoiceBookingFallbackException.Reason.NOT_BOOKABLE);
        }

        try {
            var created = bookingCreationService.create(req, me);
            return new VoiceActionResponse(
                    "booked",
                    "booking",
                    created.id(),
                    msg(lang, "Termin je uspešno rezerviran.", "Booking created successfully."),
                    created,
                    created.id(),
                    clientId,
                    created.client() != null ? displayClientName(created.client().firstName(), created.client().lastName()) : clientName,
                    null,
                    created.startTime(),
                    created.endTime(),
                    false);
        } catch (ResponseStatusException e) {
            if (HttpStatus.CONFLICT.equals(e.getStatusCode())) {
                throw new VoiceBookingFallbackException(
                        HttpStatus.CONFLICT,
                        msg(lang, "Ta termin je že zaseden ali se prekriva z drugim.", "That time is already occupied or overlaps another session."),
                        startTime,
                        endTime,
                        clientId,
                        VoiceBookingFallbackException.Reason.CONFLICT);
            }
            throw e;
        }
    }

    private VoiceActionResponse cancelBookingFromVoice(
            User me,
            LocalDate date,
            LocalTime time,
            Long clientId,
            boolean confirmCancellation,
            UiLang lang) {
        Long companyId = me.getCompany().getId();
        List<SessionBooking> source = SecurityUtils.isAdmin(me)
                ? bookingRepository.findAllByCompanyId(companyId)
                : bookingRepository.findByConsultantIdAndCompanyId(me.getId(), companyId);

        List<SessionBooking> sameDate = source.stream()
                .filter(b -> b.getStartTime() != null && b.getStartTime().toLocalDate().equals(date))
                .filter(b -> clientId == null || (b.getClient() != null && b.getClient().getId().equals(clientId)))
                .toList();

        if (sameDate.isEmpty()) {
            if (clientId == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                        msg(lang, "Na ta datum ni najdenega termina za preklic.", "No booking was found on that date."));
            }
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    msg(lang, "Za to stranko na ta datum ni najdenega termina za preklic.", "No booking was found for that client on that date."));
        }

        SessionBooking target = null;
        if (time != null) {
            for (SessionBooking b : sameDate) {
                if (b.getStartTime().toLocalTime().equals(time)) {
                    target = b;
                    break;
                }
            }
        }

        if (target == null && sameDate.size() == 1) {
            target = sameDate.get(0);
        }
        if (target == null) {
            if (clientId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        msg(lang, "Na ta datum je več terminov. Povejte tudi ime stranke ali točno uro.", "There are multiple bookings on that date. Please also say the client name or exact time."));
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Za ta datum je več terminov te stranke. Povejte tudi točno uro.", "There are multiple bookings for that client on that date. Please also say the exact time."));
        }

        if (!SecurityUtils.isAdmin(me)
                && (target.getConsultant() == null || !target.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    msg(lang, "Lahko prekličete le svoje termine.", "You can cancel only your own bookings."));
        }

        Long targetClientId = target.getClient() != null ? target.getClient().getId() : null;
        String targetClientName = target.getClient() != null
                ? displayClientName(target.getClient().getFirstName(), target.getClient().getLastName())
                : null;

        if (!confirmCancellation) {
            return new VoiceActionResponse(
                    "cancel_review",
                    "booking",
                    target.getId(),
                    msg(lang, "Potrdite preklic termina.", "Please confirm booking cancellation."),
                    null,
                    target.getId(),
                    targetClientId,
                    targetClientName,
                    null,
                    target.getStartTime(),
                    target.getEndTime(),
                    true);
        }

        bookingRepository.delete(target);
        return new VoiceActionResponse(
                "cancelled",
                "booking",
                target.getId(),
                msg(lang, "Termin je uspešno preklican.", "Booking cancelled successfully."),
                null,
                target.getId(),
                targetClientId,
                targetClientName,
                null,
                target.getStartTime(),
                target.getEndTime(),
                false);
    }

    private VoiceActionResponse createPersonalFromVoice(
            User me,
            String title,
            LocalDate date,
            LocalTime startTime,
            LocalTime endTime,
            ZoneId zone,
            UiLang lang) {
        String cleanedTitle = requireTitle(title, lang, true);
        TimeWindow range = requireRange(date, startTime, endTime, zone, lang, true);
        LocalDateTime start = LocalDateTime.of(date, range.start());
        LocalDateTime end = LocalDateTime.of(date, range.end());

        var block = new PersonalCalendarBlock();
        block.setCompany(me.getCompany());
        block.setOwner(me);
        block.setStartTime(start);
        block.setEndTime(end);
        block.setTask(cleanedTitle);
        block.setNotes(null);
        block = personalBlockRepository.save(block);

        return new VoiceActionResponse(
                "personal_created",
                "personal",
                block.getId(),
                msg(lang, "Osebni termin je uspešno dodan.", "Personal session created successfully."),
                null,
                null,
                null,
                null,
                block.getTask(),
                block.getStartTime(),
                block.getEndTime(),
                false);
    }

    private VoiceActionResponse cancelPersonalFromVoice(
            User me,
            String title,
            LocalDate date,
            LocalTime time,
            boolean confirmCancellation,
            UiLang lang) {
        if (time == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Za preklic osebnega termina povejte tudi uro začetka.", "For cancelling a personal session, please also say the start time."));
        }
        List<PersonalCalendarBlock> sameDate = personalBlockRepository
                .findOverlapping(me.getId(), me.getCompany().getId(), date.atStartOfDay(), date.plusDays(1).atStartOfDay())
                .stream()
                .filter(block -> !isAvailabilityBlock(block))
                .filter(block -> block.getStartTime() != null && block.getStartTime().toLocalDate().equals(date))
                .filter(block -> block.getStartTime().toLocalTime().equals(time))
                .toList();

        List<PersonalCalendarBlock> matches = filterBlocksByTitle(sameDate, title);
        if (matches.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    msg(lang, "Na ta datum in uro ni najdenega osebnega termina.", "No personal session was found at that date and time."));
        }
        if (matches.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Najdenih je več osebnih terminov. Povejte tudi natančnejši naziv.", "More than one personal session was found. Please say a more specific title."));
        }

        PersonalCalendarBlock target = matches.get(0);
        if (!confirmCancellation) {
            return new VoiceActionResponse(
                    "cancel_review",
                    "personal",
                    target.getId(),
                    msg(lang, "Potrdite preklic osebnega termina.", "Please confirm cancelling the personal session."),
                    null,
                    null,
                    null,
                    null,
                    target.getTask(),
                    target.getStartTime(),
                    target.getEndTime(),
                    true);
        }

        personalBlockRepository.delete(target);
        return new VoiceActionResponse(
                "personal_cancelled",
                "personal",
                target.getId(),
                msg(lang, "Osebni termin je uspešno preklican.", "Personal session cancelled successfully."),
                null,
                null,
                null,
                null,
                target.getTask(),
                target.getStartTime(),
                target.getEndTime(),
                false);
    }

    private VoiceActionResponse createTodoFromVoice(
            User me,
            String title,
            LocalDate date,
            LocalTime time,
            ZoneId zone,
            UiLang lang) {
        String cleanedTitle = requireTitle(title, lang, false);
        if (time == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Za opravek povejte tudi uro, npr. »ob 12:00«.", "For a todo, please also say the time, for example “at 12:00”."));
        }
        LocalDateTime start = LocalDateTime.of(date, time);
        ensureNotInPast(start, zone, lang);

        var todo = new CalendarTodo();
        todo.setCompany(me.getCompany());
        todo.setOwner(me);
        todo.setStartTime(start);
        todo.setTask(cleanedTitle);
        todo.setNotes(null);
        todo = todoRepository.save(todo);

        return new VoiceActionResponse(
                "todo_created",
                "todo",
                todo.getId(),
                msg(lang, "Opravek je uspešno dodan.", "Todo created successfully."),
                null,
                null,
                null,
                null,
                todo.getTask(),
                todo.getStartTime(),
                null,
                false);
    }

    private VoiceActionResponse cancelTodoFromVoice(
            User me,
            String title,
            LocalDate date,
            LocalTime time,
            boolean confirmCancellation,
            UiLang lang) {
        if (time == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Za preklic opravka povejte tudi uro.", "For cancelling a todo, please also say the time."));
        }
        List<CalendarTodo> matches = todoRepository
                .findByOwnerAndDateRange(me.getId(), me.getCompany().getId(), date.atStartOfDay(), date.plusDays(1).atStartOfDay())
                .stream()
                .filter(todo -> todo.getStartTime() != null && todo.getStartTime().toLocalTime().equals(time))
                .toList();
        matches = filterTodosByTitle(matches, title);

        if (matches.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    msg(lang, "Na ta datum in uro ni najdenega opravka.", "No todo was found at that date and time."));
        }
        if (matches.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Najdenih je več opravil. Povejte tudi natančnejši naziv.", "More than one todo was found. Please say a more specific title."));
        }

        CalendarTodo target = matches.get(0);
        if (!confirmCancellation) {
            return new VoiceActionResponse(
                    "cancel_review",
                    "todo",
                    target.getId(),
                    msg(lang, "Potrdite preklic opravka.", "Please confirm cancelling the todo."),
                    null,
                    null,
                    null,
                    null,
                    target.getTask(),
                    target.getStartTime(),
                    null,
                    true);
        }

        todoRepository.delete(target);
        return new VoiceActionResponse(
                "todo_cancelled",
                "todo",
                target.getId(),
                msg(lang, "Opravek je uspešno preklican.", "Todo cancelled successfully."),
                null,
                null,
                null,
                null,
                target.getTask(),
                target.getStartTime(),
                null,
                false);
    }

    private VoiceActionResponse openAvailabilityFromVoice(
            User me,
            LocalDate date,
            LocalTime startTime,
            LocalTime endTime,
            ZoneId zone,
            UiLang lang) {
        requireConsultantForAvailability(me, lang);
        TimeWindow range = requireRange(date, startTime, endTime, zone, lang, true);
        LocalDateTime start = LocalDateTime.of(date, range.start());
        LocalDateTime end = LocalDateTime.of(date, range.end());

        boolean blocksChanged = removeAvailabilityBlockCoverage(me, start, end);
        List<TimeWindow> uncovered = computeAvailabilityGaps(me, date, range.start(), range.end());
        int created = 0;
        for (TimeWindow gap : uncovered) {
            if (!gap.end().isAfter(gap.start())) {
                continue;
            }
            var slot = new BookableSlot();
            slot.setCompany(me.getCompany());
            slot.setConsultant(me);
            slot.setDayOfWeek(date.getDayOfWeek());
            slot.setStartTime(gap.start());
            slot.setEndTime(gap.end());
            slot.setIndefinite(false);
            slot.setStartDate(date);
            slot.setEndDate(date);
            bookableSlotRepository.save(slot);
            created++;
        }

        String message;
        if (created == 0 && !blocksChanged) {
            message = msg(lang, "Ta termin je že odprt.", "That time is already open.");
        } else {
            message = msg(lang, "Razpoložljivost je uspešno odprta.", "Availability opened successfully.");
        }

        return new VoiceActionResponse(
                "availability_opened",
                "availability",
                null,
                message,
                null,
                null,
                null,
                null,
                null,
                start,
                end,
                false);
    }

    private VoiceActionResponse blockAvailabilityFromVoice(
            User me,
            LocalDate date,
            LocalTime startTime,
            LocalTime endTime,
            ZoneId zone,
            UiLang lang) {
        requireConsultantForAvailability(me, lang);
        TimeWindow range = requireRange(date, startTime, endTime, zone, lang, true);
        LocalDateTime start = LocalDateTime.of(date, range.start());
        LocalDateTime end = LocalDateTime.of(date, range.end());

        boolean slotChanged = carveOutAvailabilitySlots(me, date, range.start(), range.end());
        int createdBlocks = ensureAvailabilityBlockCoverage(me, start, end);
        String message = (slotChanged || createdBlocks > 0)
                ? msg(lang, "Razpoložljivost je uspešno zaprta.", "Availability blocked successfully.")
                : msg(lang, "Ta termin je že zaprt.", "That time is already blocked.");

        return new VoiceActionResponse(
                "availability_blocked",
                "availability",
                null,
                message,
                null,
                null,
                null,
                null,
                null,
                start,
                end,
                false);
    }

    private UiLang resolveUiLang(String localeTag, String transcript) {
        if (localeTag != null && !localeTag.isBlank()) {
            String tag = localeTag.trim().toLowerCase(Locale.ROOT);
            if (tag.startsWith("sl")) return UiLang.SL;
            if (tag.startsWith("en")) return UiLang.EN;
        }
        String n = " " + normalize(transcript) + " ";
        return containsAny(n, " dodaj ", " odpovej ", " oprav", " osebno", " odpri ", " zapri ", " preklic", " rezerv")
                ? UiLang.SL
                : UiLang.EN;
    }

    private static String msg(UiLang lang, String sl, String en) {
        return lang == UiLang.SL ? sl : en;
    }

    private VoiceActionType resolveAction(String rawAction, String transcript) {
        String normalizedTranscript = " " + normalize(transcript) + " ";
        if (containsAny(normalizedTranscript, " odpovej oprav", " preklici oprav", " cancel todo", " delete todo", " remove todo")) {
            return VoiceActionType.CANCEL_TODO;
        }
        if (containsAny(normalizedTranscript, " dodaj oprav", " ustvari oprav", " create todo", " add todo", " new todo", " task for ")) {
            return VoiceActionType.CREATE_TODO;
        }
        if (containsAny(normalizedTranscript, " odpovej osebno", " preklici osebno", " cancel personal", " delete personal", " remove personal")) {
            return VoiceActionType.CANCEL_PERSONAL;
        }
        if (containsAny(normalizedTranscript, " dodaj osebno", " ustvari osebno", " create personal", " add personal", " new personal")) {
            return VoiceActionType.CREATE_PERSONAL;
        }
        if (containsAny(normalizedTranscript, " odpri ", " open availability", " make available", " open for ")) {
            return VoiceActionType.OPEN_AVAILABILITY;
        }
        if (containsAny(normalizedTranscript, " zapri ", " block availability", " close availability", " close for ", " block for ")) {
            return VoiceActionType.BLOCK_AVAILABILITY;
        }

        if (rawAction != null && !rawAction.isBlank()) {
            String v = normalize(rawAction);
            if (containsAny(" " + v + " ", " cancel personal ", " personal cancel ", " cancel_personal ")) return VoiceActionType.CANCEL_PERSONAL;
            if (containsAny(" " + v + " ", " create personal ", " add personal ", " create_personal ")) return VoiceActionType.CREATE_PERSONAL;
            if (containsAny(" " + v + " ", " cancel todo ", " cancel_todo ")) return VoiceActionType.CANCEL_TODO;
            if (containsAny(" " + v + " ", " create todo ", " add todo ", " create_todo ")) return VoiceActionType.CREATE_TODO;
            if (containsAny(" " + v + " ", " open availability ", " open_availability ")) return VoiceActionType.OPEN_AVAILABILITY;
            if (containsAny(" " + v + " ", " block availability ", " block_availability ")) return VoiceActionType.BLOCK_AVAILABILITY;
            if (containsAny(" " + v + " ", " cancel session ", " cancel booking ", " cancel_session ", " cancel ", " delete ", " preklic ")) return VoiceActionType.CANCEL_SESSION;
            if (containsAny(" " + v + " ", " book session ", " create booking ", " book_session ", " book ", " rezerviraj ")) return VoiceActionType.BOOK_SESSION;
        }

        return isCancelTranscript(normalizedTranscript) ? VoiceActionType.CANCEL_SESSION : VoiceActionType.BOOK_SESSION;
    }

    private static boolean containsAny(String source, String... terms) {
        for (String term : terms) {
            if (source.contains(term)) return true;
        }
        return false;
    }

    private static boolean isCancelTranscript(String normalizedTranscript) {
        return containsAny(normalizedTranscript,
                " prekli", " odjavi", " odpov", " izbri", " zbri", " storn", " cancel", " delete", " remove ");
    }

    private String requireTitle(String title, UiLang lang, boolean personal) {
        if (title == null || title.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    personal
                            ? msg(lang, "Povejte tudi naziv osebnega termina.", "Please also say the personal session title.")
                            : msg(lang, "Povejte tudi naziv opravka.", "Please also say the todo title."));
        }
        return title.trim();
    }

    private LocalDate parseDate(String rawDate, UiLang lang) {
        if (rawDate == null || rawDate.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Datum manjka ali ni veljaven.", "The date is missing or invalid."));
        }
        try {
            return LocalDate.parse(rawDate);
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Datum ni veljaven.", "The date is invalid."));
        }
    }

    private LocalTime parseTime(String rawTime, boolean allowNull, UiLang lang) {
        if (rawTime == null || rawTime.isBlank()) {
            if (allowNull) return null;
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Čas manjka ali ni veljaven.", "The time is missing or invalid."));
        }
        try {
            String t = rawTime.trim();
            if (t.length() == 5 && t.charAt(2) == ':') {
                t = t + ":00";
            }
            return LocalTime.parse(t);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Čas ni veljaven.", "The time is invalid."));
        }
    }

    private TimeWindow requireRange(
            LocalDate date,
            LocalTime startTime,
            LocalTime endTime,
            ZoneId zone,
            UiLang lang,
            boolean requireFuture) {
        if (startTime == null || endTime == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Povejte čas od in do.", "Please specify both from and to times."));
        }
        if (!endTime.isAfter(startTime)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Končni čas mora biti po začetnem času.", "The end time must be after the start time."));
        }
        LocalDateTime start = LocalDateTime.of(date, startTime);
        LocalDateTime end = LocalDateTime.of(date, endTime);
        if (!start.toLocalDate().equals(end.toLocalDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Ukaz mora ostati znotraj istega dneva.", "The command must stay within a single day."));
        }
        if (requireFuture) {
            ensureNotInPast(start, zone, lang);
        }
        return new TimeWindow(startTime, endTime);
    }

    private void ensureNotInPast(LocalDateTime start, ZoneId zone, UiLang lang) {
        if (start.isBefore(LocalDateTime.now(zone))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Ta datum in ura sta že v preteklosti.", "That date and time are already in the past."));
        }
    }

    private void requireConsultantForAvailability(User me, UiLang lang) {
        if (!me.isConsultant() && me.getRole() != Role.CONSULTANT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang,
                            "Razpoložljivost lahko glasovno ureja le uporabnik, ki je označen kot osebje/svetovalec.",
                            "Availability can be changed by voice only for a user marked as staff/consultant."));
        }
    }

    private List<PersonalCalendarBlock> filterBlocksByTitle(List<PersonalCalendarBlock> blocks, String title) {
        if (title == null || title.isBlank()) {
            return blocks;
        }
        String wanted = normalize(title);
        List<PersonalCalendarBlock> exact = blocks.stream()
                .filter(block -> normalize(block.getTask()).equals(wanted))
                .toList();
        if (!exact.isEmpty()) {
            return exact;
        }
        return blocks.stream()
                .filter(block -> {
                    String candidate = normalize(block.getTask());
                    return candidate.contains(wanted) || wanted.contains(candidate);
                })
                .toList();
    }

    private List<CalendarTodo> filterTodosByTitle(List<CalendarTodo> todos, String title) {
        if (title == null || title.isBlank()) {
            return todos;
        }
        String wanted = normalize(title);
        List<CalendarTodo> exact = todos.stream()
                .filter(todo -> normalize(todo.getTask()).equals(wanted))
                .toList();
        if (!exact.isEmpty()) {
            return exact;
        }
        return todos.stream()
                .filter(todo -> {
                    String candidate = normalize(todo.getTask());
                    return candidate.contains(wanted) || wanted.contains(candidate);
                })
                .toList();
    }

    private boolean isAvailabilityBlock(PersonalCalendarBlock block) {
        return block != null && normalize(block.getTask()).equals(AVAILABILITY_BLOCK_TASK);
    }

    private boolean removeAvailabilityBlockCoverage(User me, LocalDateTime start, LocalDateTime end) {
        boolean changed = false;
        List<PersonalCalendarBlock> overlapping = personalBlockRepository
                .findOverlapping(me.getId(), me.getCompany().getId(), start, end)
                .stream()
                .filter(this::isAvailabilityBlock)
                .toList();
        for (PersonalCalendarBlock block : overlapping) {
            LocalDateTime blockStart = block.getStartTime();
            LocalDateTime blockEnd = block.getEndTime();
            if (blockStart == null || blockEnd == null || !blockEnd.isAfter(blockStart)) {
                continue;
            }
            if (!blockStart.isBefore(end) || !blockEnd.isAfter(start)) {
                continue;
            }
            changed = true;
            if (!blockStart.isBefore(start) && !blockEnd.isAfter(end)) {
                personalBlockRepository.delete(block);
                continue;
            }
            if (blockStart.isBefore(start) && blockEnd.isAfter(end)) {
                block.setEndTime(start);
                personalBlockRepository.save(block);
                var right = new PersonalCalendarBlock();
                right.setCompany(block.getCompany());
                right.setOwner(block.getOwner());
                right.setTask(block.getTask());
                right.setNotes(block.getNotes());
                right.setStartTime(end);
                right.setEndTime(blockEnd);
                personalBlockRepository.save(right);
                continue;
            }
            if (blockStart.isBefore(start)) {
                block.setEndTime(start);
                personalBlockRepository.save(block);
            } else {
                block.setStartTime(end);
                personalBlockRepository.save(block);
            }
        }
        return changed;
    }

    private List<TimeWindow> computeAvailabilityGaps(User me, LocalDate date, LocalTime requestStart, LocalTime requestEnd) {
        List<TimeWindow> covered = bookableSlotRepository.findByConsultantIdAndCompanyId(me.getId(), me.getCompany().getId()).stream()
                .filter(slot -> slotAppliesToDate(slot, date))
                .map(slot -> intersection(slot.getStartTime(), slot.getEndTime(), requestStart, requestEnd))
                .filter(window -> window != null && window.end().isAfter(window.start()))
                .toList();
        return subtractCoverage(requestStart, requestEnd, covered);
    }

    private boolean carveOutAvailabilitySlots(User me, LocalDate date, LocalTime requestStart, LocalTime requestEnd) {
        boolean changed = false;
        List<BookableSlot> slots = new ArrayList<>(bookableSlotRepository.findByConsultantIdAndCompanyId(me.getId(), me.getCompany().getId()).stream()
                .filter(slot -> slotAppliesToDate(slot, date))
                .filter(slot -> slot.getStartTime().isBefore(requestEnd) && slot.getEndTime().isAfter(requestStart))
                .sorted(Comparator.comparing(BookableSlot::getStartTime))
                .toList());
        for (BookableSlot slot : slots) {
            LocalTime originalStart = slot.getStartTime();
            LocalTime originalEnd = slot.getEndTime();
            if (originalStart == null || originalEnd == null || !originalEnd.isAfter(originalStart)) {
                continue;
            }
            if (!originalStart.isBefore(requestEnd) || !originalEnd.isAfter(requestStart)) {
                continue;
            }
            changed = true;
            if (!originalStart.isBefore(requestStart) && !originalEnd.isAfter(requestEnd)) {
                bookableSlotRepository.delete(slot);
                continue;
            }
            if (originalStart.isBefore(requestStart) && originalEnd.isAfter(requestEnd)) {
                slot.setEndTime(requestStart);
                bookableSlotRepository.save(slot);
                var right = cloneSlot(slot);
                right.setStartTime(requestEnd);
                right.setEndTime(originalEnd);
                bookableSlotRepository.save(right);
                continue;
            }
            if (originalStart.isBefore(requestStart)) {
                slot.setEndTime(requestStart);
                bookableSlotRepository.save(slot);
            } else {
                slot.setStartTime(requestEnd);
                bookableSlotRepository.save(slot);
            }
        }
        return changed;
    }

    private int ensureAvailabilityBlockCoverage(User me, LocalDateTime start, LocalDateTime end) {
        List<TimeWindow> covered = personalBlockRepository
                .findOverlapping(me.getId(), me.getCompany().getId(), start, end)
                .stream()
                .filter(this::isAvailabilityBlock)
                .map(block -> intersection(
                        block.getStartTime().toLocalTime(),
                        block.getEndTime().toLocalTime(),
                        start.toLocalTime(),
                        end.toLocalTime()))
                .filter(window -> window != null && window.end().isAfter(window.start()))
                .toList();
        List<TimeWindow> gaps = subtractCoverage(start.toLocalTime(), end.toLocalTime(), covered);
        int created = 0;
        for (TimeWindow gap : gaps) {
            if (!gap.end().isAfter(gap.start())) continue;
            var block = new PersonalCalendarBlock();
            block.setCompany(me.getCompany());
            block.setOwner(me);
            block.setTask(AVAILABILITY_BLOCK_TASK);
            block.setNotes("Availability blocked");
            block.setStartTime(LocalDateTime.of(start.toLocalDate(), gap.start()));
            block.setEndTime(LocalDateTime.of(start.toLocalDate(), gap.end()));
            personalBlockRepository.save(block);
            created++;
        }
        return created;
    }

    private boolean slotAppliesToDate(BookableSlot slot, LocalDate date) {
        if (slot == null || slot.getDayOfWeek() != date.getDayOfWeek()) {
            return false;
        }
        if (slot.isIndefinite()) {
            return true;
        }
        if (slot.getStartDate() != null && date.isBefore(slot.getStartDate())) {
            return false;
        }
        return slot.getEndDate() == null || !date.isAfter(slot.getEndDate());
    }

    private BookableSlot cloneSlot(BookableSlot src) {
        var clone = new BookableSlot();
        clone.setCompany(src.getCompany());
        clone.setConsultant(src.getConsultant());
        clone.setDayOfWeek(src.getDayOfWeek());
        clone.setIndefinite(src.isIndefinite());
        clone.setStartDate(src.getStartDate());
        clone.setEndDate(src.getEndDate());
        return clone;
    }

    private TimeWindow intersection(LocalTime startA, LocalTime endA, LocalTime startB, LocalTime endB) {
        if (startA == null || endA == null || startB == null || endB == null) {
            return null;
        }
        LocalTime start = startA.isAfter(startB) ? startA : startB;
        LocalTime end = endA.isBefore(endB) ? endA : endB;
        return end.isAfter(start) ? new TimeWindow(start, end) : null;
    }

    private List<TimeWindow> subtractCoverage(LocalTime requestStart, LocalTime requestEnd, List<TimeWindow> covered) {
        List<TimeWindow> merged = mergeWindows(covered);
        List<TimeWindow> gaps = new ArrayList<>();
        LocalTime cursor = requestStart;
        for (TimeWindow window : merged) {
            if (!window.end().isAfter(requestStart) || !window.start().isBefore(requestEnd)) {
                continue;
            }
            LocalTime clampedStart = window.start().isAfter(requestStart) ? window.start() : requestStart;
            LocalTime clampedEnd = window.end().isBefore(requestEnd) ? window.end() : requestEnd;
            if (clampedStart.isAfter(cursor)) {
                gaps.add(new TimeWindow(cursor, clampedStart));
            }
            if (clampedEnd.isAfter(cursor)) {
                cursor = clampedEnd;
            }
            if (!cursor.isBefore(requestEnd)) {
                break;
            }
        }
        if (requestEnd.isAfter(cursor)) {
            gaps.add(new TimeWindow(cursor, requestEnd));
        }
        return gaps;
    }

    private List<TimeWindow> mergeWindows(List<TimeWindow> windows) {
        if (windows == null || windows.isEmpty()) {
            return List.of();
        }
        List<TimeWindow> sorted = new ArrayList<>(windows.stream()
                .filter(window -> window != null && window.end() != null && window.start() != null && window.end().isAfter(window.start()))
                .sorted(Comparator.comparing(TimeWindow::start).thenComparing(TimeWindow::end))
                .toList());
        if (sorted.isEmpty()) {
            return List.of();
        }
        List<TimeWindow> merged = new ArrayList<>();
        TimeWindow current = sorted.get(0);
        for (int i = 1; i < sorted.size(); i++) {
            TimeWindow next = sorted.get(i);
            if (!next.start().isAfter(current.end())) {
                LocalTime end = next.end().isAfter(current.end()) ? next.end() : current.end();
                current = new TimeWindow(current.start(), end);
            } else {
                merged.add(current);
                current = next;
            }
        }
        merged.add(current);
        return merged;
    }

    private long resolveClientId(String fn, String ln, User me, boolean allowCreateIfMissing, UiLang lang) {
        Long companyId = me.getCompany().getId();
        List<Client> visible = SecurityUtils.isAdmin(me)
                ? clientRepository.findAllByCompanyId(companyId)
                : clientRepository.findByAssignedToIdAndCompanyId(me.getId(), companyId);
        visible = visible.stream().filter(c -> !c.isAnonymized()).toList();
        String nfn = normalize(fn);
        String nln = normalize(ln);
        List<Client> matches = new ArrayList<>();
        for (Client c : visible) {
            if (normalize(c.getFirstName()).equals(nfn) && normalize(c.getLastName()).equals(nln)) {
                matches.add(c);
            }
        }
        if (matches.isEmpty()) {
            Client fuzzy = findFuzzyClientMatch(visible, nfn, nln, lang);
            if (fuzzy != null) {
                return fuzzy.getId();
            }
            if (allowCreateIfMissing) {
                return createClientForVoice(fn, ln, me, lang).getId();
            }
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    msg(lang,
                            "Stranka s tem imenom ni bila najdena. Odprite ročno rezervacijo in najprej potrdite ali ustvarite stranko.",
                            "A client with that name was not found. Please open the manual booking form and confirm or create the client first."));
        }
        if (matches.size() > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang, "Več strank se ujema s tem imenom; izberite bolj natančno.", "More than one client matches that name; please be more specific."));
        }
        return matches.get(0).getId();
    }

    private Client findFuzzyClientMatch(List<Client> visible, String nfn, String nln, UiLang lang) {
        if (nfn == null || nln == null || nfn.isBlank() || nln.isBlank()) {
            return null;
        }
        Client best = null;
        int bestScore = Integer.MAX_VALUE;
        int secondBestScore = Integer.MAX_VALUE;

        for (Client c : visible) {
            String cfn = normalize(c.getFirstName());
            String cln = normalize(c.getLastName());
            if (cfn.isBlank() || cln.isBlank()) {
                continue;
            }
            int df = levenshteinDistance(nfn, cfn);
            int dl = levenshteinDistance(nln, cln);
            int score = df + dl;
            if (df > 2 || dl > 2 || score > 3) {
                continue;
            }
            if (score < bestScore) {
                secondBestScore = bestScore;
                bestScore = score;
                best = c;
            } else if (score < secondBestScore) {
                secondBestScore = score;
            }
        }

        if (best == null) {
            return null;
        }
        if (secondBestScore == bestScore) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang,
                            "Ime stranke ni dovolj jasno (več podobnih ujemanj). Izgovorite ime in priimek bolj natančno.",
                            "The client name is not clear enough because several similar matches were found. Please say the full name more clearly."));
        }
        return best;
    }

    private static int levenshteinDistance(String a, String b) {
        if (a.equals(b)) {
            return 0;
        }
        int n = a.length();
        int m = b.length();
        if (n == 0) return m;
        if (m == 0) return n;

        int[] prev = new int[m + 1];
        int[] curr = new int[m + 1];
        for (int j = 0; j <= m; j++) {
            prev[j] = j;
        }
        for (int i = 1; i <= n; i++) {
            curr[0] = i;
            char ca = a.charAt(i - 1);
            for (int j = 1; j <= m; j++) {
                int cost = (ca == b.charAt(j - 1)) ? 0 : 1;
                curr[j] = Math.min(Math.min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev;
            prev = curr;
            curr = tmp;
        }
        return prev[m];
    }

    private boolean isBookableEnabled(Long companyId) {
        return settings.findByCompanyIdAndKey(companyId, SettingKey.BOOKABLE_ENABLED)
                .map(s -> !"false".equalsIgnoreCase(s.getValue().trim()))
                .orElse(true);
    }

    private boolean coversBookableSlot(Long companyId, Long consultantId, LocalDateTime start, LocalDateTime end) {
        if (!start.toLocalDate().equals(end.toLocalDate())) {
            return false;
        }
        LocalDate sessionDate = start.toLocalDate();
        DayOfWeek dow = start.getDayOfWeek();
        LocalTime startT = start.toLocalTime();
        LocalTime endT = end.toLocalTime();
        List<BookableSlot> slots = bookableSlotRepository.findByConsultantIdAndCompanyId(consultantId, companyId);
        for (BookableSlot slot : slots) {
            if (slot.getDayOfWeek() != dow) {
                continue;
            }
            if (!slot.isIndefinite()) {
                if (slot.getStartDate() != null && sessionDate.isBefore(slot.getStartDate())) {
                    continue;
                }
                if (slot.getEndDate() != null && sessionDate.isAfter(slot.getEndDate())) {
                    continue;
                }
            }
            if (!slot.getStartTime().isAfter(startT) && !slot.getEndTime().isBefore(endT)) {
                return true;
            }
        }
        return false;
    }

    private Client createClientForVoice(String firstName, String lastName, User me, UiLang lang) {
        if (SecurityUtils.isAdmin(me) && !me.isConsultant() && me.getRole() != Role.CONSULTANT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    msg(lang,
                            "Glasovno rezerviranje ne more ustvariti nove stranke, ker vaš račun ni označen kot osebje. Stranko dodajte ročno ali uporabite račun svetovalca.",
                            "Voice booking cannot create a new client because your account is not marked as staff. Please add the client manually or use a consultant account."));
        }
        var c = new Client();
        c.setCompany(me.getCompany());
        c.setFirstName(toUpperName(firstName));
        c.setLastName(toUpperName(lastName));
        c.setEmail(null);
        c.setPhone(null);
        c.setAssignedTo(me);
        return clientRepository.save(c);
    }

    private void enforceClientNameUppercase(Long clientId) {
        if (clientId == null) {
            return;
        }
        clientRepository.findById(clientId).ifPresent(client -> {
            String upFn = toUpperName(client.getFirstName());
            String upLn = toUpperName(client.getLastName());
            boolean changed = false;
            if (!upFn.equals(client.getFirstName())) {
                client.setFirstName(upFn);
                changed = true;
            }
            if (!upLn.equals(client.getLastName())) {
                client.setLastName(upLn);
                changed = true;
            }
            if (changed) {
                clientRepository.save(client);
            }
        });
    }

    private static String toUpperName(String s) {
        if (s == null) {
            return "";
        }
        return s.trim().toUpperCase(SLOVENIAN_LOCALE);
    }

    private static String displayClientName(String firstName, String lastName) {
        String fn = firstName == null ? "" : firstName.trim();
        String ln = lastName == null ? "" : lastName.trim();
        String full = (fn + " " + ln).trim();
        return full.isBlank() ? null : full;
    }

    private int defaultSessionLengthMinutes(Long companyId) {
        return settings.findByCompanyIdAndKey(companyId, SettingKey.SESSION_LENGTH_MINUTES)
                .map(s -> {
                    try {
                        int v = Integer.parseInt(s.getValue().trim());
                        return v > 0 ? v : 60;
                    } catch (NumberFormatException e) {
                        return 60;
                    }
                })
                .orElse(60);
    }

    private static String normalize(String s) {
        if (s == null) {
            return "";
        }
        String lower = s.trim().toLowerCase(Locale.ROOT);
        String folded = Normalizer.normalize(lower, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return folded.replaceAll("[^\\p{L}\\p{Nd}\\s]", " ").replaceAll("\\s+", " ").trim();
    }

    private record ParsedVoiceFields(
            String action,
            String firstName,
            String lastName,
            String title,
            String dateIso,
            String timeStr,
            String endTimeStr) {
        boolean completeFor(VoiceActionType actionType) {
            return switch (actionType) {
                case BOOK_SESSION -> firstName != null && lastName != null && dateIso != null && timeStr != null;
                case CANCEL_SESSION -> dateIso != null;
                case CREATE_PERSONAL -> title != null && dateIso != null && timeStr != null && endTimeStr != null;
                case CANCEL_PERSONAL -> dateIso != null && timeStr != null;
                case CREATE_TODO -> title != null && dateIso != null && timeStr != null;
                case CANCEL_TODO -> dateIso != null && timeStr != null;
                case OPEN_AVAILABILITY, BLOCK_AVAILABILITY -> dateIso != null && timeStr != null && endTimeStr != null;
            };
        }
    }

    private ParsedVoiceFields extractVoiceFields(JsonNode parsed) {
        if (parsed == null || parsed.isNull()) {
            return new ParsedVoiceFields(null, null, null, null, null, null, null);
        }
        String action = textOrNullAny(parsed, "action", "intent", "operation");
        String fn = textOrNullAny(parsed, "clientFirstName", "firstName", "givenName");
        String ln = textOrNullAny(parsed, "clientLastName", "lastName", "familyName", "surname");
        String title = textOrNullAny(parsed, "title", "task", "name", "label", "sessionTitle", "todoTitle");
        if (fn == null || ln == null) {
            String full = textOrNullAny(parsed, "clientName", "fullName", "patientName", "client");
            if (full != null) {
                String t = full.trim().replaceAll("\\s+", " ");
                int last = t.lastIndexOf(' ');
                if (last > 0) {
                    if (fn == null) fn = t.substring(0, last).trim();
                    if (ln == null) ln = t.substring(last + 1).trim();
                }
            }
        }
        String dateStr = textOrNullAny(parsed, "date", "sessionDate", "appointmentDate", "day");
        String timeStr = textOrNullAny(parsed, "time", "startTime", "sessionTime", "appointmentTime", "clock", "fromTime");
        String endTimeStr = textOrNullAny(parsed, "endTime", "toTime", "untilTime");

        String dt = textOrNullAny(parsed, "startDateTime", "datetime", "localDateTime", "iso", "at");
        if (dt != null && (dateStr == null || timeStr == null)) {
            LocalDateTime ldt = parseLenientDateTime(dt);
            if (ldt != null) {
                if (dateStr == null) dateStr = ldt.toLocalDate().toString();
                if (timeStr == null) timeStr = String.format("%02d:%02d", ldt.getHour(), ldt.getMinute());
            }
        }
        String endDt = textOrNullAny(parsed, "endDateTime", "until", "to");
        if (endDt != null && endTimeStr == null) {
            LocalDateTime ldt = parseLenientDateTime(endDt);
            if (ldt != null) {
                endTimeStr = String.format("%02d:%02d", ldt.getHour(), ldt.getMinute());
                if (dateStr == null) dateStr = ldt.toLocalDate().toString();
            }
        }

        if (dateStr != null) dateStr = normalizeDateToIso(dateStr);
        if (timeStr != null) timeStr = normalizeTimeToHhMm(timeStr);
        if (endTimeStr != null) endTimeStr = normalizeTimeToHhMm(endTimeStr);

        return new ParsedVoiceFields(action, fn, ln, title, dateStr, timeStr, endTimeStr);
    }

    private static String textOrNullAny(JsonNode node, String... fields) {
        for (String field : fields) {
            if (node != null && node.has(field) && !node.get(field).isNull()) {
                String v = node.get(field).asText();
                if (v != null && !v.isBlank()) {
                    return v.trim();
                }
            }
        }
        return null;
    }

    private static LocalDateTime parseLenientDateTime(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String s = raw.trim();
        try {
            return LocalDateTime.parse(s, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (DateTimeParseException e1) {
            try {
                return OffsetDateTime.parse(s).toLocalDateTime();
            } catch (DateTimeParseException e2) {
                try {
                    return ZonedDateTime.parse(s).toLocalDateTime();
                } catch (DateTimeParseException e3) {
                    return null;
                }
            }
        }
    }

    private static String normalizeDateToIso(String dateStr) {
        if (dateStr == null) {
            return null;
        }
        String s = dateStr.trim();
        if (s.matches("\\d{4}-\\d{2}-\\d{2}")) {
            return s;
        }
        try {
            return LocalDate.parse(s).toString();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static String normalizeTimeToHhMm(String timeStr) {
        if (timeStr == null) {
            return null;
        }
        String t = timeStr.trim();
        if (!t.matches("\\d{1,2}:\\d{2}(:\\d{2})?")) {
            return t;
        }
        try {
            String[] parts = t.split(":");
            int h = Integer.parseInt(parts[0]);
            int m = Integer.parseInt(parts[1]);
            int sec = parts.length > 2 ? Integer.parseInt(parts[2]) : 0;
            if (h < 0 || h > 23 || m < 0 || m > 59 || sec < 0 || sec > 59) {
                return t;
            }
            return String.format(Locale.ROOT, "%02d:%02d:%02d", h, m, sec);
        } catch (NumberFormatException e) {
            return t;
        }
    }

    private static String stripCodeFences(String content) {
        String s = content.strip();
        if (!s.startsWith("```")) {
            return s;
        }
        int firstNl = s.indexOf('\n');
        if (firstNl > 0) {
            s = s.substring(firstNl + 1);
        }
        if (s.endsWith("```")) {
            s = s.substring(0, s.length() - 3).strip();
        }
        return s;
    }

    private static String extractJsonObject(String s) {
        int start = s.indexOf('{');
        int end = s.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return s.substring(start, end + 1);
        }
        return s;
    }

    private JsonNode parseModelJsonContent(String content) throws Exception {
        String stripped = stripCodeFences(content.trim());
        String json = extractJsonObject(stripped);
        return objectMapper.readTree(json);
    }

    private JsonNode callOpenAiRepairJson(String transcript, String todayIso, String zoneId, JsonNode partial, List<Client> knownClients) {
        String knownNamesPrompt = knownClientNamesPrompt(knownClients);
        String system = """
                The previous JSON was incomplete. Extract one calendar action from a spoken or typed sentence in Slovenian or English.
                Return exactly one JSON object, with no markdown.
                Keys:
                - action (required): one of book_session, cancel_session, create_personal, cancel_personal, create_todo, cancel_todo, open_availability, block_availability
                - clientFirstName, clientLastName (required only for book_session; optional for cancel_session)
                - title (required for create_personal and create_todo; optional for cancel_personal and cancel_todo)
                - date (required, YYYY-MM-DD)
                - time (required for book_session, create_personal, cancel_personal, create_todo, cancel_todo, open_availability, block_availability; HH:mm)
                - endTime (required for create_personal, open_availability, block_availability; HH:mm)
                - durationMinutes (optional number, only for book_session)

                Time zone: %s. Today's date is %s.
                Fill missing values from the original transcript only. Do not invent names or titles.
                Understand Slovenian and English commands such as:
                - Dodaj osebno ..., Odpovej osebno ...
                - Dodaj opravek ..., Odpovej opravek ...
                - Odpri za ..., Zapri za ...
                - Book ..., Cancel booking ...
                %s
                """.formatted(zoneId, todayIso, knownNamesPrompt);
        String userContent = "Original transcript:\n" + transcript + "\n\nPrevious JSON to repair:\n" + partial;
        return postChatCompletion(system, userContent);
    }

    private JsonNode callOpenAiForJson(String transcript, String todayIso, String zoneId, List<Client> knownClients) {
        String knownNamesPrompt = knownClientNamesPrompt(knownClients);
        String system = """
                Extract a single calendar action from a spoken or typed sentence in Slovenian or English.
                Return exactly one JSON object, with no markdown.
                Use these exact keys:
                - action: one of book_session, cancel_session, create_personal, cancel_personal, create_todo, cancel_todo, open_availability, block_availability
                - clientFirstName: client's first name (required for book_session, optional for cancel_session)
                - clientLastName: client's last name (required for book_session, optional for cancel_session)
                - title: title/task name for personal sessions or todos
                - date: YYYY-MM-DD
                - time: start time in 24-hour HH:mm
                - endTime: end time in 24-hour HH:mm
                - durationMinutes: optional number for book_session

                Rules:
                - Time zone: %s. Today's date is %s.
                - If the year is not spoken, choose the next calendar occurrence of that date on or after today in this time zone.
                - Understand Slovenian time phrases like "ob štirinajstih", "od 12h do 15h", "ob 14.00" and English phrases like "at 2 pm", "from 12 to 15", "from 12:00 until 15:00".
                - Split client names into first and last name when possible.
                - Do not invent names or titles.
                - For cancel_session, date is required; time and client are optional.
                - For cancel_personal and cancel_todo, date and time are required; title is optional but include it if spoken.
                - For create_personal, title/date/time/endTime are required.
                - For create_todo, title/date/time are required.
                - For open_availability and block_availability, date/time/endTime are required.
                - Recognize commands such as:
                  * "Dodaj osebno Kosilo za 27. april od 12h do 15h"
                  * "Odpovej osebno Kosilo za 27. april ob 12h"
                  * "Dodaj opravek Pokliči Marka za 27. april ob 12h"
                  * "Odpovej opravek Pokliči Marka za 27. april ob 12h"
                  * "Odpri za 27. april od 12h do 15h"
                  * "Zapri za 27. april od 12h do 15h"
                  * "Book Tina Jekler on April 28 at 14:00"
                  * "Cancel booking for Tina Jekler on April 28 at 14:00"
                %s
                """.formatted(zoneId, todayIso, knownNamesPrompt);
        return postChatCompletion(system, transcript);
    }

    private JsonNode postChatCompletion(String system, String userContent) {
        try {
            String url = openAiConfig.getBaseUrl().replaceAll("/$", "") + "/chat/completions";
            var headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(openAiConfig.getApiKey());

            ObjectNode root = objectMapper.createObjectNode();
            root.put("model", openAiConfig.getModel());
            ObjectNode rf = objectMapper.createObjectNode();
            rf.put("type", "json_object");
            root.set("response_format", rf);
            ArrayNode messages = objectMapper.createArrayNode();
            ObjectNode sys = objectMapper.createObjectNode();
            sys.put("role", "system");
            sys.put("content", system);
            messages.add(sys);
            ObjectNode userMsg = objectMapper.createObjectNode();
            userMsg.put("role", "user");
            userMsg.put("content", userContent);
            messages.add(userMsg);
            root.set("messages", messages);

            String body = objectMapper.writeValueAsString(root);
            var entity = new HttpEntity<>(body, headers);
            var response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
            String responseBody = response.getBody();
            if (responseBody == null || responseBody.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Empty response from OpenAI.");
            }
            JsonNode responseJson = objectMapper.readTree(responseBody);
            String content = responseJson.path("choices").path(0).path("message").path("content").asText();
            if (content == null || content.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "No content from OpenAI.");
            }
            return parseModelJsonContent(content);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (HttpClientErrorException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "OpenAI request failed: " + e.getStatusCode());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Voice action parsing failed: " + e.getMessage());
        }
    }

    private String knownClientNamesPrompt(List<Client> knownClients) {
        if (knownClients == null || knownClients.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        sb.append("Known clients (use the closest client name if speech recognition missed accents/diacritics): ");
        int added = 0;
        for (Client c : knownClients) {
            if (c == null || c.getFirstName() == null || c.getLastName() == null) {
                continue;
            }
            String fn = c.getFirstName().trim();
            String ln = c.getLastName().trim();
            if (fn.isBlank() || ln.isBlank()) {
                continue;
            }
            if (added > 0) {
                sb.append("; ");
            }
            sb.append(fn).append(" ").append(ln);
            added++;
            if (added >= 200) {
                break;
            }
        }
        return added == 0 ? "" : sb.toString();
    }
}
