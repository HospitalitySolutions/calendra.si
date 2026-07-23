package com.example.app.demobooking;

import com.example.app.demobooking.DemoBookingApiModels.AdminBookingView;
import com.example.app.demobooking.DemoBookingApiModels.AdminProfileRequest;
import com.example.app.demobooking.DemoBookingApiModels.AdminProfileView;
import com.example.app.demobooking.DemoBookingApiModels.AvailabilityResponse;
import com.example.app.demobooking.DemoBookingApiModels.AvailabilityWindow;
import com.example.app.demobooking.DemoBookingApiModels.AvailableDay;
import com.example.app.demobooking.DemoBookingApiModels.AvailableSlot;
import com.example.app.demobooking.DemoBookingApiModels.BookingView;
import com.example.app.demobooking.DemoBookingApiModels.ConfirmRequest;
import com.example.app.demobooking.DemoBookingApiModels.HoldRequest;
import com.example.app.demobooking.DemoBookingApiModels.HoldResponse;
import com.example.app.demobooking.DemoBookingApiModels.HostView;
import com.example.app.demobooking.DemoBookingApiModels.PublicProfile;
import com.example.app.demobooking.DemoBookingApiModels.RescheduleRequest;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.google.GoogleMeetService;
import com.example.app.session.BookingChangePublisher;
import com.example.app.session.SessionBookingRealtimeService;
import com.example.app.session.PersonalCalendarBlock;
import com.example.app.session.PersonalCalendarBlockRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.zoom.ZoomService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DemoBookingService {
    private static final Logger log = LoggerFactory.getLogger(DemoBookingService.class);

    public static final String DEFAULT_SLUG = "predstavitev";
    private static final List<String> BLOCKING_STATUSES = List.of("CONFIRMED");
    private static final Duration HOLD_DURATION = Duration.ofMinutes(5);

    private final DemoBookingProfileRepository profiles;
    private final DemoBookingRepository bookings;
    private final DemoBookingHoldRepository holds;
    private final UserRepository users;
    private final ClientRepository clients;
    private final SessionBookingRepository sessionBookings;
    private final SessionBookingRealtimeService bookingRealtime;
    private final PersonalCalendarBlockRepository personalBlocks;
    private final GoogleMeetService googleMeet;
    private final ZoomService zoom;
    private final DemoBookingEmailService emails;
    private final ObjectMapper objectMapper;

    public DemoBookingService(
            DemoBookingProfileRepository profiles,
            DemoBookingRepository bookings,
            DemoBookingHoldRepository holds,
            UserRepository users,
            ClientRepository clients,
            SessionBookingRepository sessionBookings,
            SessionBookingRealtimeService bookingRealtime,
            PersonalCalendarBlockRepository personalBlocks,
            GoogleMeetService googleMeet,
            ZoomService zoom,
            DemoBookingEmailService emails,
            ObjectMapper objectMapper) {
        this.profiles = profiles;
        this.bookings = bookings;
        this.holds = holds;
        this.users = users;
        this.clients = clients;
        this.sessionBookings = sessionBookings;
        this.bookingRealtime = bookingRealtime;
        this.personalBlocks = personalBlocks;
        this.googleMeet = googleMeet;
        this.zoom = zoom;
        this.emails = emails;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public PublicProfile publicProfile() {
        DemoBookingProfile profile = profiles.findFirstBySlug(DEFAULT_SLUG).orElse(null);
        if (profile == null) {
            return new PublicProfile(DEFAULT_SLUG, "Predstavitev Calendre", false, 30, "Europe/Ljubljana", "GOOGLE_MEET", 30, 1440);
        }
        return new PublicProfile(
                profile.getSlug(), profile.getTitle(), profile.isEnabled() && profile.getHostUser() != null,
                profile.getDurationMinutes(), profile.getTimeZone(), profile.getMeetingProvider(),
                profile.getBookingHorizonDays(), profile.getMinimumNoticeMinutes());
    }

    @Transactional
    public AvailabilityResponse availability(LocalDate from, LocalDate to, String guestTimeZone) {
        DemoBookingProfile profile = requireEnabledProfile();
        ZoneId hostZone = safeZone(profile.getTimeZone(), ZoneId.of("Europe/Ljubljana"));
        ZoneId guestZone = safeZone(guestTimeZone, hostZone);
        LocalDate guestFrom = from == null ? LocalDate.now(guestZone) : from;
        LocalDate maxDate = LocalDate.now(hostZone).plusDays(Math.max(1, profile.getBookingHorizonDays()));
        LocalDate guestTo = to == null ? guestFrom.plusDays(13) : to;
        if (guestTo.isBefore(guestFrom)) throw badRequest("Invalid availability date range.");
        if (guestTo.isAfter(maxDate.plusDays(1))) guestTo = maxDate.plusDays(1);
        if (guestTo.isAfter(guestFrom.plusDays(45))) guestTo = guestFrom.plusDays(45);

        holds.deleteExpired(Instant.now());
        Map<LocalDate, List<AvailableSlot>> grouped = new LinkedHashMap<>();
        LocalDate hostStart = guestFrom.minusDays(1);
        LocalDate hostEnd = guestTo.plusDays(1);
        for (LocalDate hostDate = hostStart; !hostDate.isAfter(hostEnd); hostDate = hostDate.plusDays(1)) {
            for (AvailabilityWindow window : windowsFor(profile, hostDate.getDayOfWeek())) {
                if (!window.enabled()) continue;
                LocalTime windowStart = parseTime(window.start(), LocalTime.of(9, 0));
                LocalTime windowEnd = parseTime(window.end(), LocalTime.of(17, 0));
                if (!windowEnd.isAfter(windowStart)) continue;
                ZonedDateTime cursor = ZonedDateTime.of(hostDate, windowStart, hostZone);
                ZonedDateTime windowEndAt = ZonedDateTime.of(hostDate, windowEnd, hostZone);
                while (!cursor.plusMinutes(profile.getDurationMinutes()).isAfter(windowEndAt)) {
                    Instant startAt = cursor.toInstant();
                    Instant endAt = cursor.plusMinutes(profile.getDurationMinutes()).toInstant();
                    LocalDate guestDate = startAt.atZone(guestZone).toLocalDate();
                    if (!guestDate.isBefore(guestFrom) && !guestDate.isAfter(guestTo)
                            && isSlotAvailable(profile, startAt, endAt, null, "")) {
                        ZonedDateTime guestStart = startAt.atZone(guestZone);
                        ZonedDateTime guestEnd = endAt.atZone(guestZone);
                        grouped.computeIfAbsent(guestDate, ignored -> new ArrayList<>()).add(new AvailableSlot(
                                startAt.toString(), endAt.toString(),
                                guestStart.format(DateTimeFormatter.ofPattern("HH:mm")) + "–" + guestEnd.format(DateTimeFormatter.ofPattern("HH:mm"))));
                    }
                    cursor = cursor.plusMinutes(Math.max(5, profile.getSlotStepMinutes()));
                }
            }
        }
        List<AvailableDay> days = grouped.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> new AvailableDay(entry.getKey().toString(), entry.getValue().stream()
                        .sorted(Comparator.comparing(AvailableSlot::startAt)).toList()))
                .toList();
        return new AvailabilityResponse(guestZone.getId(), days);
    }

    @Transactional
    public HoldResponse hold(HoldRequest request) {
        DemoBookingProfile profile = lockEnabledProfile();
        Instant startAt = parseInstant(request == null ? null : request.startAt());
        Instant endAt = startAt.plus(Duration.ofMinutes(profile.getDurationMinutes()));
        String previous = clean(request == null ? null : request.previousHoldToken(), 100);
        if (!previous.isBlank()) holds.findByHoldToken(previous).ifPresent(holds::delete);
        holds.deleteExpired(Instant.now());
        if (!isSlotCandidate(profile, startAt, endAt) || !isSlotAvailable(profile, startAt, endAt, null, previous)) {
            throw conflict("This time is no longer available. Please choose another slot.");
        }
        DemoBookingHold hold = new DemoBookingHold();
        hold.setProfile(profile);
        hold.setStartAt(startAt);
        hold.setEndAt(endAt);
        hold.setHoldToken(token());
        hold.setExpiresAt(Instant.now().plus(HOLD_DURATION));
        holds.saveAndFlush(hold);
        return new HoldResponse(hold.getHoldToken(), hold.getExpiresAt(), startAt.toString(), endAt.toString());
    }

    @Transactional
    public BookingView confirm(ConfirmRequest request) {
        DemoBookingProfile profile = lockEnabledProfile();
        DemoBookingHold hold = requireValidHold(request == null ? null : request.holdToken(), profile);
        validateGuest(request);
        if (!isSlotAvailable(profile, hold.getStartAt(), hold.getEndAt(), null, hold.getHoldToken())) {
            throw conflict("This time is no longer available. Please choose another slot.");
        }
        User host = requireHost(profile);
        ZoneId hostZone = safeZone(profile.getTimeZone(), ZoneId.of("Europe/Ljubljana"));
        LocalDateTime localStart = LocalDateTime.ofInstant(hold.getStartAt(), hostZone);
        LocalDateTime localEnd = LocalDateTime.ofInstant(hold.getEndAt(), hostZone);
        String guestName = cleanRequired(request.guestName(), 200, "Name is required.");
        String guestEmail = cleanEmail(request.guestEmail());
        String companyName = cleanRequired(request.companyName(), 240, "Company name is required.");
        String topic = profile.getTitle() + " – " + companyName;
        String description = meetingDescription(guestName, guestEmail, request.guestPhone(), companyName, request.guestNote());
        MeetingProvision meeting = createMeeting(profile, host, localStart, localEnd, hostZone, topic, guestEmail, description);

        DemoBooking booking = new DemoBooking();
        booking.setProfile(profile);
        booking.setHostUser(host);
        booking.setStartAt(hold.getStartAt());
        booking.setEndAt(hold.getEndAt());
        booking.setStatus("CONFIRMED");
        booking.setGuestName(guestName);
        booking.setGuestEmail(guestEmail);
        booking.setGuestPhone(clean(request.guestPhone(), 80));
        booking.setCompanyName(companyName);
        booking.setGuestNote(clean(request.guestNote(), 2000));
        booking.setGuestTimeZone(safeZone(request.guestTimeZone(), hostZone).getId());
        booking.setLocale(normalizeLocale(request.locale()));
        booking.setMeetingProvider(profile.getMeetingProvider());
        booking.setMeetingJoinUrl(meeting.joinUrl());
        booking.setExternalMeetingId(meeting.externalId());
        booking.setManageToken(token());
        booking.setUtmSource(clean(request.utmSource(), 200));
        booking.setUtmMedium(clean(request.utmMedium(), 200));
        booking.setUtmCampaign(clean(request.utmCampaign(), 200));
        bookings.saveAndFlush(booking);

        Client client = findOrCreateDemoClient(host, guestName, guestEmail, request.guestPhone());
        SessionBooking calendarBooking = createBookedCalendarSession(
                booking, host, client, localStart, localEnd, description, meeting.joinUrl(), profile.getMeetingProvider());
        booking.setSessionBookingId(calendarBooking.getId());
        bookings.save(booking);
        holds.delete(hold);
        emails.sendCreated(booking, normalizeLocale(request.locale()));
        return toView(booking);
    }

    @Transactional(readOnly = true)
    public BookingView manage(String token) {
        return toView(requireBooking(token));
    }

    @Transactional
    public BookingView cancel(String token, String locale) {
        DemoBooking booking = requireBooking(token);
        if (!"CONFIRMED".equals(booking.getStatus())) return toView(booking);
        cancelExternalMeeting(booking);
        cancelCalendarSession(booking);
        if (booking.getSessionBookingId() == null && booking.getCalendarBlockId() != null) {
            personalBlocks.findById(booking.getCalendarBlockId()).ifPresent(personalBlocks::delete);
        }
        booking.setStatus("CANCELLED");
        booking.setCancelledAt(Instant.now());
        bookings.save(booking);
        emails.sendCancelled(booking, normalizeLocale(locale));
        return toView(booking);
    }

    @Transactional
    public BookingView reschedule(String token, RescheduleRequest request) {
        DemoBooking booking = requireBooking(token);
        if (!"CONFIRMED".equals(booking.getStatus())) throw conflict("Only confirmed bookings can be rescheduled.");
        DemoBookingProfile profile = profiles.findBySlugForUpdate(booking.getProfile().getSlug()).orElseThrow();
        DemoBookingHold hold = requireValidHold(request == null ? null : request.holdToken(), profile);
        if (!isSlotCandidate(profile, hold.getStartAt(), hold.getEndAt())
                || !isSlotAvailable(profile, hold.getStartAt(), hold.getEndAt(), booking.getId(), hold.getHoldToken())) {
            throw conflict("This time is no longer available. Please choose another slot.");
        }
        ZoneId hostZone = safeZone(profile.getTimeZone(), ZoneId.of("Europe/Ljubljana"));
        LocalDateTime localStart = LocalDateTime.ofInstant(hold.getStartAt(), hostZone);
        LocalDateTime localEnd = LocalDateTime.ofInstant(hold.getEndAt(), hostZone);
        String topic = profile.getTitle() + " – " + booking.getCompanyName();
        String description = meetingDescription(booking.getGuestName(), booking.getGuestEmail(), booking.getGuestPhone(), booking.getCompanyName(), booking.getGuestNote());

        // Updating Google Calendar/Zoom is an integration side effect and must not
        // roll back a valid Calendra reschedule. The existing meeting URL remains
        // usable even when the provider temporarily rejects the event update.
        try {
            updateExternalMeeting(booking, localStart, localEnd, hostZone, topic, description);
        } catch (RuntimeException externalMeetingError) {
            log.warn(
                    "Demo booking was rescheduled internally, but the external meeting could not be updated. bookingId={}, provider={}, externalMeetingId={}, error={}",
                    booking.getId(), booking.getMeetingProvider(), booking.getExternalMeetingId(),
                    externalMeetingError.getMessage(), externalMeetingError);
        }

        rescheduleCalendarSession(booking, localStart, localEnd, description);
        if (booking.getSessionBookingId() == null && booking.getCalendarBlockId() != null) {
            personalBlocks.findById(booking.getCalendarBlockId()).ifPresent(block -> {
                block.setStartTime(localStart);
                block.setEndTime(localEnd);
                block.setTask(topic);
                block.setNotes(description + "\n" + booking.getMeetingJoinUrl());
                personalBlocks.save(block);
            });
        }
        booking.setStartAt(hold.getStartAt());
        booking.setEndAt(hold.getEndAt());
        booking.setGuestTimeZone(safeZone(request == null ? null : request.guestTimeZone(), hostZone).getId());
        booking.setReminder24hSentAt(null);
        booking.setReminder1hSentAt(null);
        bookings.save(booking);
        holds.delete(hold);
        emails.sendRescheduled(booking, normalizeLocale(request == null ? null : request.locale()));
        return toView(booking);
    }

    @Transactional
    public AdminProfileView adminProfile(User me) {
        DemoBookingProfile profile = profiles.findFirstBySlug(DEFAULT_SLUG).orElseGet(() -> {
            DemoBookingProfile created = new DemoBookingProfile();
            if (me != null && me.getRole() == Role.SUPER_ADMIN) created.setHostUser(me);
            return profiles.save(created);
        });
        return toAdminProfile(profile);
    }

    @Transactional
    public AdminProfileView saveAdminProfile(User me, AdminProfileRequest request) {
        DemoBookingProfile profile = profiles.findBySlugForUpdate(DEFAULT_SLUG).orElseGet(DemoBookingProfile::new);
        // Phase 1 exposes one stable public booking page. Keep the slug fixed so
        // public/profile and availability lookups can never drift apart.
        profile.setSlug(DEFAULT_SLUG);
        profile.setTitle(cleanRequired(request.title(), 200, "Title is required."));
        profile.setEnabled(Boolean.TRUE.equals(request.enabled()));
        profile.setDurationMinutes(clamp(request.durationMinutes(), 15, 180, 30));
        profile.setSlotStepMinutes(clamp(request.slotStepMinutes(), 5, 180, 30));
        profile.setBufferBeforeMinutes(clamp(request.bufferBeforeMinutes(), 0, 180, 10));
        profile.setBufferAfterMinutes(clamp(request.bufferAfterMinutes(), 0, 180, 10));
        profile.setMinimumNoticeMinutes(clamp(request.minimumNoticeMinutes(), 0, 60 * 24 * 30, 1440));
        profile.setBookingHorizonDays(clamp(request.bookingHorizonDays(), 1, 365, 30));
        profile.setMaximumBookingsPerDay(clamp(request.maximumBookingsPerDay(), 0, 50, 4));
        ZoneId zone = safeZone(request.timeZone(), null);
        if (zone == null) throw badRequest("Invalid time zone.");
        profile.setTimeZone(zone.getId());
        String provider = normalizeProvider(request.meetingProvider());
        profile.setMeetingProvider(provider);
        User host = request.hostUserId() == null
                ? me
                : users.findById(request.hostUserId()).orElseThrow(() -> badRequest("Host user was not found."));
        if (host == null || host.getRole() != Role.SUPER_ADMIN || !host.isActive()) throw badRequest("The host must be an active Platform Admin user.");
        profile.setHostUser(host);
        List<AvailabilityWindow> availability = normalizeAvailability(request.availability());
        try { profile.setAvailabilityJson(objectMapper.writeValueAsString(availability)); }
        catch (Exception e) { throw badRequest("Availability could not be saved."); }
        if (profile.isEnabled()) {
            if ("GOOGLE_MEET".equals(provider) && !googleMeet.hasValidToken(host.getId())) throw badRequest("Connect Google Meet for the selected host before enabling demo bookings.");
            if ("ZOOM".equals(provider) && !zoom.hasValidToken(host.getId())) throw badRequest("Connect Zoom for the selected host before enabling demo bookings.");
        }
        return toAdminProfile(profiles.save(profile));
    }

    @Transactional(readOnly = true)
    public List<HostView> hosts() {
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .filter(User::isActive)
                .map(user -> new HostView(user.getId(), fullName(user), user.getEmail(), googleMeet.hasValidToken(user.getId()), zoom.hasValidToken(user.getId())))
                .toList();
    }

    @Transactional
    public List<AdminBookingView> adminBookings(Instant from, Instant to) {
        Instant effectiveFrom = from == null ? Instant.now().minus(Duration.ofDays(30)) : from;
        Instant effectiveTo = to == null ? Instant.now().plus(Duration.ofDays(90)) : to;
        List<DemoBooking> rows = bookings.findAdminRange(effectiveFrom, effectiveTo);
        rows.forEach(this::ensureBookedCalendarSession);
        return rows.stream().map(this::toAdminView).toList();
    }

    @Transactional
    public BookingView adminCancel(Long bookingId, String locale) {
        DemoBooking booking = bookings.findById(bookingId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return cancel(booking.getManageToken(), locale);
    }

    private boolean isSlotCandidate(DemoBookingProfile profile, Instant startAt, Instant endAt) {
        ZoneId hostZone = safeZone(profile.getTimeZone(), ZoneId.of("Europe/Ljubljana"));
        ZonedDateTime start = startAt.atZone(hostZone);
        ZonedDateTime end = endAt.atZone(hostZone);
        Instant earliest = Instant.now().plus(Duration.ofMinutes(Math.max(0, profile.getMinimumNoticeMinutes())));
        Instant latest = LocalDate.now(hostZone).plusDays(profile.getBookingHorizonDays() + 1L).atStartOfDay(hostZone).toInstant();
        if (startAt.isBefore(earliest) || !startAt.isBefore(latest)) return false;
        if (!Duration.between(startAt, endAt).equals(Duration.ofMinutes(profile.getDurationMinutes()))) return false;
        for (AvailabilityWindow window : windowsFor(profile, start.getDayOfWeek())) {
            if (!window.enabled()) continue;
            LocalTime windowStart = parseTime(window.start(), LocalTime.of(9, 0));
            LocalTime windowEnd = parseTime(window.end(), LocalTime.of(17, 0));
            if (!start.toLocalTime().isBefore(windowStart) && !end.toLocalTime().isAfter(windowEnd)) {
                long minutesFromWindowStart = Duration.between(windowStart, start.toLocalTime()).toMinutes();
                return minutesFromWindowStart % Math.max(5, profile.getSlotStepMinutes()) == 0;
            }
        }
        return false;
    }

    private boolean isSlotAvailable(DemoBookingProfile profile, Instant startAt, Instant endAt, Long excludedBookingId, String excludedHoldToken) {
        if (!isSlotCandidate(profile, startAt, endAt)) return false;
        User host = profile.getHostUser();
        if (host == null) return false;
        Instant busyStart = startAt.minus(Duration.ofMinutes(Math.max(0, profile.getBufferBeforeMinutes())));
        Instant busyEnd = endAt.plus(Duration.ofMinutes(Math.max(0, profile.getBufferAfterMinutes())));
        long excluded = excludedBookingId == null ? -1L : excludedBookingId;
        if (bookings.existsOverlappingExcluding(profile.getId(), excluded, BLOCKING_STATUSES, busyStart, busyEnd)) return false;
        if (holds.existsActiveOverlap(profile.getId(), Instant.now(), excludedHoldToken == null ? "" : excludedHoldToken, busyStart, busyEnd)) return false;
        ZoneId hostZone = safeZone(profile.getTimeZone(), ZoneId.of("Europe/Ljubljana"));
        LocalDateTime localBusyStart = LocalDateTime.ofInstant(busyStart, hostZone);
        LocalDateTime localBusyEnd = LocalDateTime.ofInstant(busyEnd, hostZone);
        Long excludedSessionBookingId = excludedBookingId == null
                ? null
                : bookings.findById(excludedBookingId).map(DemoBooking::getSessionBookingId).orElse(null);
        if (sessionBookings.existsOverlappingForConsultantExcluding(
                host.getCompany().getId(), host.getId(), localBusyStart, localBusyEnd,
                List.of(excludedSessionBookingId == null ? -1L : excludedSessionBookingId))) return false;
        if (personalBlocks.existsOverlappingPersonalSessionForOwner(host.getId(), host.getCompany().getId(), localBusyStart, localBusyEnd)) return false;
        if (profile.getMaximumBookingsPerDay() > 0) {
            LocalDate day = startAt.atZone(hostZone).toLocalDate();
            long count = bookings.countForDayExcluding(
                    profile.getId(), excluded, BLOCKING_STATUSES,
                    day.atStartOfDay(hostZone).toInstant(), day.plusDays(1).atStartOfDay(hostZone).toInstant());
            if (count >= profile.getMaximumBookingsPerDay()) return false;
        }
        return true;
    }

    private void ensureBookedCalendarSession(DemoBooking booking) {
        if (booking == null || booking.getSessionBookingId() != null || !"CONFIRMED".equals(booking.getStatus())) return;
        User host = booking.getHostUser();
        if (host == null || host.getCompany() == null || !host.isActive()) return;
        if (!host.isConsultant()) {
            host.setConsultant(true);
            host = users.save(host);
        }
        ZoneId hostZone = safeZone(booking.getProfile().getTimeZone(), ZoneId.of("Europe/Ljubljana"));
        LocalDateTime start = LocalDateTime.ofInstant(booking.getStartAt(), hostZone);
        LocalDateTime end = LocalDateTime.ofInstant(booking.getEndAt(), hostZone);
        String description = meetingDescription(
                booking.getGuestName(), booking.getGuestEmail(), booking.getGuestPhone(),
                booking.getCompanyName(), booking.getGuestNote());
        Client client = findOrCreateDemoClient(host, booking.getGuestName(), booking.getGuestEmail(), booking.getGuestPhone());
        SessionBooking session = createBookedCalendarSession(
                booking, host, client, start, end, description,
                booking.getMeetingJoinUrl(), booking.getMeetingProvider());
        booking.setSessionBookingId(session.getId());
        if (booking.getCalendarBlockId() != null) {
            personalBlocks.findById(booking.getCalendarBlockId()).ifPresent(personalBlocks::delete);
            booking.setCalendarBlockId(null);
        }
        bookings.save(booking);
    }

    private Client findOrCreateDemoClient(User host, String guestName, String guestEmail, String guestPhone) {
        Long companyId = host.getCompany().getId();
        String normalizedEmail = cleanEmail(guestEmail);
        String normalizedPhone = clean(guestPhone, 80);
        Client client = clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(companyId, normalizedEmail).stream()
                .findFirst()
                .orElse(null);
        if (client == null && !normalizedPhone.isBlank()) {
            client = clients.findFirstCandidatesByCompanyIdAndNormalizedPhone(companyId, normalizedPhone).stream()
                    .findFirst()
                    .orElse(null);
        }
        if (client != null) {
            if (client.getAssignedTo() == null) client.setAssignedTo(host);
            if (client.getEmail() == null || client.getEmail().isBlank()) client.setEmail(normalizedEmail);
            if (!normalizedPhone.isBlank() && (client.getPhone() == null || client.getPhone().isBlank())) {
                client.setPhone(normalizedPhone);
                client.setWhatsappPhone(normalizedPhone);
            }
            return clients.save(client);
        }

        NameParts names = splitGuestName(guestName);
        Client created = new Client();
        created.setCompany(host.getCompany());
        created.setAssignedTo(host);
        created.setFirstName(names.firstName());
        created.setLastName(names.lastName());
        created.setEmail(normalizedEmail);
        created.setPhone(normalizedPhone.isBlank() ? null : normalizedPhone);
        created.setWhatsappPhone(normalizedPhone.isBlank() ? null : normalizedPhone);
        created.setWhatsappOptIn(false);
        created.setActive(true);
        created.setBatchPaymentEnabled(false);
        return clients.save(created);
    }

    private SessionBooking createBookedCalendarSession(
            DemoBooking demoBooking,
            User host,
            Client client,
            LocalDateTime start,
            LocalDateTime end,
            String description,
            String meetingLink,
            String provider) {
        SessionBooking session = new SessionBooking();
        session.setCompany(host.getCompany());
        session.setClient(client);
        session.setConsultant(host);
        session.setBookingGroupKey(UUID.randomUUID().toString());
        session.setStartTime(start);
        session.setEndTime(end);
        session.setNotes(clean(description, 1000));
        session.setMeetingLink(clean(meetingLink, 500));
        session.setMeetingProvider(sessionMeetingProvider(provider));
        session.setMeetingProvisioningStatus("READY");
        session.setMeetingProvisioningError(null);
        session.setMeetingProvisioningAttempts(0);
        session.setMeetingProvisioningStartedAt(null);
        session.setMeetingProvisioningNextAttemptAt(null);
        session.setMeetingConfirmationPending(false);
        session.setBookingStatus(SessionBookingStatus.RESERVED);
        session.setSourceChannel("DEMO_BOOKING");
        session.setSourceOrderId(String.valueOf(demoBooking.getId()));
        session = sessionBookings.saveAndFlush(session);
        bookingRealtime.publishBookingUpdated(
                host.getCompany().getId(), session.getId(), session.getStartTime(), session.getEndTime(),
                BookingChangePublisher.BOOKING_CREATED);
        return session;
    }

    private void cancelCalendarSession(DemoBooking booking) {
        if (booking.getSessionBookingId() == null) return;
        Long companyId = booking.getHostUser().getCompany().getId();
        sessionBookings.findByIdAndCompanyId(booking.getSessionBookingId(), companyId).ifPresent(session -> {
            session.setBookingStatus(SessionBookingStatus.CANCELLED);
            session.setMeetingLink(null);
            session.setMeetingProvider(null);
            session.setMeetingProvisioningStatus("NONE");
            session.setMeetingProvisioningError(null);
            session.setMeetingProvisioningStartedAt(null);
            session.setMeetingProvisioningNextAttemptAt(null);
            sessionBookings.save(session);
            bookingRealtime.publishBookingUpdated(
                    companyId, session.getId(), session.getStartTime(), session.getEndTime(),
                    BookingChangePublisher.BOOKING_CANCELLED);
        });
    }

    private void rescheduleCalendarSession(
            DemoBooking booking,
            LocalDateTime start,
            LocalDateTime end,
            String description) {
        if (booking.getSessionBookingId() == null) return;
        Long companyId = booking.getHostUser().getCompany().getId();
        sessionBookings.findByIdAndCompanyId(booking.getSessionBookingId(), companyId).ifPresent(session -> {
            session.setStartTime(start);
            session.setEndTime(end);
            session.setNotes(clean(description, 1000));
            session.setMeetingLink(clean(booking.getMeetingJoinUrl(), 500));
            session.setMeetingProvider(sessionMeetingProvider(booking.getMeetingProvider()));
            session.setMeetingProvisioningStatus("READY");
            session.setBookingStatus(SessionBookingStatus.RESERVED);
            sessionBookings.save(session);
            bookingRealtime.publishBookingUpdated(
                    companyId, session.getId(), session.getStartTime(), session.getEndTime(),
                    BookingChangePublisher.BOOKING_RESCHEDULED);
        });
    }

    private static NameParts splitGuestName(String raw) {
        String value = clean(raw, 200);
        if (value.isBlank()) return new NameParts("Guest", "");
        String[] parts = value.split("\\s+");
        if (parts.length == 1) return new NameParts(parts[0], "");
        String firstName = parts[0];
        String lastName = String.join(" ", java.util.Arrays.copyOfRange(parts, 1, parts.length));
        return new NameParts(firstName, lastName);
    }

    private static String sessionMeetingProvider(String raw) {
        return "ZOOM".equalsIgnoreCase(raw) ? "zoom" : "google";
    }

    private MeetingProvision createMeeting(DemoBookingProfile profile, User host, LocalDateTime start, LocalDateTime end, ZoneId zone, String topic, String guestEmail, String description) {
        if ("ZOOM".equals(normalizeProvider(profile.getMeetingProvider()))) {
            ZoomService.MeetingDetails meeting = zoom.createMeetingDetails(host.getId(), start, end, zone, topic);
            return new MeetingProvision(meeting.externalId(), meeting.joinUrl());
        }
        GoogleMeetService.MeetingDetails meeting = googleMeet.createMeeting(host.getId(), start, end, zone, topic, guestEmail, description);
        return new MeetingProvision(meeting.externalId(), meeting.joinUrl());
    }

    private void updateExternalMeeting(DemoBooking booking, LocalDateTime start, LocalDateTime end, ZoneId zone, String topic, String description) {
        if ("ZOOM".equals(normalizeProvider(booking.getMeetingProvider()))) {
            zoom.updateMeeting(booking.getHostUser().getId(), booking.getExternalMeetingId(), start, end, zone, topic);
        } else {
            GoogleMeetService.MeetingDetails meeting = googleMeet.updateMeeting(
                    booking.getHostUser().getId(),
                    booking.getExternalMeetingId(),
                    booking.getMeetingJoinUrl(),
                    start,
                    end,
                    zone,
                    topic,
                    booking.getGuestEmail(),
                    description);
            booking.setExternalMeetingId(meeting.externalId());
            booking.setMeetingJoinUrl(meeting.joinUrl());
        }
    }

    private void cancelExternalMeeting(DemoBooking booking) {
        if ("ZOOM".equals(normalizeProvider(booking.getMeetingProvider()))) {
            zoom.deleteMeeting(booking.getHostUser().getId(), booking.getExternalMeetingId());
        } else {
            googleMeet.deleteMeeting(booking.getHostUser().getId(), booking.getExternalMeetingId());
        }
    }

    private DemoBookingProfile requireEnabledProfile() {
        DemoBookingProfile profile = profiles.findFirstBySlug(DEFAULT_SLUG)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Demo booking is not configured."));
        if (!profile.isEnabled() || profile.getHostUser() == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Demo booking is currently unavailable.");
        return profile;
    }

    private DemoBookingProfile lockEnabledProfile() {
        DemoBookingProfile profile = profiles.findBySlugForUpdate(DEFAULT_SLUG)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Demo booking is not configured."));
        if (!profile.isEnabled() || profile.getHostUser() == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Demo booking is currently unavailable.");
        return profile;
    }

    private User requireHost(DemoBookingProfile profile) {
        User host = profile.getHostUser();
        if (host == null || !host.isActive()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Demo host is unavailable.");
        if (!host.isConsultant()) {
            host.setConsultant(true);
            host = users.save(host);
        }
        return host;
    }

    private DemoBookingHold requireValidHold(String token, DemoBookingProfile profile) {
        String normalized = cleanRequired(token, 100, "A valid slot hold is required.");
        DemoBookingHold hold = holds.findByHoldToken(normalized).orElseThrow(() -> conflict("The selected slot hold has expired."));
        if (!hold.getProfile().getId().equals(profile.getId()) || !hold.getExpiresAt().isAfter(Instant.now())) {
            holds.delete(hold);
            throw conflict("The selected slot hold has expired.");
        }
        return hold;
    }

    private DemoBooking requireBooking(String token) {
        return bookings.findByManageToken(cleanRequired(token, 100, "Invalid booking token."))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking was not found."));
    }

    private BookingView toView(DemoBooking booking) {
        return new BookingView(
                booking.getId(), booking.getStatus(), booking.getProfile().getTitle(),
                booking.getStartAt().toString(), booking.getEndAt().toString(),
                (int) Duration.between(booking.getStartAt(), booking.getEndAt()).toMinutes(),
                booking.getProfile().getTimeZone(), booking.getGuestTimeZone(), booking.getGuestName(), booking.getGuestEmail(),
                booking.getGuestPhone(), booking.getCompanyName(), booking.getGuestNote(), booking.getMeetingProvider(),
                booking.getMeetingJoinUrl(), booking.getManageToken(),
                "CONFIRMED".equals(booking.getStatus()) && booking.getStartAt().isAfter(Instant.now()));
    }

    private AdminProfileView toAdminProfile(DemoBookingProfile profile) {
        User host = profile.getHostUser();
        return new AdminProfileView(
                profile.getId(), profile.isEnabled(), profile.getSlug(), profile.getTitle(), profile.getDurationMinutes(),
                profile.getSlotStepMinutes(), profile.getBufferBeforeMinutes(), profile.getBufferAfterMinutes(),
                profile.getMinimumNoticeMinutes(), profile.getBookingHorizonDays(), profile.getMaximumBookingsPerDay(),
                profile.getTimeZone(), profile.getMeetingProvider(), host == null ? null : host.getId(),
                host == null ? "" : fullName(host), host == null ? "" : host.getEmail(), parseAvailability(profile),
                host != null && googleMeet.hasValidToken(host.getId()), host != null && zoom.hasValidToken(host.getId()));
    }

    private AdminBookingView toAdminView(DemoBooking booking) {
        return new AdminBookingView(
                booking.getId(), booking.getStatus(), booking.getStartAt().toString(), booking.getEndAt().toString(),
                booking.getGuestName(), booking.getGuestEmail(), booking.getGuestPhone(), booking.getCompanyName(),
                booking.getGuestNote(), booking.getMeetingProvider(), booking.getMeetingJoinUrl(), fullName(booking.getHostUser()),
                booking.getGuestTimeZone(), booking.getCreatedAt() == null ? "" : booking.getCreatedAt().toString());
    }

    private List<AvailabilityWindow> windowsFor(DemoBookingProfile profile, DayOfWeek day) {
        return parseAvailability(profile).stream().filter(window -> day.name().equalsIgnoreCase(window.dayOfWeek())).toList();
    }

    private List<AvailabilityWindow> parseAvailability(DemoBookingProfile profile) {
        try {
            List<AvailabilityWindow> value = objectMapper.readValue(profile.getAvailabilityJson(), new TypeReference<>() {});
            return normalizeAvailability(value);
        } catch (Exception ignored) {
            return defaultAvailability();
        }
    }

    private static List<AvailabilityWindow> normalizeAvailability(List<AvailabilityWindow> raw) {
        Map<String, AvailabilityWindow> supplied = new LinkedHashMap<>();
        if (raw != null) {
            for (AvailabilityWindow row : raw) {
                if (row == null) continue;
                String day;
                try { day = DayOfWeek.valueOf(String.valueOf(row.dayOfWeek()).toUpperCase(Locale.ROOT)).name(); }
                catch (Exception ignored) { continue; }
                LocalTime start = parseTime(row.start(), LocalTime.of(9, 0));
                LocalTime end = parseTime(row.end(), LocalTime.of(17, 0));
                if (!end.isAfter(start)) continue;
                supplied.put(day, new AvailabilityWindow(day, row.enabled(), start.toString().substring(0, 5), end.toString().substring(0, 5)));
            }
        }
        List<AvailabilityWindow> defaults = defaultAvailability();
        List<AvailabilityWindow> out = new ArrayList<>();
        for (AvailabilityWindow fallback : defaults) {
            out.add(supplied.getOrDefault(fallback.dayOfWeek(), fallback));
        }
        return out;
    }

    private static List<AvailabilityWindow> defaultAvailability() {
        return List.of(
                new AvailabilityWindow("MONDAY", true, "09:00", "17:00"),
                new AvailabilityWindow("TUESDAY", true, "09:00", "17:00"),
                new AvailabilityWindow("WEDNESDAY", true, "09:00", "17:00"),
                new AvailabilityWindow("THURSDAY", true, "09:00", "17:00"),
                new AvailabilityWindow("FRIDAY", true, "09:00", "17:00"),
                new AvailabilityWindow("SATURDAY", false, "09:00", "13:00"),
                new AvailabilityWindow("SUNDAY", false, "09:00", "13:00"));
    }

    private static void validateGuest(ConfirmRequest request) {
        if (request == null) throw badRequest("Missing booking details.");
        cleanRequired(request.guestName(), 200, "Name is required.");
        cleanEmail(request.guestEmail());
        cleanRequired(request.companyName(), 240, "Company name is required.");
    }

    private static String meetingDescription(String name, String email, String phone, String company, String note) {
        return "Rezervacija prek calendra.si\nIme: " + clean(name, 200) + "\nE-pošta: " + clean(email, 320)
                + "\nTelefon: " + clean(phone, 80) + "\nPodjetje: " + clean(company, 240)
                + "\nVprašanje: " + clean(note, 2000);
    }

    private static Instant parseInstant(String raw) {
        String value = cleanRequired(raw, 100, "Start time is required.");
        try { return Instant.parse(value); }
        catch (Exception ignored) {
            try { return OffsetDateTime.parse(value).toInstant(); }
            catch (Exception ex) { throw badRequest("Invalid start time."); }
        }
    }

    private static LocalTime parseTime(String raw, LocalTime fallback) {
        try { return LocalTime.parse(raw); }
        catch (Exception ignored) { return fallback; }
    }

    private static ZoneId safeZone(String raw, ZoneId fallback) {
        try { return raw == null || raw.isBlank() ? fallback : ZoneId.of(raw); }
        catch (Exception ignored) { return fallback; }
    }

    private static String normalizeProvider(String raw) {
        return "ZOOM".equalsIgnoreCase(raw) ? "ZOOM" : "GOOGLE_MEET";
    }

    private static String normalizeLocale(String raw) { return "en".equalsIgnoreCase(raw) ? "en" : "sl"; }

    private static String cleanEmail(String raw) {
        String email = cleanRequired(raw, 320, "Email is required.").toLowerCase(Locale.ROOT);
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) throw badRequest("Enter a valid email address.");
        return email;
    }

    private static String cleanRequired(String raw, int max, String message) {
        String value = clean(raw, max);
        if (value.isBlank()) throw badRequest(message);
        return value;
    }

    private static String clean(String raw, int max) {
        String value = raw == null ? "" : raw.replaceAll("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "").trim();
        return value.length() <= max ? value : value.substring(0, max);
    }

    private static int clamp(Integer value, int min, int max, int fallback) {
        int effective = value == null ? fallback : value;
        return Math.max(min, Math.min(max, effective));
    }

    private static String token() { return UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", ""); }
    private static String fullName(User user) { return ((user.getFirstName() == null ? "" : user.getFirstName()) + " " + (user.getLastName() == null ? "" : user.getLastName())).trim(); }
    private static ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private record NameParts(String firstName, String lastName) {}
    private record MeetingProvision(String externalId, String joinUrl) {}
}
