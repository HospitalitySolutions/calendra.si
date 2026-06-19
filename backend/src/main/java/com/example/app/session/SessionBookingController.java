package com.example.app.session;

import com.example.app.common.TimeService;
import com.example.app.company.CompanyRepository;
import com.example.app.consumables.ConsumableService;
import com.example.app.billing.Bill;
import com.example.app.billing.BillItem;
import com.example.app.billing.BillPaymentStatus;
import com.example.app.billing.BillPaymentSplitSupport;
import com.example.app.billing.BillRepository;
import com.example.app.billing.BillType;
import com.example.app.billing.OpenBill;
import com.example.app.billing.OpenBillSyncService;
import com.example.app.billing.OpenBillRepository;
import com.example.app.guest.model.GuestEntitlementUsage;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.reminder.ReminderService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.security.SecurityUtils;
import com.example.app.user.Role;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/bookings")
public class SessionBookingController {
    private static final long DEFAULT_BOOKING_LIST_PAST_DAYS = 30;
    private static final long DEFAULT_BOOKING_LIST_FUTURE_DAYS = 62;
    private static final long MAX_BOOKING_QUERY_DAYS = 93;

    private final SessionBookingRepository repo;
    private final BookableSlotRepository bookableSlots;
    private final PersonalCalendarBlockRepository personalBlocks;
    private final CalendarTodoRepository calendarTodos;
    private final CompanyRepository companies;
    private final SessionBookingCreationService bookingCreationService;
    private final ReminderService reminderService;
    private final SessionBookingRealtimeService bookingRealtimeService;
    private final BookingChangePublisher bookingChangePublisher;
    private final OpenBillSyncService openBillSyncService;
    private final OpenBillRepository openBills;
    private final BillRepository bills;
    private final GuestEntitlementUsageRepository entitlementUsages;
    private final ConsumableService consumableService;
    private final AppSettingRepository settings;
    private final TimeService timeService;

    public SessionBookingController(SessionBookingRepository repo,
                                    BookableSlotRepository bookableSlots,
                                    PersonalCalendarBlockRepository personalBlocks, CalendarTodoRepository calendarTodos,
                                    CompanyRepository companies,
                                    SessionBookingCreationService bookingCreationService,
                                    ReminderService reminderService,
                                    SessionBookingRealtimeService bookingRealtimeService,
                                    BookingChangePublisher bookingChangePublisher,
                                    OpenBillSyncService openBillSyncService,
                                    OpenBillRepository openBills,
                                    BillRepository bills,
                                    GuestEntitlementUsageRepository entitlementUsages,
                                    ConsumableService consumableService,
                                    AppSettingRepository settings,
                                    TimeService timeService) {
        this.repo = repo;
        this.bookableSlots = bookableSlots;
        this.personalBlocks = personalBlocks;
        this.calendarTodos = calendarTodos;
        this.companies = companies;
        this.bookingCreationService = bookingCreationService;
        this.reminderService = reminderService;
        this.bookingRealtimeService = bookingRealtimeService;
        this.bookingChangePublisher = bookingChangePublisher;
        this.openBillSyncService = openBillSyncService;
        this.openBills = openBills;
        this.bills = bills;
        this.entitlementUsages = entitlementUsages;
        this.consumableService = consumableService;
        this.settings = settings;
        this.timeService = timeService;
    }

    public record BookingRequest(
            Long clientId,
            List<Long> clientIds,
            Long consultantId,
            String startTime,
            String endTime,
            Long spaceId,
            Long typeId,
            String notes,
            String meetingLink,
            Boolean online,
            String meetingProvider,
            Boolean allowPersonalBlockOverlap,
            Long groupId,
            /** When non-null, replaces session-only group email override (empty string clears). */
            String groupEmailOverride,
            /** When non-null: &gt;0 = company id, &lt;=0 clears billing company override for this session. */
            Long groupBillingCompanyIdOverride,
            String bookingStatus,
            /** Optional per-client payer overrides for this booking. Null leaves existing values unchanged on update. */
            List<BookingPayeeRequest> payees
    ) {}

    public record BookingPayeeRequest(
            Long clientId,
            String payeeType,
            Long companyId,
            Boolean customData,
            String firstName,
            String lastName,
            String email,
            String companyName,
            String address,
            String city,
            String postalCode,
            String vatId,
            String companyEmail
    ) {}

    public record UserSummary(Long id, String firstName, String lastName, String email, Role role) {}
    public record ClientSummary(Long id, String firstName, String lastName, String email, String phone) {}
    public record SpaceSummary(Long id, String name) {}
    public record TypeSummary(Long id, String name, Integer durationMinutes, Integer breakMinutes, Integer maxParticipantsPerSession, SessionPriceCalculationMode priceCalculationMode) {}
    public record GroupBillingCompanySummary(Long id, String name) {}
    public record BookingPayeeResponse(
            Long clientId,
            String payeeType,
            GroupBillingCompanySummary company,
            Boolean customData,
            String firstName,
            String lastName,
            String email,
            String companyName,
            String address,
            String city,
            String postalCode,
            String vatId,
            String companyEmail
    ) {}

    public record BookingPaymentAllocationResponse(
            String source,
            Long billId,
            String billNumber,
            String paymentMethod,
            String paymentMethodType,
            String paymentStatus,
            BigDecimal amountGross,
            OffsetDateTime paidAt,
            Long entitlementId,
            String entitlementCode,
            String entitlementType,
            String productName,
            Instant usedAt,
            String scanSource
    ) {}

    public record BookingPaymentStatusResponse(
            Long clientId,
            Long bookingId,
            String status,
            BigDecimal sessionTotalGross,
            BigDecimal paidGross,
            BigDecimal pendingGross,
            Long openBillId,
            List<BookingPaymentAllocationResponse> allocations
    ) {}

    public record BookingResponse(
            Long id,
            String bookingGroupKey,
            ClientSummary client,
            List<ClientSummary> clients,
            UserSummary consultant,
            LocalDateTime startTime,
            LocalDateTime endTime,
            SpaceSummary space,
            TypeSummary type,
            String notes,
            String meetingLink,
            String meetingProvider,
            Long groupId,
            String sessionGroupEmailOverride,
            GroupBillingCompanySummary sessionGroupBillingCompany,
            String bookingStatus,
            List<BookingPayeeResponse> payees,
            List<BookingPaymentStatusResponse> paymentStatuses
    ) {}
    public record BookableSlotResponse(
            Long id,
            java.time.DayOfWeek dayOfWeek,
            java.time.LocalTime startTime,
            java.time.LocalTime endTime,
            UserSummary consultant,
            boolean indefinite,
            java.time.LocalDate startDate,
            java.time.LocalDate endDate
    ) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<BookingResponse> list(
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @AuthenticationPrincipal User me
    ) {
        var companyId = me.getCompany().getId();
        DateRange range = resolveBookingListRange(from, to);
        var rows = loadBookingsForRange(me, companyId, range.rangeStart(), range.rangeEnd());
        return groupedBookingResponsesWithPayments(rows, companyId);
    }

    @PostMapping
    public BookingResponse create(@RequestBody BookingRequest req, @AuthenticationPrincipal User me) {
        return bookingCreationService.create(req, me);
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@AuthenticationPrincipal User me) {
        return bookingRealtimeService.subscribe(me.getCompany().getId());
    }

    @PutMapping("/{id}")
    public BookingResponse update(@PathVariable Long id, @RequestBody BookingRequest req, @AuthenticationPrincipal User me) {
        return bookingCreationService.update(id, req, me);
    }

    @PostMapping("/swap")
    @Transactional
    public List<BookingResponse> swap(@RequestBody SwapRequest req, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        companies.findByIdForUpdate(companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found"));
        var a = repo.findByIdAndCompanyId(req.firstId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var b = repo.findByIdAndCompanyId(req.secondId(), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var aGroup = loadGroupedRows(a, companyId);
        var bGroup = loadGroupedRows(b, companyId);
        var aRep = aGroup.get(0);
        var bRep = bGroup.get(0);
        if (aRep.getConsultant() == null || bRep.getConsultant() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot swap unassigned sessions.");
        }
        if (!SecurityUtils.isAdmin(me)
                && (!aRep.getConsultant().getId().equals(me.getId()) || !bRep.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        boolean spacesEnabled = bookingCreationService.isSpacesEnabled(companyId);
        boolean multipleSessionsPerSpaceEnabled = bookingCreationService.isMultipleSessionsPerSpaceEnabled(companyId);
        boolean multipleClientsPerSessionEnabled = bookingCreationService.isMultipleClientsPerSessionEnabled(companyId);
        var aStart = aRep.getStartTime();
        var aEnd = aRep.getEndTime();
        var bStart = bRep.getStartTime();
        var bEnd = bRep.getEndTime();
        for (var row : aGroup) {
            row.setStartTime(bStart);
            row.setEndTime(bEnd);
        }
        for (var row : bGroup) {
            row.setStartTime(aStart);
            row.setEndTime(aEnd);
        }
        var excludes = new ArrayList<Long>();
        aGroup.forEach(row -> excludes.add(row.getId()));
        bGroup.forEach(row -> excludes.add(row.getId()));
        boolean aOnline = aRep.getMeetingLink() != null && !aRep.getMeetingLink().isBlank();
        boolean bOnline = bRep.getMeetingLink() != null && !bRep.getMeetingLink().isBlank();
        bookingCreationService.validateBookingWindow(
                companyId,
                clientIdsOf(aGroup),
                aRep.getConsultant().getId(),
                aRep.getSpace() != null ? aRep.getSpace().getId() : null,
                aRep.getStartTime(),
                aRep.getEndTime(),
                aRep.getType() != null ? aRep.getType().getId() : null,
                excludes,
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                multipleClientsPerSessionEnabled,
                aOnline,
                false
        );
        bookingCreationService.validateBookingWindow(
                companyId,
                clientIdsOf(bGroup),
                bRep.getConsultant().getId(),
                bRep.getSpace() != null ? bRep.getSpace().getId() : null,
                bRep.getStartTime(),
                bRep.getEndTime(),
                bRep.getType() != null ? bRep.getType().getId() : null,
                excludes,
                spacesEnabled,
                multipleSessionsPerSpaceEnabled,
                multipleClientsPerSessionEnabled,
                bOnline,
                false
        );
        if (intervalsOverlap(aRep.getStartTime(), effectiveEnd(aRep), bRep.getStartTime(), effectiveEnd(bRep))) {
            boolean sameConsultant = aRep.getConsultant().getId().equals(bRep.getConsultant().getId());
            boolean sameClient = clientIdsOf(aGroup).stream().anyMatch(clientIdsOf(bGroup)::contains);
            Long spaceA = aRep.getSpace() != null ? aRep.getSpace().getId() : null;
            Long spaceB = bRep.getSpace() != null ? bRep.getSpace().getId() : null;
            boolean bothLive = !aOnline && !bOnline;
            boolean sameSpace = !multipleSessionsPerSpaceEnabled
                    && bothLive
                    && (Objects.equals(spaceA, spaceB) && spaceA != null
                    || bookingCreationService.shouldEnforceSpaceOverlapProtection(
                            companyId,
                            multipleSessionsPerSpaceEnabled,
                            false,
                            null
                    ));
            if (sameConsultant) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This consultant already has a session at that time.");
            }
            if (sameClient) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "One of the selected clients already has a session at that time.");
            }
            if (sameSpace) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This space is already booked at that time.");
            }
        }
        repo.saveAll(aGroup);
        repo.saveAll(bGroup);
        if (!aRep.getStartTime().equals(aStart) || !aRep.getEndTime().equals(aEnd)) {
            for (var row : aGroup) {
                reminderService.sendSessionRescheduled(row, aStart, aEnd);
            }
        }
        if (!bRep.getStartTime().equals(bStart) || !bRep.getEndTime().equals(bEnd)) {
            for (var row : bGroup) {
                reminderService.sendSessionRescheduled(row, bStart, bEnd);
            }
        }
        bookingChangePublisher.publish(
                companyId,
                aRep.getId(),
                aRep.getStartTime(),
                aRep.getEndTime(),
                BookingChangePublisher.BOOKING_SWAPPED
        );
        bookingChangePublisher.publish(
                companyId,
                bRep.getId(),
                bRep.getStartTime(),
                bRep.getEndTime(),
                BookingChangePublisher.BOOKING_SWAPPED
        );
        openBillSyncService.syncSessionGroup(companyId, groupKey(aRep));
        openBillSyncService.syncSessionGroup(companyId, groupKey(bRep));
        var dirtyGroups = new java.util.ArrayList<SessionBooking>();
        dirtyGroups.addAll(aGroup);
        dirtyGroups.addAll(bGroup);
        openBillSyncService.enqueueBookingsSync(companyId, dirtyGroups);
        return List.of(withPaymentStatuses(toGroupedResponse(aGroup), aGroup, companyId), withPaymentStatuses(toGroupedResponse(bGroup), bGroup, companyId));
    }

    public record SwapRequest(Long firstId, Long secondId) {}

    public record NoShowClientsRequest(List<Long> clientIds) {}

    @PostMapping("/{id}/no-show-clients")
    @Transactional
    public BookingResponse markClientsNoShow(
            @PathVariable Long id,
            @RequestBody NoShowClientsRequest req,
            @AuthenticationPrincipal User me
    ) {
        var companyId = me.getCompany().getId();
        var booking = repo.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var grouped = loadGroupedRows(booking, companyId);
        var representative = grouped.get(0);
        if (!SecurityUtils.isAdmin(me)
                && (representative.getConsultant() == null || !representative.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var selectedClientIds = new java.util.LinkedHashSet<Long>();
        if (req != null && req.clientIds() != null) {
            for (Long clientId : req.clientIds()) {
                if (clientId != null && clientId > 0) {
                    selectedClientIds.add(clientId);
                }
            }
        }
        if (selectedClientIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select at least one client.");
        }
        if (!isNoShowStatusEnabled(companyId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "NO SHOW status is disabled for this tenant.");
        }

        Map<Long, SessionBooking> rowsByClientId = new LinkedHashMap<>();
        for (SessionBooking row : grouped) {
            if (row.getClient() != null && row.getClient().getId() != null) {
                rowsByClientId.put(row.getClient().getId(), row);
            }
        }

        openBillSyncService.requireNoShowTransactionServiceConfigured(companyId);

        List<SessionBooking> updatedRows = new ArrayList<>();
        var now = timeService.localDateTime();
        for (Long clientId : selectedClientIds) {
            SessionBooking row = rowsByClientId.get(clientId);
            if (row == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected client is not part of this session.");
            }
            if (hasClosedInvoiceForSession(companyId, row.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This client already has a closed bill for this service and cannot be marked as NO SHOW.");
            }
            String currentStoredStatus = SessionBookingStatus.normalizeStored(row.getBookingStatus());
            String currentLifecycleStatus = SessionBookingStatus.deriveLifecycleStatus(
                    row.getStartTime(),
                    row.getEndTime(),
                    row.getBookingStatus(),
                    now
            );
            if (!SessionBookingStatus.NO_SHOW.equals(currentStoredStatus)
                    && !SessionBookingStatus.canTransition(currentLifecycleStatus, SessionBookingStatus.NO_SHOW)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected client cannot be marked as no-show from the current status.");
            }
            row.setBookingStatus(SessionBookingStatus.NO_SHOW);
            updatedRows.add(row);
        }

        repo.saveAll(updatedRows);
        repo.flush();
        for (SessionBooking row : updatedRows) {
            reminderService.recordStaffBookingModified(row);
        }
        openBillSyncService.syncSessionGroup(companyId, SessionBookingController.groupKey(representative));
        openBillSyncService.enqueueBookingsSync(companyId, updatedRows);
        bookingChangePublisher.publish(
                companyId,
                representative.getId(),
                representative.getStartTime(),
                representative.getEndTime(),
                BookingChangePublisher.BOOKING_UPDATED
        );

        var refreshed = repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey(representative), companyId);
        if (refreshed == null || refreshed.isEmpty()) {
            refreshed = grouped;
        }
        return withPaymentStatuses(toGroupedResponse(refreshed), refreshed, companyId);
    }


    private boolean isNoShowStatusEnabled(Long companyId) {
        if (companyId == null) return true;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.NO_SHOW_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> !"false".equalsIgnoreCase(value == null ? "" : value.trim()))
                .orElse(true);
    }

    private boolean hasClosedInvoiceForSession(Long companyId, Long sessionBookingId) {
        if (companyId == null || sessionBookingId == null) {
            return false;
        }
        return bills.findAllLinkedToSessionIds(companyId, Set.of(sessionBookingId)).stream()
                .filter(bill -> !BillType.ADVANCE.equals(bill.getBillType()))
                .filter(bill -> !BillPaymentStatus.CANCELLED.equals(bill.getPaymentStatus()))
                .anyMatch(bill -> linkedBillAmountForSession(bill, sessionBookingId) != null);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var booking = repo.findByIdAndCompanyId(id, companyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var grouped = loadGroupedRows(booking, companyId);
        var representative = grouped.get(0);
        if (!SecurityUtils.isAdmin(me)
                && (representative.getConsultant() == null || !representative.getConsultant().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (grouped.stream().anyMatch(row -> SessionBookingStatus.CHECKED_OUT.equals(SessionBookingStatus.normalizeStored(row.getBookingStatus())))) {
            consumableService.reverseSessionUsage(me, companyId, groupKey(representative));
        }
        for (var row : grouped) {
            reminderService.sendSessionCancelled(row);
        }
        for (var row : grouped) {
            bookingChangePublisher.publish(
                    companyId,
                    row.getId(),
                    row.getStartTime(),
                    row.getEndTime(),
                    BookingChangePublisher.BOOKING_DELETED
            );
        }
        bookingCreationService.restoreGuestCreditsForBookings(grouped);
        openBillSyncService.removeSessionRowsFromOpenBills(
                companyId,
                grouped.stream().map(SessionBooking::getId).filter(Objects::nonNull).toList()
        );
        repo.deleteAll(grouped);
        repo.flush();
    }

    public record PersonalBlockSummary(Long id, Long ownerId, LocalDateTime startTime, LocalDateTime endTime, String task, String notes) {}
    public record TodoSummary(Long id, Long ownerId, LocalDateTime startTime, String task, String notes) {}

    @GetMapping("/calendar")
    @Transactional(readOnly = true)
    public Map<String, Object> calendar(@RequestParam LocalDate from, @RequestParam LocalDate to, @AuthenticationPrincipal User me) {
        var result = new HashMap<String, Object>();
        var companyId = me.getCompany().getId();
        DateRange range = resolveRequiredDateRange(from, to);
        var rangeStart = range.rangeStart();
        var rangeEnd = range.rangeEnd();
        var bookingRows = loadBookingsForRange(me, companyId, rangeStart, rangeEnd);
        var bookings = groupedBookingResponsesWithPayments(bookingRows, companyId);
        var slots = (SecurityUtils.isAdmin(me)
                ? bookableSlots.findVisibleByCompanyAndDateRange(companyId, range.from(), range.to())
                : bookableSlots.findVisibleByConsultantAndCompanyAndDateRange(me.getId(), companyId, range.from(), range.to()))
                .stream()
                .map(SessionBookingController::toResponse)
                .toList();
        var overlappingPersonalRows = SecurityUtils.isAdmin(me)
                ? personalBlocks.findOverlappingByCompany(companyId, rangeStart, rangeEnd)
                : personalBlocks.findOverlapping(me.getId(), companyId, rangeStart, rangeEnd);
        var recurringAvailabilityRows = SecurityUtils.isAdmin(me)
                ? personalBlocks.findAvailabilityBlockMarkersByCompany(companyId)
                : personalBlocks.findAvailabilityBlockMarkersForOwner(me.getId(), companyId);
        List<PersonalBlockSummary> personal = new ArrayList<>();
        for (var block : overlappingPersonalRows) {
            if (AvailabilityBlockMetadata.isRecurringAvailabilityBlock(block)) {
                continue;
            }
            personal.add(new PersonalBlockSummary(block.getId(), block.getOwner().getId(), block.getStartTime(), block.getEndTime(), block.getTask(), block.getNotes()));
        }
        for (var block : recurringAvailabilityRows) {
            if (!AvailabilityBlockMetadata.isRecurringAvailabilityBlock(block)) {
                continue;
            }
            for (var occurrence : AvailabilityBlockMetadata.expand(block, from, to)) {
                personal.add(new PersonalBlockSummary(block.getId(), block.getOwner().getId(), occurrence.startTime(), occurrence.endTime(), block.getTask(), block.getNotes()));
            }
        }
        personal.sort((a, b) -> a.startTime().compareTo(b.startTime()));
        var todos = (SecurityUtils.isAdmin(me)
                ? calendarTodos.findByCompanyAndDateRange(companyId, rangeStart, rangeEnd)
                : calendarTodos.findByOwnerAndDateRange(me.getId(), companyId, rangeStart, rangeEnd)).stream()
                .map(t -> new TodoSummary(t.getId(), t.getOwner().getId(), t.getStartTime(), t.getTask(), t.getNotes()))
                .toList();
        result.put("booked", bookings);
        result.put("bookable", slots);
        result.put("personal", personal);
        result.put("todos", todos);
        return result;
    }

    private List<SessionBooking> loadBookingsForRange(User me, Long companyId, LocalDateTime rangeStart, LocalDateTime rangeEnd) {
        return SecurityUtils.isAdmin(me)
                ? repo.findOverlappingDateRangeByCompanyId(companyId, rangeStart, rangeEnd)
                : repo.findOverlappingDateRangeByConsultantIdAndCompanyId(me.getId(), companyId, rangeStart, rangeEnd);
    }

    private DateRange resolveBookingListRange(LocalDate from, LocalDate to) {
        LocalDate today = timeService.localDate();
        LocalDate resolvedFrom = from == null ? today.minusDays(DEFAULT_BOOKING_LIST_PAST_DAYS) : from;
        LocalDate resolvedTo = to == null ? today.plusDays(DEFAULT_BOOKING_LIST_FUTURE_DAYS) : to;
        return validateDateRange(resolvedFrom, resolvedTo);
    }

    private DateRange resolveRequiredDateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Both from and to dates are required.");
        }
        return validateDateRange(from, to);
    }

    private DateRange validateDateRange(LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The to date must be on or after the from date.");
        }
        long days = ChronoUnit.DAYS.between(from, to) + 1;
        if (days > MAX_BOOKING_QUERY_DAYS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The requested booking date range is too large.");
        }
        return new DateRange(from, to, from.atStartOfDay(), to.plusDays(1).atStartOfDay());
    }

    private record DateRange(LocalDate from, LocalDate to, LocalDateTime rangeStart, LocalDateTime rangeEnd) {}

    static BookingResponse toResponse(SessionBooking b) {
        return toGroupedResponse(List.of(b));
    }

    static List<BookingResponse> groupedBookingResponses(List<SessionBooking> rows) {
        Map<String, List<SessionBooking>> grouped = new LinkedHashMap<>();
        rows.stream()
                .sorted((a, b) -> {
                    int byStart = a.getStartTime().compareTo(b.getStartTime());
                    if (byStart != 0) return byStart;
                    return a.getId().compareTo(b.getId());
                })
                .forEach(row -> grouped.computeIfAbsent(groupKey(row), ignored -> new ArrayList<>()).add(row));
        return grouped.values().stream().map(SessionBookingController::toGroupedResponse).toList();
    }


    private List<BookingResponse> groupedBookingResponsesWithPayments(List<SessionBooking> rows, Long companyId) {
        Map<String, List<SessionBooking>> grouped = new LinkedHashMap<>();
        rows.stream()
                .sorted((a, b) -> {
                    int byStart = a.getStartTime().compareTo(b.getStartTime());
                    if (byStart != 0) return byStart;
                    return a.getId().compareTo(b.getId());
                })
                .forEach(row -> grouped.computeIfAbsent(groupKey(row), ignored -> new ArrayList<>()).add(row));
        PaymentStatusLookup lookup = buildPaymentStatusLookup(rows, companyId);
        return grouped.values().stream()
                .map(group -> withPaymentStatuses(toGroupedResponse(group), group, lookup))
                .toList();
    }

    private BookingResponse withPaymentStatuses(BookingResponse base, List<SessionBooking> rows, Long companyId) {
        return withPaymentStatuses(base, rows, buildPaymentStatusLookup(rows, companyId));
    }

    private BookingResponse withPaymentStatuses(BookingResponse base, List<SessionBooking> rows, PaymentStatusLookup lookup) {
        List<BookingPaymentStatusResponse> statuses = computePaymentStatuses(rows, lookup);
        return new BookingResponse(
                base.id(),
                base.bookingGroupKey(),
                base.client(),
                base.clients(),
                base.consultant(),
                base.startTime(),
                base.endTime(),
                base.space(),
                base.type(),
                base.notes(),
                base.meetingLink(),
                base.meetingProvider(),
                base.groupId(),
                base.sessionGroupEmailOverride(),
                base.sessionGroupBillingCompany(),
                base.bookingStatus(),
                base.payees(),
                statuses
        );
    }

    private List<BookingPaymentStatusResponse> computePaymentStatuses(List<SessionBooking> rows, Long companyId) {
        return computePaymentStatuses(rows, buildPaymentStatusLookup(rows, companyId));
    }

    private PaymentStatusLookup buildPaymentStatusLookup(List<SessionBooking> rows, Long companyId) {
        Set<Long> sessionIds = rows == null
                ? Set.of()
                : rows.stream()
                .filter(row -> row.getId() != null && row.getClient() != null)
                .map(SessionBooking::getId)
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
        if (sessionIds.isEmpty()) {
            return PaymentStatusLookup.empty();
        }

        List<Bill> linkedBills = bills.findAllLinkedToSessionIds(companyId, sessionIds);
        Map<Long, List<Bill>> linkedBillsBySessionId = linkedBillsBySessionId(linkedBills, sessionIds);
        Map<Long, Long> openBillIdBySessionId = openBills.findAllContainingSessionIds(companyId, sessionIds).stream()
                .flatMap(openBill -> openBillSessionIds(openBill).stream()
                        .map(sessionId -> Map.entry(sessionId, openBill.getId())))
                .filter(entry -> sessionIds.contains(entry.getKey()))
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (left, right) -> left, LinkedHashMap::new));
        Map<Long, List<GuestEntitlementUsage>> usagesBySessionId = entitlementUsages.findAllBySessionBookingIdInOrderByUsedAtAsc(sessionIds).stream()
                .filter(usage -> usage.getSessionBooking() != null && usage.getSessionBooking().getId() != null)
                .collect(Collectors.groupingBy(usage -> usage.getSessionBooking().getId(), LinkedHashMap::new, Collectors.toList()));

        return new PaymentStatusLookup(linkedBillsBySessionId, openBillIdBySessionId, usagesBySessionId);
    }

    private List<BookingPaymentStatusResponse> computePaymentStatuses(List<SessionBooking> rows, PaymentStatusLookup lookup) {
        var participantRows = rows == null ? List.<SessionBooking>of() : rows.stream()
                .filter(row -> row.getId() != null && row.getClient() != null)
                .toList();
        if (participantRows.isEmpty()) {
            return List.of();
        }

        List<BookingPaymentStatusResponse> result = new ArrayList<>();
        for (SessionBooking row : participantRows) {
            BigDecimal totalGross = sessionGross(row, rows).setScale(2, RoundingMode.HALF_UP);
            BigDecimal paidGross = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
            BigDecimal pendingGross = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
            boolean hasBankTransferInvoice = false;
            boolean entitlementCoversSession = false;
            List<BookingPaymentAllocationResponse> allocations = new ArrayList<>();

            for (Bill bill : lookup.linkedBillsBySessionId().getOrDefault(row.getId(), List.of())) {
                BigDecimal amountGross = linkedBillAmountForSession(bill, row.getId());
                if (amountGross == null) {
                    continue;
                }
                amountGross = amountGross.setScale(2, RoundingMode.HALF_UP);
                boolean advanceBill = BillType.ADVANCE.equals(bill.getBillType());
                allocations.add(new BookingPaymentAllocationResponse(
                        advanceBill ? "ADVANCE" : "INVOICE",
                        bill.getId(),
                        bill.getBillNumber(),
                        bill.getPaymentMethod() == null ? null : bill.getPaymentMethod().getName(),
                        bill.getPaymentMethod() == null || bill.getPaymentMethod().getPaymentType() == null ? null : bill.getPaymentMethod().getPaymentType().name(),
                        bill.getPaymentStatus(),
                        amountGross,
                        bill.getPaidAt(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                ));
                if (advanceBill || BillPaymentStatus.CANCELLED.equals(bill.getPaymentStatus())) {
                    // A deposit/advance belongs to the session history, but it must not satisfy
                    // the session service bill. The actual open bill will later add an advance
                    // offset line and close as the session invoice.
                    continue;
                }
                BigDecimal bankTransferDueTotal = BillPaymentSplitSupport.resolveBankTransferDueGross(bill);
                if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
                    paidGross = paidGross.add(amountGross);
                } else if (bankTransferDueTotal.compareTo(BigDecimal.ZERO) > 0
                        || BillPaymentStatus.PAYMENT_PENDING.equals(bill.getPaymentStatus())) {
                    hasBankTransferInvoice = true;
                    BigDecimal pendingForSession = bankTransferDueForSession(bill, row.getId(), amountGross, bankTransferDueTotal);
                    if (pendingForSession.compareTo(BigDecimal.ZERO) <= 0
                            && BillPaymentStatus.PAYMENT_PENDING.equals(bill.getPaymentStatus())
                            && amountGross.compareTo(BigDecimal.ZERO) > 0) {
                        pendingForSession = amountGross;
                    }
                    if (pendingForSession.compareTo(BigDecimal.ZERO) > 0) {
                        pendingGross = pendingGross.add(pendingForSession);
                    }
                    BigDecimal settledPortion = amountGross.subtract(pendingForSession).setScale(2, RoundingMode.HALF_UP);
                    if (settledPortion.compareTo(BigDecimal.ZERO) > 0) {
                        paidGross = paidGross.add(settledPortion);
                    }
                }
            }

            for (GuestEntitlementUsage usage : lookup.usagesBySessionId().getOrDefault(row.getId(), List.of())) {
                var entitlement = usage.getEntitlement();
                var product = entitlement == null ? null : entitlement.getProduct();
                entitlementCoversSession = true;
                allocations.add(new BookingPaymentAllocationResponse(
                        "ENTITLEMENT",
                        null,
                        null,
                        null,
                        null,
                        null,
                        totalGross,
                        null,
                        entitlement == null ? null : entitlement.getId(),
                        entitlement == null ? null : (entitlement.getDisplayCode() != null ? entitlement.getDisplayCode() : entitlement.getEntitlementCode()),
                        entitlement == null || entitlement.getEntitlementType() == null ? null : entitlement.getEntitlementType().name(),
                        product == null ? null : product.getName(),
                        usage.getUsedAt(),
                        usage.getScanSource()
                ));
            }
            if (entitlementCoversSession && totalGross.compareTo(BigDecimal.ZERO) > 0 && paidGross.compareTo(totalGross) < 0) {
                paidGross = totalGross;
            }
            if (paidGross.compareTo(BigDecimal.ZERO) < 0) {
                paidGross = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
            }

            String status;
            if (totalGross.compareTo(BigDecimal.ZERO) == 0 || entitlementCoversSession || paidGross.compareTo(totalGross) >= 0) {
                status = "PAID";
            } else if (hasBankTransferInvoice) {
                status = "PAYMENT_PENDING";
            } else if (paidGross.compareTo(BigDecimal.ZERO) > 0) {
                status = "PARTIALLY_PAID";
            } else {
                status = "UNPAID";
            }
            result.add(new BookingPaymentStatusResponse(
                    row.getClient().getId(),
                    row.getId(),
                    status,
                    totalGross,
                    paidGross.setScale(2, RoundingMode.HALF_UP),
                    pendingGross.setScale(2, RoundingMode.HALF_UP),
                    lookup.openBillIdBySessionId().get(row.getId()),
                    allocations
            ));
        }
        return result;
    }



    private record PaymentStatusLookup(
            Map<Long, List<Bill>> linkedBillsBySessionId,
            Map<Long, Long> openBillIdBySessionId,
            Map<Long, List<GuestEntitlementUsage>> usagesBySessionId
    ) {
        static PaymentStatusLookup empty() {
            return new PaymentStatusLookup(Map.of(), Map.of(), Map.of());
        }
    }

    private static Map<Long, List<Bill>> linkedBillsBySessionId(List<Bill> linkedBills, Set<Long> sessionIds) {
        if (linkedBills == null || linkedBills.isEmpty() || sessionIds == null || sessionIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, List<Bill>> result = new LinkedHashMap<>();
        for (Bill bill : linkedBills) {
            for (Long sessionId : linkedBillSessionIds(bill)) {
                if (sessionIds.contains(sessionId)) {
                    result.computeIfAbsent(sessionId, ignored -> new ArrayList<>()).add(bill);
                }
            }
        }
        return result;
    }

    private static Set<Long> linkedBillSessionIds(Bill bill) {
        if (bill == null) {
            return Set.of();
        }
        Set<Long> ids = new java.util.LinkedHashSet<>();
        if (bill.getSourceSessionIdSnapshot() != null) {
            ids.add(bill.getSourceSessionIdSnapshot());
        }
        if (bill.getItems() != null) {
            for (BillItem item : bill.getItems()) {
                if (item.getSourceSessionBookingId() != null && item.getSourceSessionBookingId() > 0) {
                    ids.add(item.getSourceSessionBookingId());
                }
            }
        }
        return ids;
    }

    private static Set<Long> openBillSessionIds(OpenBill openBill) {
        if (openBill == null) {
            return Set.of();
        }
        Set<Long> ids = new java.util.LinkedHashSet<>();
        if (openBill.getSessionBooking() != null && openBill.getSessionBooking().getId() != null) {
            ids.add(openBill.getSessionBooking().getId());
        }
        if (openBill.getItems() != null) {
            for (var item : openBill.getItems()) {
                if (item.getSourceSessionBookingId() != null && item.getSourceSessionBookingId() > 0) {
                    ids.add(item.getSourceSessionBookingId());
                }
            }
        }
        return ids;
    }

    private static BigDecimal linkedBillAmountForSession(Bill bill, Long sessionBookingId) {
        if (bill == null || sessionBookingId == null) {
            return null;
        }
        BigDecimal itemTotal = BigDecimal.ZERO;
        boolean foundLinkedItem = false;
        if (bill.getItems() != null) {
            for (BillItem item : bill.getItems()) {
                if (Objects.equals(item.getSourceSessionBookingId(), sessionBookingId)) {
                    foundLinkedItem = true;
                    itemTotal = itemTotal.add(item.getGrossPrice() == null ? BigDecimal.ZERO : item.getGrossPrice());
                }
            }
        }
        if (foundLinkedItem) {
            return itemTotal;
        }
        if (Objects.equals(bill.getSourceSessionIdSnapshot(), sessionBookingId)) {
            return bill.getTotalGross() == null ? BigDecimal.ZERO : bill.getTotalGross();
        }
        return null;
    }

    private static BigDecimal bankTransferDueForSession(Bill bill, Long sessionBookingId, BigDecimal linkedAmountGross, BigDecimal bankTransferDueTotal) {
        BigDecimal linkedAmount = linkedAmountGross == null ? BigDecimal.ZERO : linkedAmountGross.setScale(2, RoundingMode.HALF_UP);
        if (bankTransferDueTotal == null || bankTransferDueTotal.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        if (linkedAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal totalGross = bill == null || bill.getTotalGross() == null
                ? BigDecimal.ZERO
                : bill.getTotalGross().setScale(2, RoundingMode.HALF_UP);
        if (totalGross.compareTo(BigDecimal.ZERO) <= 0) {
            return linkedAmount.min(bankTransferDueTotal).setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal proportional = bankTransferDueTotal
                .multiply(linkedAmount)
                .divide(totalGross, 2, RoundingMode.HALF_UP);
        if (proportional.compareTo(linkedAmount) > 0) {
            proportional = linkedAmount;
        }
        if (proportional.compareTo(BigDecimal.ZERO) < 0) {
            proportional = BigDecimal.ZERO;
        }
        return proportional.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal sessionGross(SessionBooking row, List<SessionBooking> groupRows) {
        if (isTotalPriceCalculation(row) && !isPrimaryChargeRow(row, groupRows)) {
            return BigDecimal.ZERO;
        }
        return sessionGross(row);
    }

    private static BigDecimal sessionGross(SessionBooking row) {
        if (row == null || row.getType() == null || row.getType().getLinkedServices() == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal total = BigDecimal.ZERO;
        for (TypeTransactionService link : row.getType().getLinkedServices()) {
            if (link == null || link.getTransactionService() == null || link.getTransactionService().getTaxRate() == null) {
                continue;
            }
            BigDecimal net = link.getPrice() != null ? link.getPrice() : link.getTransactionService().getNetPrice();
            if (net == null) {
                net = BigDecimal.ZERO;
            }
            BigDecimal gross = net.add(net.multiply(link.getTransactionService().getTaxRate().multiplier)).setScale(2, RoundingMode.HALF_UP);
            total = total.add(gross);
        }
        return total;
    }

    private static boolean isTotalPriceCalculation(SessionBooking row) {
        return row != null
                && row.getType() != null
                && row.getType().getPriceCalculationMode() == SessionPriceCalculationMode.TOTAL;
    }

    private static boolean isPrimaryChargeRow(SessionBooking row, List<SessionBooking> groupRows) {
        if (row == null || row.getId() == null) return false;
        return groupRows.stream()
                .filter(candidate -> candidate.getClient() != null)
                .filter(candidate -> !SessionBookingStatus.CANCELLED.equals(SessionBookingStatus.normalizeStored(candidate.getBookingStatus())))
                .min((a, b) -> a.getId().compareTo(b.getId()))
                .map(primary -> Objects.equals(primary.getId(), row.getId()))
                .orElse(true);
    }

    static BookingResponse toGroupedResponse(List<SessionBooking> rows) {
        if (rows == null || rows.isEmpty()) {
            throw new IllegalArgumentException("rows are required");
        }
        var ordered = rows.stream().sorted((a, b) -> a.getId().compareTo(b.getId())).toList();
        var representative = ordered.get(0);
        var clientSummaries = ordered.stream()
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .collect(
                        LinkedHashMap<Long, ClientSummary>::new,
                        (map, client) -> map.putIfAbsent(client.getId(), new ClientSummary(
                                client.getId(),
                                client.getFirstName(),
                                client.getLastName(),
                                client.getEmail(),
                                client.getPhone()
                        )),
                        LinkedHashMap::putAll
                )
                .values()
                .stream()
                .toList();
        var client = clientSummaries.isEmpty() ? null : clientSummaries.get(0);
        var u = representative.getConsultant();
        UserSummary consultant = u == null ? null
                : new UserSummary(u.getId(), u.getFirstName(), u.getLastName(), u.getEmail(), u.getRole());
        var space = representative.getSpace() == null ? null : new SpaceSummary(representative.getSpace().getId(), representative.getSpace().getName());
        var type = representative.getType() == null ? null : new TypeSummary(
                representative.getType().getId(),
                representative.getType().getName(),
                representative.getType().getDurationMinutes(),
                representative.getType().getBreakMinutes(),
                representative.getType().getMaxParticipantsPerSession(),
                representative.getType().getPriceCalculationMode() != null
                        ? representative.getType().getPriceCalculationMode()
                        : SessionPriceCalculationMode.PER_CLIENT
        );
        String provider = representative.getMeetingProvider();
        if (provider == null && representative.getMeetingLink() != null && representative.getMeetingLink().contains("meet.google.com")) provider = "google";
        if (provider == null) provider = "zoom";
        var bcOv = representative.getSessionGroupBillingCompany();
        GroupBillingCompanySummary bcSumm =
                bcOv == null ? null : new GroupBillingCompanySummary(bcOv.getId(), bcOv.getName());
        var payeeSummaries = ordered.stream()
                .filter(row -> row.getClient() != null)
                .map(row -> {
                    String payeeType = normalizePayeeTypeForResponse(row.getPayeeType());
                    var payeeCompany = row.getPayeeCompany();
                    GroupBillingCompanySummary payeeCompanySummary = payeeCompany == null
                            ? null
                            : new GroupBillingCompanySummary(payeeCompany.getId(), payeeCompany.getName());
                    return new BookingPayeeResponse(
                            row.getClient().getId(),
                            payeeType,
                            payeeCompanySummary,
                            row.isPayeeCustomData(),
                            row.getPayeePersonFirstName(),
                            row.getPayeePersonLastName(),
                            row.getPayeePersonEmail(),
                            row.getPayeeCompanyName(),
                            row.getPayeeCompanyAddress(),
                            row.getPayeeCompanyCity(),
                            row.getPayeeCompanyPostalCode(),
                            row.getPayeeCompanyVatId(),
                            row.getPayeeCompanyEmail()
                    );
                })
                .toList();
        return new BookingResponse(
                representative.getId(),
                groupKey(representative),
                client,
                clientSummaries,
                consultant,
                representative.getStartTime(),
                representative.getEndTime(),
                space,
                type,
                representative.getNotes(),
                representative.getMeetingLink(),
                provider,
                representative.getClientGroup() != null ? representative.getClientGroup().getId() : null,
                representative.getSessionGroupEmailOverride(),
                bcSumm,
                SessionBookingStatus.normalizeStored(representative.getBookingStatus()),
                payeeSummaries,
                List.of()
        );
    }

    private static String normalizePayeeTypeForResponse(String value) {
        if (value != null && "COMPANY".equalsIgnoreCase(value.trim())) {
            return "COMPANY";
        }
        return "PERSON";
    }

    private static BookableSlotResponse toResponse(BookableSlot s) {
        var u = s.getConsultant();
        var consultant = new UserSummary(u.getId(), u.getFirstName(), u.getLastName(), u.getEmail(), u.getRole());
        return new BookableSlotResponse(
                s.getId(),
                s.getDayOfWeek(),
                s.getStartTime(),
                s.getEndTime(),
                consultant,
                s.isIndefinite(),
                s.getStartDate(),
                s.getEndDate()
        );
    }

    static String groupKey(SessionBooking booking) {
        if (booking.getBookingGroupKey() != null && !booking.getBookingGroupKey().isBlank()) {
            return booking.getBookingGroupKey();
        }
        return "legacy-" + booking.getId();
    }

    private List<SessionBooking> loadGroupedRows(SessionBooking booking, Long companyId) {
        var rows = repo.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKey(booking), companyId);
        if (rows == null || rows.isEmpty()) {
            return List.of(booking);
        }
        return rows;
    }

    private static List<Long> clientIdsOf(List<SessionBooking> rows) {
        return rows.stream()
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .map(client -> client.getId())
                .distinct()
                .toList();
    }

    private static boolean intervalsOverlap(LocalDateTime aStart, LocalDateTime aEnd, LocalDateTime bStart, LocalDateTime bEnd) {
        return aStart.isBefore(bEnd) && aEnd.isAfter(bStart);
    }

    private static LocalDateTime effectiveEnd(SessionBooking booking) {
        int breakMinutes = 0;
        if (booking.getType() != null && booking.getType().getBreakMinutes() != null) {
            breakMinutes = Math.max(0, booking.getType().getBreakMinutes());
        }
        return breakMinutes > 0 ? booking.getEndTime().plusMinutes(breakMinutes) : booking.getEndTime();
    }
}
