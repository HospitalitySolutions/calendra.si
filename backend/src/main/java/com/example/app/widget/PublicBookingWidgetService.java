package com.example.app.widget;

import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.common.SimulatedTimeContext;
import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.session.AvailabilityBlockMetadata;
import com.example.app.session.AvailabilityWindowGrid;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookingSource;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.PersonalCalendarBlockRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingController;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.settings.TenantFeatureAccessService;
import com.example.app.settings.TenantReservationRulesService;
import com.example.app.stripe.StripeConnectService;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.waitlist.WaitlistBookingHoldRepository;
import com.example.app.waitlist.WaitlistEmployeePreferenceType;
import com.example.app.waitlist.WaitlistService;
import com.example.app.waitlist.WaitlistServiceScope;
import com.example.app.waitlist.WaitlistSettingsService;
import com.example.app.waitlist.WaitlistSource;
import com.example.app.waitlist.WaitlistTargetType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicBookingWidgetService {
    private static final Logger LOG = LoggerFactory.getLogger(PublicBookingWidgetService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> ALL_ALLOWED_GUEST_PRODUCT_TYPES = List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP", "GIFT_CARD", "COURSE");

    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter DATE_TIME_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final DateTimeFormatter SLOT_LABEL_FORMAT = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter HUMAN_FORMAT = DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy 'at' HH:mm", Locale.ENGLISH);

    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final SessionTypeRepository types;
    private final BookableSlotRepository bookableSlots;
    private final PersonalCalendarBlockRepository personalBlocks;
    private final SessionBookingRepository bookings;
    private final UserRepository users;
    private final ClientRepository clients;
    private final SessionBookingCreationService bookingCreationService;
    private final ZoneId widgetZoneId;
    private final WidgetOriginValidator widgetOriginValidator;
    private final WidgetRateLimiter widgetRateLimiter;
    private final WidgetTurnstileService widgetTurnstileService;
    private final WidgetBookingIdempotencyService widgetBookingIdempotencyService;
    private final WidgetPublicAuditLogger widgetPublicAuditLogger;
    private final GuestSettingsService guestSettingsService;
    private final WebsiteWidgetSettingsService websiteWidgetSettingsService;
    private final WaitlistService waitlistService;
    private final WaitlistBookingHoldRepository waitlistHolds;
    private final WaitlistSettingsService waitlistSettingsService;
    private final TenantFeatureAccessService featureAccess;
    private final PaymentMethodRepository paymentMethods;
    private final StripeConnectService stripeConnectService;
    private final TimeService timeService;

    public PublicBookingWidgetService(
            CompanyRepository companies,
            AppSettingRepository settings,
            SessionTypeRepository types,
            BookableSlotRepository bookableSlots,
            PersonalCalendarBlockRepository personalBlocks,
            SessionBookingRepository bookings,
            UserRepository users,
            ClientRepository clients,
            SessionBookingCreationService bookingCreationService,
            WidgetOriginValidator widgetOriginValidator,
            WidgetRateLimiter widgetRateLimiter,
            WidgetTurnstileService widgetTurnstileService,
            WidgetBookingIdempotencyService widgetBookingIdempotencyService,
            WidgetPublicAuditLogger widgetPublicAuditLogger,
            GuestSettingsService guestSettingsService,
            WebsiteWidgetSettingsService websiteWidgetSettingsService,
            WaitlistService waitlistService,
            WaitlistBookingHoldRepository waitlistHolds,
            WaitlistSettingsService waitlistSettingsService,
            TenantFeatureAccessService featureAccess,
            PaymentMethodRepository paymentMethods,
            StripeConnectService stripeConnectService,
            TimeService timeService,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String widgetTimezoneId
    ) {
        this.companies = companies;
        this.settings = settings;
        this.types = types;
        this.bookableSlots = bookableSlots;
        this.personalBlocks = personalBlocks;
        this.bookings = bookings;
        this.users = users;
        this.clients = clients;
        this.bookingCreationService = bookingCreationService;
        this.widgetOriginValidator = widgetOriginValidator;
        this.widgetRateLimiter = widgetRateLimiter;
        this.widgetTurnstileService = widgetTurnstileService;
        this.widgetBookingIdempotencyService = widgetBookingIdempotencyService;
        this.widgetPublicAuditLogger = widgetPublicAuditLogger;
        this.guestSettingsService = guestSettingsService;
        this.websiteWidgetSettingsService = websiteWidgetSettingsService;
        this.waitlistService = waitlistService;
        this.waitlistHolds = waitlistHolds;
        this.waitlistSettingsService = waitlistSettingsService;
        this.featureAccess = featureAccess;
        this.paymentMethods = paymentMethods;
        this.stripeConnectService = stripeConnectService;
        this.timeService = timeService;
        this.widgetZoneId = (widgetTimezoneId == null || widgetTimezoneId.isBlank())
                ? ZoneId.of("Europe/Ljubljana")
                : ZoneId.of(widgetTimezoneId.trim());
    }

    public PublicBookingWidgetController.WidgetConfigResponse config(String tenantCode, HttpServletRequest request) {
        Company company = resolveCompany(tenantCode);
        guardPublicWidgetRequest(company, request, false, "config");
        var cfg = loadConfig(company.getId());
        var websiteSettings = websiteWidgetSettingsService.widgetSettings(company.getId());
        var bookingRules = websiteWidgetSettingsService.bookingRules(company.getId());
        var waitlistSettings = waitlistSettingsService.get(company.getId());
        var publicSettings = guestSettingsService.publicSettings(company.getId());
        var allowedPaymentMethods = resolveAllowedPaymentMethods(company);
        return new PublicBookingWidgetController.WidgetConfigResponse(
                company.getTenantCode(),
                cfg.companyName(),
                cfg.companyLogoUrl(),
                cfg.companyAddress(),
                cfg.availabilityEnabled(),
                cfg.typesEnabled(),
                cfg.sessionLengthMinutes(),
                cfg.workingHoursStart().toString(),
                cfg.workingHoursEnd().toString(),
                cfg.zoneId().getId(),
                widgetTurnstileService.isEnabled(company),
                widgetTurnstileService.siteKey(company),
                websiteSettings.employeeSelectionStep(),
                websiteSettings.paymentOnLocation(),
                bookingRules.requireOnlinePayment(),
                bookingRules.paymentRequirement(),
                bookingRules.depositPercent(),
                bookingRules.minBookingNoticeMinutes(),
                bookingRules.maxAdvanceBookingDays(),
                bookingRules.rescheduleUntilHours(),
                bookingRules.cancelUntilHours(),
                bookingRules.noShowMode(),
                bookingRules.noShowAfterMinutes(),
                featureAccess.isWaitlistEnabled(company.getId())
                        && waitlistSettings.enabled() && waitlistSettings.widgetEnabled(),
                waitlistSettings.exactTimeEnabled(),
                waitlistSettings.flexibleWindowsEnabled(),
                waitlistSettings.employeePreferenceEnabled(),
                waitlistSettings.maxRequestedDateRangeDays(),
                publicSettings.multipleServicesEnabled(),
                allowedPaymentMethods
        );
    }

    /**
     * Computes the widget's allowed payment methods for a single bookable session
     * ({@code SESSION_SINGLE}) from Configuration -> Website. Pay-on-location
     * is handled separately by the config response; online methods use tenant
     * payment-method rows that are enabled for either guest app or website so
     * the website tab can reuse the existing guest app payment setup.
     */
    private PublicBookingWidgetController.AllowedPaymentMethodsResponse resolveAllowedPaymentMethods(Company company) {
        List<String> accepted = websiteWidgetSettingsService.acceptedPaymentMethods(company.getId());
        List<PaymentMethod> methods = paymentMethods.findAllByCompanyIdOrderByNameAsc(company.getId());
        PaymentMethod cardMethod = methods.stream().filter(pm ->
                isExternallyEnabled(pm) && pm.getPaymentType() == PaymentType.CARD && pm.isStripeEnabled()).findFirst().orElse(null);
        PaymentMethod bankMethod = methods.stream().filter(pm ->
                isExternallyEnabled(pm) && pm.getPaymentType() == PaymentType.BANK_TRANSFER).findFirst().orElse(null);
        PaymentMethod paypalMethod = methods.stream().filter(pm ->
                isExternallyEnabled(pm) && pm.getPaymentType() == PaymentType.OTHER).findFirst().orElse(null);
        String productType = "SESSION_SINGLE";
        boolean stripeReady = stripeConnectService != null && stripeConnectService.isReadyForCompany(company);
        boolean card = stripeReady && accepted.contains("CARD") && cardMethod != null && allowedGuestProductTypes(cardMethod).contains(productType);
        boolean bankTransfer = accepted.contains("BANK_TRANSFER") && bankMethod != null && allowedGuestProductTypes(bankMethod).contains(productType);
        boolean paypal = accepted.contains("PAYPAL")
                && company.getPaypalMerchantId() != null
                && !company.getPaypalMerchantId().isBlank()
                && paypalMethod != null
                && allowedGuestProductTypes(paypalMethod).contains(productType);
        boolean giftCard = accepted.contains("GIFT_CARD");
        return new PublicBookingWidgetController.AllowedPaymentMethodsResponse(card, bankTransfer, paypal, giftCard);
    }

    private boolean isExternallyEnabled(PaymentMethod method) {
        return method != null && (method.isGuestEnabled() || method.isWidgetEnabled());
    }

    private List<String> allowedGuestProductTypes(PaymentMethod method) {
        return ALL_ALLOWED_GUEST_PRODUCT_TYPES;
    }

    public List<PublicBookingWidgetController.WidgetServiceResponse> services(String tenantCode, HttpServletRequest request) {
        Company company = resolveCompany(tenantCode);
        guardPublicWidgetRequest(company, request, false, "services");
        return types.findAllWithLinkedServicesByCompanyId(company.getId()).stream()
                .filter(this::isWebsiteBookingEnabled)
                .sorted(Comparator
                        .comparing((SessionType type) -> publicGroup(type) == null ? Integer.MAX_VALUE : publicGroup(type).getSortOrder())
                        .thenComparing(type -> publicGroup(type) == null ? "" : publicGroup(type).getName(), String.CASE_INSENSITIVE_ORDER)
                        .thenComparingInt(SessionType::getGuestSortOrder)
                        .thenComparing(SessionType::getName, String.CASE_INSENSITIVE_ORDER))
                .map(type -> {
                    var group = publicGroup(type);
                    BigDecimal grossPrice = sessionTypePriceGross(type);
                    return new PublicBookingWidgetController.WidgetServiceResponse(
                            type.getId(),
                            type.getName(),
                            type.getDescription(),
                            serviceDurationMinutes(type),
                            serviceBreakMinutes(type),
                            toPriceLabel(type),
                            grossPrice,
                            type.getMaxParticipantsPerSession(),
                            isWebsiteBookingEnabled(type),
                            group == null ? null : group.getId(),
                            group == null ? null : group.getName(),
                            group == null ? null : group.getSortOrder(),
                            type.getGuestSortOrder()
                    );
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PublicBookingWidgetController.WidgetConsultantResponse> consultants(
            String tenantCode,
            Long typeId,
            HttpServletRequest request
    ) {
        return consultants(tenantCode, typeId, List.of(), request);
    }

    @Transactional(readOnly = true)
    public List<PublicBookingWidgetController.WidgetConsultantResponse> consultants(
            String tenantCode,
            Long typeId,
            List<Long> serviceIds,
            HttpServletRequest request
    ) {
        Company company = resolveCompany(tenantCode);
        guardPublicWidgetRequest(company, request, false, "consultants");
        List<SessionType> chain = resolveServiceChain(company.getId(), typeId, serviceIds);
        var rules = websiteWidgetSettingsService.bookingRules(company.getId());
        if (!rules.employeeSelectionAllowed() || chainContainsGroupOnlyService(chain)) {
            return List.of();
        }
        return supportedConsultants(company.getId(), chain).stream()
                .map(consultant -> new PublicBookingWidgetController.WidgetConsultantResponse(
                        consultant.getId(),
                        consultantFullName(consultant)
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public PublicBookingWidgetController.AvailabilityResponse availability(
            String tenantCode,
            Long typeId,
            String dateText,
            Long consultantId,
            HttpServletRequest request
    ) {
        return availability(tenantCode, typeId, List.of(), dateText, consultantId, request);
    }

    @Transactional(readOnly = true)
    public PublicBookingWidgetController.AvailabilityResponse availability(
            String tenantCode,
            Long typeId,
            List<Long> serviceIds,
            String dateText,
            Long consultantId,
            HttpServletRequest request
    ) {
        Company company = resolveCompany(tenantCode);
        SimulatedTimeContext.set(company.getId());
        guardPublicWidgetRequest(company, request, false, "availability");
        WidgetConfig cfg = loadConfig(company.getId());
        var rules = websiteWidgetSettingsService.bookingRules(company.getId());
        LocalDate date = parseDate(dateText);
        List<SessionType> chain = resolveServiceChain(company.getId(), typeId, serviceIds);
        SessionType primaryType = chain.get(0);
        if (!dateAllowedByReservationRules(date, cfg, rules)) {
            return new PublicBookingWidgetController.AvailabilityResponse(
                    cfg.availabilityEnabled(),
                    DATE_FORMAT.format(date),
                    List.of(),
                    List.of()
            );
        }

        boolean groupOnlyWebsiteBooking = chain.size() == 1 && isGroupWebsiteBookingOnly(primaryType);
        if (chain.size() > 1 && chainContainsGroupOnlyService(chain)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group-session services cannot be combined with other services."
            );
        }

        Long requestedConsultantId = rules.employeeSelectionAllowed() ? consultantId : null;
        Long resolvedConsultantId = !groupOnlyWebsiteBooking && requestedConsultantId != null
                ? resolveConsultantForBooking(company.getId(), requestedConsultantId, false).getId()
                : null;
        if (resolvedConsultantId != null && !consultantSupportsChain(
                users.findByIdAndCompanyIdAndActiveTrue(resolvedConsultantId, company.getId())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant.")),
                chain
        )) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "The selected employee cannot perform every selected service."
            );
        }

        boolean needsAvailabilitySnapshot = !groupOnlyWebsiteBooking
                && (cfg.availabilityEnabled() || resolvedConsultantId != null);
        WidgetAvailabilitySnapshot availabilitySnapshot = needsAvailabilitySnapshot
                ? loadWidgetAvailabilitySnapshot(
                        company.getId(),
                        date.atStartOfDay(),
                        date.plusDays(1).atStartOfDay().plusMinutes(chainAvailabilityMinutes(chain)),
                        chain,
                        resolvedConsultantId
                )
                : WidgetAvailabilitySnapshot.empty();
        List<PublicBookingWidgetController.AvailabilitySlotResponse> slots;
        List<PublicBookingWidgetController.GroupSessionSlotResponse> groupSessions =
                groupOnlyWebsiteBooking
                        ? buildGroupSessions(company, cfg, primaryType, date, resolvedConsultantId)
                        : List.of();
        if (groupOnlyWebsiteBooking) {
            slots = List.of();
        } else if (cfg.availabilityEnabled()) {
            Map<String, PublicBookingWidgetController.AvailabilitySlotResponse> merged = new LinkedHashMap<>();
            for (PublicBookingWidgetController.AvailabilitySlotResponse slot :
                    buildBookableSlots(company, cfg, chain, date, resolvedConsultantId, availabilitySnapshot, rules)) {
                merged.put(widgetSlotMergeKey(slot, resolvedConsultantId), slot);
            }
            for (PublicBookingWidgetController.AvailabilitySlotResponse slot :
                    buildWorkingHoursSlots(company, cfg, chain, date, resolvedConsultantId, availabilitySnapshot, rules)) {
                merged.putIfAbsent(widgetSlotMergeKey(slot, resolvedConsultantId), slot);
            }
            slots = sortAvailabilitySlots(merged);
        } else {
            slots = buildFallbackSlots(company, cfg, chain, date, resolvedConsultantId, availabilitySnapshot, rules);
        }

        return new PublicBookingWidgetController.AvailabilityResponse(
                cfg.availabilityEnabled(),
                DATE_FORMAT.format(date),
                slots,
                groupSessions
        );
    }

    /**
     * Returns the set of dates within {@code monthText} (YYYY-MM) that have at least one bookable slot or group
     * session, so the calendar can mark only genuinely available days as selectable. Only today onward is evaluated.
     */
    @Transactional(readOnly = true)
    public PublicBookingWidgetController.AvailabilityMonthResponse availabilityMonth(
            String tenantCode,
            Long typeId,
            String monthText,
            Long consultantId,
            HttpServletRequest request
    ) {
        return availabilityMonth(tenantCode, typeId, List.of(), monthText, consultantId, request);
    }

    @Transactional(readOnly = true)
    public PublicBookingWidgetController.AvailabilityMonthResponse availabilityMonth(
            String tenantCode,
            Long typeId,
            List<Long> serviceIds,
            String monthText,
            Long consultantId,
            HttpServletRequest request
    ) {
        Company company = resolveCompany(tenantCode);
        SimulatedTimeContext.set(company.getId());
        guardPublicWidgetRequest(company, request, false, "availability-month");
        WidgetConfig cfg = loadConfig(company.getId());
        var rules = websiteWidgetSettingsService.bookingRules(company.getId());
        List<SessionType> chain = resolveServiceChain(company.getId(), typeId, serviceIds);
        SessionType primaryType = chain.get(0);
        YearMonth month = parseMonth(monthText);
        boolean groupOnlyWebsiteBooking = chain.size() == 1 && isGroupWebsiteBookingOnly(primaryType);
        if (chain.size() > 1 && chainContainsGroupOnlyService(chain)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group-session services cannot be combined with other services."
            );
        }

        Long requestedConsultantId = rules.employeeSelectionAllowed() ? consultantId : null;
        Long resolvedConsultantId = !groupOnlyWebsiteBooking && requestedConsultantId != null
                ? resolveConsultantForBooking(company.getId(), requestedConsultantId, false).getId()
                : null;

        LocalDate today = timeService.localDate(cfg.zoneId());
        LocalDate cursor = month.atDay(1);
        if (cursor.isBefore(today)) {
            cursor = today;
        }
        LocalDate monthEnd = month.atEndOfMonth();
        if (cursor.isAfter(monthEnd)) {
            return new PublicBookingWidgetController.AvailabilityMonthResponse(month.toString(), List.of());
        }

        List<String> availableDates = new ArrayList<>();
        WidgetAvailabilitySnapshot availabilitySnapshot = cfg.availabilityEnabled() && !groupOnlyWebsiteBooking
                ? loadWidgetAvailabilitySnapshot(
                        company.getId(),
                        cursor.atStartOfDay(),
                        monthEnd.plusDays(1).atStartOfDay().plusMinutes(chainAvailabilityMinutes(chain)),
                        chain,
                        resolvedConsultantId
                )
                : WidgetAvailabilitySnapshot.empty();
        try {
            for (LocalDate date = cursor; !date.isAfter(monthEnd); date = date.plusDays(1)) {
                if (dateAllowedByReservationRules(date, cfg, rules)
                        && dayHasAvailability(
                                company,
                                cfg,
                                chain,
                                date,
                                resolvedConsultantId,
                                groupOnlyWebsiteBooking,
                                rules,
                                availabilitySnapshot
                        )) {
                    availableDates.add(DATE_FORMAT.format(date));
                }
            }
        } catch (RuntimeException ex) {
            LOG.error(
                    "Widget month availability failed: tenantCode={}, companyId={}, typeId={}, serviceIds={}, consultantId={}, month={}",
                    tenantCode,
                    company.getId(),
                    typeId,
                    serviceIds,
                    resolvedConsultantId,
                    month,
                    ex
            );
            throw ex;
        }
        return new PublicBookingWidgetController.AvailabilityMonthResponse(month.toString(), availableDates);
    }

    private boolean dayHasAvailability(
            Company company,
            WidgetConfig cfg,
            List<SessionType> chain,
            LocalDate date,
            Long consultantId,
            boolean groupOnlyWebsiteBooking,
            GuestSettingsService.GuestBookingRules rules,
            WidgetAvailabilitySnapshot availabilitySnapshot
    ) {
        if (groupOnlyWebsiteBooking) {
            return !buildGroupSessions(company, cfg, chain.get(0), date, consultantId).isEmpty();
        }
        if (cfg.availabilityEnabled()) {
            if (hasAnyBookableSlot(company, cfg, chain, date, consultantId, rules, availabilitySnapshot)) {
                return true;
            }
            return hasAnyWorkingHoursSlot(company, cfg, chain, date, consultantId, rules, availabilitySnapshot);
        }
        return hasAnyFallbackSlot(company, cfg, chain, date, consultantId, rules);
    }

    /**
     * Month availability only needs to know whether one slot exists. Avoid building every slot for
     * every day because that can trigger hundreds of overlap queries and exhaust the request/DB pool.
     */
    private boolean hasAnyBookableSlot(
            Company company,
            WidgetConfig cfg,
            List<SessionType> chain,
            LocalDate date,
            Long consultantId,
            GuestSettingsService.GuestBookingRules rules,
            WidgetAvailabilitySnapshot availabilitySnapshot
    ) {
        int bookingMinutes = chainBookingMinutes(chain);
        int availabilityMinutes = chainAvailabilityMinutes(chain);
        List<BookableSlot> windows = bookableWindowsForDate(availabilitySnapshot, date);

        for (BookableSlot window : windows) {
            for (LocalDateTime start : AvailabilityWindowGrid.starts(
                    date, window.getStartTime(), window.getEndTime(), availabilityMinutes, 30)) {
                LocalDateTime end = start.plusMinutes(bookingMinutes);
                if (slotAllowedByReservationRules(start, cfg, rules)
                        && isActuallyBookable(company.getId(), window.getConsultant().getId(), start, end, chain, availabilitySnapshot)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean hasAnyWorkingHoursSlot(
            Company company,
            WidgetConfig cfg,
            List<SessionType> chain,
            LocalDate date,
            Long consultantId,
            GuestSettingsService.GuestBookingRules rules,
            WidgetAvailabilitySnapshot availabilitySnapshot
    ) {
        int bookingMinutes = chainBookingMinutes(chain);
        int availabilityMinutes = chainAvailabilityMinutes(chain);
        List<User> consultants = availabilitySnapshot.supportedConsultants();

        for (User consultant : consultants) {
            Optional<TimeWindow> dayWindow = resolveConsultantWorkingWindow(consultant, date);
            if (dayWindow.isEmpty()) {
                continue;
            }
            for (LocalDateTime start : AvailabilityWindowGrid.starts(
                    date, dayWindow.get().start(), dayWindow.get().end(), availabilityMinutes, 30)) {
                LocalDateTime end = start.plusMinutes(bookingMinutes);
                if (slotAllowedByReservationRules(start, cfg, rules)
                        && isActuallyBookable(company.getId(), consultant.getId(), start, end, chain, availabilitySnapshot)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean hasAnyFallbackSlot(
            Company company,
            WidgetConfig cfg,
            List<SessionType> chain,
            LocalDate date,
            Long consultantId,
            GuestSettingsService.GuestBookingRules rules
    ) {
        int availabilityMinutes = chainAvailabilityMinutes(chain);
        LocalTime rangeStart;
        LocalTime rangeEnd;
        if (consultantId != null) {
            User consultant = users.findByIdAndCompanyIdAndActiveTrue(consultantId, company.getId()).orElse(null);
            if (consultant == null || !consultantSupportsChain(consultant, chain)) {
                return false;
            }
            Optional<TimeWindow> window = resolveConsultantWorkingWindow(consultant, date);
            if (window.isEmpty()) {
                return false;
            }
            rangeStart = window.get().start();
            rangeEnd = window.get().end();
        } else {
            rangeStart = cfg.workingHoursStart();
            rangeEnd = cfg.workingHoursEnd();
        }

        for (LocalDateTime start : AvailabilityWindowGrid.starts(
                date, rangeStart, rangeEnd, availabilityMinutes, 30)) {
            if (slotAllowedByReservationRules(start, cfg, rules)) {
                return true;
            }
        }
        return false;
    }

    private YearMonth parseMonth(String monthText) {
        if (monthText == null || monthText.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "month is required (YYYY-MM).");
        }
        String value = monthText.trim();
        try {
            if (value.length() >= 10) {
                return YearMonth.from(parseDate(value));
            }
            return YearMonth.parse(value);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid month; use YYYY-MM.");
        }
    }

    @Transactional
    public PublicBookingWidgetController.BookingResponse createBooking(
            String tenantCode,
            PublicBookingWidgetController.BookingRequest request,
            String idempotencyKey,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        SimulatedTimeContext.set(company.getId());
        guardPublicWidgetRequest(company, httpRequest, true, "bookings");
        BookingSource bookingSource = WidgetBookingSourceResolver.resolve(httpRequest);
        widgetTurnstileService.verifyForPublicAction(
                company,
                request.turnstileToken(),
                widgetPublicAuditLogger.clientIp(httpRequest)
        );
        WidgetConfig cfg = loadConfig(company.getId());
        var rules = websiteWidgetSettingsService.bookingRules(company.getId());
        List<SessionType> chain = resolveServiceChain(company.getId(), request.typeId(), extractServiceIds(request));
        SessionType type = chain.get(0);
        List<Long> orderedServiceIds = chain.stream().map(SessionType::getId).toList();
        List<SessionBookingController.BookingServiceRequest> bookingServices = bookingServiceRequests(chain);

        try {
            if (request.groupSessionId() != null) {
                if (chain.size() != 1) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "A group session cannot be booked together with additional services."
                    );
                }
                PublicBookingWidgetController.BookingResponse response = widgetBookingIdempotencyService.execute(
                        company,
                        "group-booking",
                        idempotencyKey,
                        request,
                        PublicBookingWidgetController.BookingResponse.class,
                        () -> joinGroupSession(company, type, request, bookingSource)
                );
                widgetPublicAuditLogger.logAttempt(
                        company,
                        httpRequest,
                        "booking",
                        "success",
                        "typeId=" + type.getId() + ",serviceIds=" + orderedServiceIds
                                + ",groupSessionId=" + request.groupSessionId()
                );
                return response;
            }

            if (chainContainsGroupOnlyService(chain)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        chain.size() == 1
                                ? "Please select one of the listed group booking time slots for this service."
                                : "Group-session services cannot be combined with other services."
                );
            }

            LocalDate date = parseDate(request.date());
            LocalDateTime start = parseStartTime(request.startTime(), date);
            LocalDateTime end = start.plusMinutes(chainBookingMinutes(chain));

            if (!slotAllowedByReservationRules(start, cfg, rules)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Selected time is outside the allowed reservation window."
                );
            }

            User consultant = resolveConsultantForBooking(
                    company.getId(),
                    request.consultantId(),
                    cfg.availabilityEnabled()
            );
            if (consultant != null && !consultantSupportsChain(consultant, chain)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "The selected employee cannot perform every selected service."
                );
            }
            User actor = consultant != null ? consultant : resolveAdminActor(company.getId());

            if (consultant != null) {
                bookingCreationService.validateServiceChainWindow(
                        company.getId(),
                        List.<Long>of(),
                        consultant.getId(),
                        start,
                        bookingServices,
                        SessionBookingCreationService.bookingExcludeIds((Long) null)
                );
            }

            PublicBookingWidgetController.BookingResponse response = widgetBookingIdempotencyService.execute(
                    company,
                    "booking",
                    idempotencyKey,
                    request,
                    PublicBookingWidgetController.BookingResponse.class,
                    () -> {
                        lockTenantForClientMatch(company);
                        Client client = findOrCreateClient(company, actor, request);
                        SessionBooking booking = bookingCreationService.createChannelBooking(
                                new SessionBookingCreationService.ChannelBookingRequest(
                                        company.getId(),
                                        client.getId(),
                                        consultant != null ? consultant.getId() : null,
                                        start,
                                        end,
                                        null,
                                        type.getId(),
                                        null,
                                        null,
                                        false,
                                        null,
                                        false,
                                        "WEBSITE_WIDGET",
                                        null,
                                        null,
                                        "CONFIRMED",
                                        true,
                                        bookingSource,
                                        bookingServices
                                )
                        );
                        String consultantName = booking.getConsultant() == null
                                ? null
                                : consultantFullName(booking.getConsultant());
                        List<String> serviceNames = chain.stream().map(SessionType::getName).toList();
                        int totalDurationMinutes = Math.max(
                                1,
                                (int) ChronoUnit.MINUTES.between(booking.getStartTime(), booking.getEndTime())
                        );
                        return new PublicBookingWidgetController.BookingResponse(
                                booking.getId(),
                                serviceNames.get(0),
                                serviceNames,
                                totalDurationMinutes,
                                booking.getStartTime().format(DATE_TIME_FORMAT),
                                booking.getStartTime().format(HUMAN_FORMAT),
                                client.getEmail(),
                                consultantName
                        );
                    }
            );
            widgetPublicAuditLogger.logAttempt(
                    company,
                    httpRequest,
                    "booking",
                    "success",
                    "typeId=" + type.getId() + ",serviceIds=" + orderedServiceIds + ",groupSessionId=null"
            );
            return response;
        } catch (RuntimeException ex) {
            widgetPublicAuditLogger.logAttempt(company, httpRequest, "booking", "failed", ex.getMessage());
            throw ex;
        }
    }

    @Transactional
    public PublicBookingWidgetController.WaitlistResponse createWaitlistRequest(
            String tenantCode,
            PublicBookingWidgetController.WaitlistRequest request,
            String idempotencyKey,
            HttpServletRequest httpRequest
    ) {
        Company company = resolveCompany(tenantCode);
        SimulatedTimeContext.set(company.getId());
        guardPublicWidgetRequest(company, httpRequest, true, "waitlist");
        BookingSource bookingSource = WidgetBookingSourceResolver.resolve(httpRequest);
        featureAccess.assertWaitlistEnabled(company.getId());

        WaitlistSettingsService.WaitlistSettings waitlistCfg = waitlistSettingsService.get(company.getId());
        if (!waitlistCfg.enabled() || !waitlistCfg.widgetEnabled()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Website waitlist is disabled.");
        }
        if (request.flexible() && !waitlistCfg.flexibleWindowsEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Flexible waitlist requests are disabled.");
        }
        if (!request.flexible() && !waitlistCfg.exactTimeEnabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Exact-time waitlist requests are disabled.");
        }

        List<SessionType> chain = resolveServiceChain(company.getId(), request.typeId(), extractServiceIds(request));
        SessionType type = chain.get(0);
        if (chainContainsGroupOnlyService(chain)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Group-session services cannot be added to a multi-service waitlist request."
            );
        }
        List<Long> orderedServiceIds = chain.stream().map(SessionType::getId).toList();
        LocalDate dateFrom = parseDate(request.dateFrom());
        LocalDate requestedDateTo = parseDate(request.dateTo());
        LocalDate dateTo = request.flexible() ? requestedDateTo : dateFrom;
        LocalDate today = timeService.localDate(loadConfig(company.getId()).zoneId());
        if (dateFrom.isBefore(today)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dateFrom cannot be in the past.");
        }
        if (dateTo.isBefore(dateFrom)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dateTo must be on or after dateFrom.");
        }
        long requestedDays = ChronoUnit.DAYS.between(dateFrom, dateTo) + 1L;
        if (requestedDays > waitlistCfg.maxRequestedDateRangeDays()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The requested date range is too long.");
        }

        LocalTime timeFrom = parseWaitlistTime(request.timeFrom(), "timeFrom");
        LocalTime timeTo = parseWaitlistTime(request.timeTo(), "timeTo");
        if (!timeTo.isAfter(timeFrom)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "timeTo must be later than timeFrom.");
        }

        User preferredEmployee = null;
        if (request.consultantId() != null && waitlistCfg.employeePreferenceEnabled()) {
            preferredEmployee = supportedConsultants(company.getId(), chain).stream()
                    .filter(candidate -> Objects.equals(candidate.getId(), request.consultantId()))
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid employee preference."));
        }
        User clientOwner = preferredEmployee != null ? preferredEmployee : resolveAdminActor(company.getId());
        User finalPreferredEmployee = preferredEmployee;

        try {
            PublicBookingWidgetController.WaitlistResponse response = widgetBookingIdempotencyService.execute(
                    company,
                    "waitlist",
                    idempotencyKey,
                    request,
                    PublicBookingWidgetController.WaitlistResponse.class,
                    () -> {
                        lockTenantForClientMatch(company);
                        Client client = findOrCreateClient(
                                company,
                                clientOwner,
                                request.firstName(),
                                request.lastName(),
                                request.email(),
                                request.phone()
                        );

                        List<WaitlistService.WindowInput> requestWindows = buildPublicWaitlistWindows(
                                request.flexible(),
                                dateFrom,
                                timeFrom,
                                timeTo,
                                request.weekdays()
                        );
                        WaitlistService.RequestView created = waitlistService.createFromWidget(
                                company.getId(),
                                client,
                                new WaitlistService.RequestInput(
                                        client.getId(),
                                        type.getId(),
                                        WaitlistServiceScope.EXACT_SERVICE,
                                        null,
                                        null,
                                        request.flexible() ? WaitlistTargetType.FLEXIBLE_WINDOW : WaitlistTargetType.EXACT_TIME,
                                        null,
                                        dateFrom,
                                        dateTo,
                                        finalPreferredEmployee == null ? WaitlistEmployeePreferenceType.ANY : WaitlistEmployeePreferenceType.SPECIFIC,
                                        finalPreferredEmployee == null ? null : finalPreferredEmployee.getId(),
                                        List.of(),
                                        1,
                                        bookingSource == BookingSource.PUBLIC_BOOKING_PAGE
                                                ? WaitlistSource.PUBLIC_BOOKING_PAGE
                                                : WaitlistSource.WIDGET,
                                        request.notes(),
                                        requestWindows,
                                        orderedServiceIds
                                )
                        );
                        return new PublicBookingWidgetController.WaitlistResponse(
                                created.id(),
                                created.status(),
                                created.serviceName(),
                                created.dateFrom().toString(),
                                created.dateTo().toString(),
                                client.getEmail()
                        );
                    }
            );
            widgetPublicAuditLogger.logAttempt(
                    company,
                    httpRequest,
                    "waitlist",
                    "success",
                    "typeId=" + type.getId() + ",serviceIds=" + orderedServiceIds
            );
            return response;
        } catch (RuntimeException ex) {
            widgetPublicAuditLogger.logAttempt(company, httpRequest, "waitlist", "failed", ex.getMessage());
            throw ex;
        }
    }

    private List<WaitlistService.WindowInput> buildPublicWaitlistWindows(
            boolean flexible,
            LocalDate dateFrom,
            LocalTime timeFrom,
            LocalTime timeTo,
            List<String> weekdayNames
    ) {
        if (!flexible) {
            return List.of(new WaitlistService.WindowInput(null, dateFrom, timeFrom, timeTo, false));
        }
        List<DayOfWeek> weekdays = Optional.ofNullable(weekdayNames).orElse(List.of()).stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .map(value -> {
                    try {
                        return DayOfWeek.valueOf(value.toUpperCase(Locale.ROOT));
                    } catch (IllegalArgumentException ex) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid weekday preference.");
                    }
                })
                .distinct()
                .toList();
        if (weekdays.isEmpty()) {
            return List.of(new WaitlistService.WindowInput(null, null, timeFrom, timeTo, false));
        }
        return weekdays.stream()
                .map(day -> new WaitlistService.WindowInput(day, null, timeFrom, timeTo, false))
                .toList();
    }

    private LocalTime parseWaitlistTime(String value, String field) {
        try {
            return LocalTime.parse(value);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + field + ". Use HH:mm.");
        }
    }

    @Transactional
    protected PublicBookingWidgetController.BookingResponse joinGroupSession(
            Company company,
            SessionType type,
            PublicBookingWidgetController.BookingRequest request,
            BookingSource bookingSource
    ) {
        if (!isWebsiteBookingEnabled(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not enabled for website booking.");
        }

        SessionBooking representative = bookings.findByIdAndCompanyId(request.groupSessionId(), company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group session not found."));
        if (representative.getClientGroup() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected session is not a group session.");
        }
        if (representative.getType() == null || !Objects.equals(representative.getType().getId(), type.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session does not match this service.");
        }
        WidgetConfig cfg = loadConfig(company.getId());
        var rules = websiteWidgetSettingsService.bookingRules(company.getId());
        if (!slotAllowedByReservationRules(representative.getStartTime(), cfg, rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected group session is outside the allowed reservation window.");
        }

        User actor = representative.getConsultant() != null ? representative.getConsultant() : resolveAdminActor(company.getId());
        lockTenantForClientMatch(company);
        Client client = findOrCreateClient(company, actor, request);
        SessionBooking joined = bookingCreationService.joinClientToGroupSession(new SessionBookingCreationService.GroupJoinRequest(
                company.getId(),
                representative.getId(),
                client.getId(),
                "WEBSITE_WIDGET",
                null,
                null,
                "CONFIRMED",
                true,
                bookingSource
        ));

        String consultantName = joined.getConsultant() == null
                ? null
                : consultantFullName(joined.getConsultant());
        String serviceName = joined.getType() == null ? type.getName() : joined.getType().getName();
        int totalDurationMinutes = Math.max(
                1,
                (int) ChronoUnit.MINUTES.between(joined.getStartTime(), joined.getEndTime())
        );
        return new PublicBookingWidgetController.BookingResponse(
                joined.getId(),
                serviceName,
                List.of(serviceName),
                totalDurationMinutes,
                joined.getStartTime().format(DATE_TIME_FORMAT),
                joined.getStartTime().format(HUMAN_FORMAT),
                client.getEmail(),
                consultantName
        );
    }
    private void guardPublicWidgetRequest(Company company, HttpServletRequest request, boolean bookingRequest, String action) {
        try {
            if (!websiteWidgetSettingsService.widgetEnabled(company.getId())) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Website widget is disabled.");
            }
            widgetOriginValidator.validate(company, request);
            widgetRateLimiter.check(company.getTenantCode(), widgetPublicAuditLogger.clientIp(request), bookingRequest);
            widgetPublicAuditLogger.logAttempt(company, request, action, "allowed", "");
        } catch (RuntimeException ex) {
            widgetPublicAuditLogger.logAttempt(company, request, action, "rejected", ex.getMessage());
            throw ex;
        }
    }

    private List<PublicBookingWidgetController.GroupSessionSlotResponse> buildGroupSessions(
            Company company,
            WidgetConfig cfg,
            SessionType type,
            LocalDate date,
            Long consultantId
    ) {
        if (!isGroupWebsiteBookingOnly(type)) {
            return List.of();
        }
        LocalDateTime from = date.atStartOfDay();
        LocalDateTime to = date.plusDays(1).atStartOfDay();
        List<SessionBooking> candidates = bookings.findPublicGroupSessionCandidates(company.getId(), type.getId(), from, to);
        if (candidates.isEmpty()) {
            return List.of();
        }
        var rules = websiteWidgetSettingsService.bookingRules(company.getId());

        Map<String, List<SessionBooking>> grouped = new LinkedHashMap<>();
        for (SessionBooking booking : candidates) {
            if (consultantId != null) {
                Long bookingConsultantId = booking.getConsultant() == null ? null : booking.getConsultant().getId();
                if (!Objects.equals(bookingConsultantId, consultantId)) {
                    continue;
                }
            }
            if (!slotAllowedByReservationRules(booking.getStartTime(), cfg, rules)) {
                continue;
            }
            grouped.computeIfAbsent(groupKeyOf(booking), ignored -> new ArrayList<>()).add(booking);
        }

        return grouped.values().stream()
                .map(this::toGroupSessionSlot)
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(PublicBookingWidgetController.GroupSessionSlotResponse::startTime))
                .toList();
    }

    private PublicBookingWidgetController.GroupSessionSlotResponse toGroupSessionSlot(List<SessionBooking> rows) {
        if (rows == null || rows.isEmpty()) {
            return null;
        }
        SessionBooking representative = rows.stream()
                .min(Comparator.comparing(SessionBooking::getId))
                .orElse(rows.get(0));
        SessionType type = representative.getType();
        if (type == null || !isGroupWebsiteBookingOnly(type)) {
            return null;
        }
        int bookedParticipants = (int) rows.stream()
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .map(Client::getId)
                .distinct()
                .count();
        Integer maxParticipants = type.getMaxParticipantsPerSession();
        if (maxParticipants != null && bookedParticipants >= maxParticipants) {
            return null;
        }
        Integer remainingSpots = maxParticipants == null ? null : Math.max(0, maxParticipants - bookedParticipants);
        return new PublicBookingWidgetController.GroupSessionSlotResponse(
                representative.getId(),
                representative.getStartTime().format(SLOT_LABEL_FORMAT),
                representative.getStartTime().format(DATE_TIME_FORMAT),
                representative.getEndTime().format(DATE_TIME_FORMAT),
                representative.getConsultant() == null ? null : representative.getConsultant().getId(),
                representative.getConsultant() == null ? null : consultantFullName(representative.getConsultant()),
                maxParticipants,
                bookedParticipants,
                remainingSpots
        );
    }

    private List<SessionBooking> loadGroupedRows(SessionBooking booking, Long companyId) {
        List<SessionBooking> rows = bookings.findByBookingGroupKeyAndCompanyIdOrderByIdAsc(groupKeyOf(booking), companyId);
        if (rows == null || rows.isEmpty()) {
            return List.of(booking);
        }
        return rows;
    }

    private String groupKeyOf(SessionBooking booking) {
        if (booking.getBookingGroupKey() != null && !booking.getBookingGroupKey().isBlank()) {
            return booking.getBookingGroupKey();
        }
        return "legacy-" + booking.getId();
    }

    private com.example.app.session.ServiceGroup publicGroup(SessionType type) {
        if (type == null || type.getCompany() == null
                || !featureAccess.areServiceGroupsEnabled(type.getCompany().getId())
                || type.getServiceGroup() == null || !type.getServiceGroup().isActive()) return null;
        return type.getServiceGroup();
    }

    private boolean isWebsiteBookingEnabled(SessionType type) {
        return type != null && type.isActive() && type.isWidgetGroupBookingEnabled();
    }

    private boolean isGroupWebsiteBookingOnly(SessionType type) {
        return isWebsiteBookingEnabled(type) && type.getMaxParticipantsPerSession() != null;
    }

    private List<PublicBookingWidgetController.AvailabilitySlotResponse> buildBookableSlots(
            Company company,
            WidgetConfig cfg,
            List<SessionType> chain,
            LocalDate date,
            Long consultantId,
            WidgetAvailabilitySnapshot availabilitySnapshot,
            GuestSettingsService.GuestBookingRules rules
    ) {
        LocalDate today = timeService.localDate(cfg.zoneId());
        if (date.isBefore(today)) {
            return new ArrayList<>();
        }

        int bookingMinutes = chainBookingMinutes(chain);
        int availabilityMinutes = chainAvailabilityMinutes(chain);
        Map<String, PublicBookingWidgetController.AvailabilitySlotResponse> deduped = new LinkedHashMap<>();
        List<BookableSlot> windows = bookableWindowsForDate(availabilitySnapshot, date);

        for (BookableSlot window : windows) {
            for (LocalDateTime start : AvailabilityWindowGrid.starts(
                    date, window.getStartTime(), window.getEndTime(), availabilityMinutes, 30)) {
                LocalDateTime end = start.plusMinutes(bookingMinutes);
                if (!slotAllowedByReservationRules(
                        start,
                        cfg,
                        rules
                )) {
                    continue;
                }
                if (isActuallyBookable(company.getId(), window.getConsultant().getId(), start, end, chain, availabilitySnapshot)) {
                    String iso = DATE_TIME_FORMAT.format(start);
                    deduped.putIfAbsent(iso, new PublicBookingWidgetController.AvailabilitySlotResponse(
                            window.getConsultant().getId() + "|" + start + "|" + end,
                            start.toLocalTime().format(SLOT_LABEL_FORMAT),
                            iso,
                            DATE_TIME_FORMAT.format(end),
                            window.getConsultant().getId(),
                            consultantFullName(window.getConsultant())
                    ));
                }
            }
        }

        return new ArrayList<>(deduped.values());
    }

    /**
     * 30-minute grid inside each consultant's working-hours window for {@code date}.
     */
    private List<PublicBookingWidgetController.AvailabilitySlotResponse> buildWorkingHoursSlots(
            Company company,
            WidgetConfig cfg,
            List<SessionType> chain,
            LocalDate date,
            Long consultantId,
            WidgetAvailabilitySnapshot availabilitySnapshot,
            GuestSettingsService.GuestBookingRules rules
    ) {
        LocalDate today = timeService.localDate(cfg.zoneId());
        if (date.isBefore(today)) {
            return new ArrayList<>();
        }

        int bookingMinutes = chainBookingMinutes(chain);
        int availabilityMinutes = chainAvailabilityMinutes(chain);
        List<User> consultants = availabilitySnapshot.supportedConsultants();

        Map<String, PublicBookingWidgetController.AvailabilitySlotResponse> deduped = new LinkedHashMap<>();
        for (User consultant : consultants) {
            Optional<TimeWindow> dayWindow = resolveConsultantWorkingWindow(consultant, date);
            if (dayWindow.isEmpty()) {
                continue;
            }
            for (LocalDateTime start : AvailabilityWindowGrid.starts(
                    date, dayWindow.get().start(), dayWindow.get().end(), availabilityMinutes, 30)) {
                LocalDateTime end = start.plusMinutes(bookingMinutes);
                if (!slotAllowedByReservationRules(
                        start,
                        cfg,
                        rules
                )) {
                    continue;
                }
                if (isActuallyBookable(company.getId(), consultant.getId(), start, end, chain, availabilitySnapshot)) {
                    String iso = DATE_TIME_FORMAT.format(start);
                    deduped.putIfAbsent(iso, new PublicBookingWidgetController.AvailabilitySlotResponse(
                            consultant.getId() + "|" + start + "|" + end,
                            start.toLocalTime().format(SLOT_LABEL_FORMAT),
                            iso,
                            DATE_TIME_FORMAT.format(end),
                            consultant.getId(),
                            consultantFullName(consultant)
                    ));
                }
            }
        }

        return new ArrayList<>(deduped.values());
    }

    /**
     * Parses {@link User#getWorkingHoursJson()} ({@code sameForAllDays}, {@code allDays}, {@code byDay}) like the
     * calendar frontend. Missing config or closed day yields empty.
     */
    private Optional<TimeWindow> resolveConsultantWorkingWindow(User consultant, LocalDate date) {
        String raw = consultant.getWorkingHoursJson();
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = JSON.readTree(raw);
            boolean sameForAllDays = root.path("sameForAllDays").asBoolean(false);
            JsonNode block;
            if (sameForAllDays) {
                block = root.get("allDays");
            } else {
                block = root.path("byDay").get(date.getDayOfWeek().name());
            }
            if (block == null || block.isNull() || !block.isObject()) {
                return Optional.empty();
            }
            LocalTime start = parseWorkingHoursTime(block.path("start").asText(null));
            LocalTime end = parseWorkingHoursTime(block.path("end").asText(null));
            if (start == null || end == null || !end.isAfter(start)) {
                return Optional.empty();
            }
            return Optional.of(new TimeWindow(start, end));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    private static LocalTime parseWorkingHoursTime(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String t = text.trim();
        try {
            return LocalTime.parse(t);
        } catch (Exception ex) {
            try {
                return LocalTime.parse(t, DateTimeFormatter.ofPattern("H:mm"));
            } catch (Exception ex2) {
                return null;
            }
        }
    }

    private record TimeWindow(LocalTime start, LocalTime end) {}

    private static String widgetSlotMergeKey(PublicBookingWidgetController.AvailabilitySlotResponse s, Long requestConsultantId) {
        // Without the employee-selection step the widget should show a slot once if at least one
        // consultant is free at that time. With an explicit consultant selected, only that consultant
        // is queried, so the same start-time key is still correct and also removes overlapping
        // bookable-window/working-hours duplicates.
        return s.startTime();
    }

    private List<PublicBookingWidgetController.AvailabilitySlotResponse> sortAvailabilitySlots(
            Map<String, PublicBookingWidgetController.AvailabilitySlotResponse> merged
    ) {
        TreeMap<LocalDateTime, List<PublicBookingWidgetController.AvailabilitySlotResponse>> byStart = new TreeMap<>();
        for (PublicBookingWidgetController.AvailabilitySlotResponse s : merged.values()) {
            LocalDateTime t = LocalDateTime.parse(s.startTime(), DATE_TIME_FORMAT);
            byStart.computeIfAbsent(t, k -> new ArrayList<>()).add(s);
        }
        List<PublicBookingWidgetController.AvailabilitySlotResponse> out = new ArrayList<>();
        for (List<PublicBookingWidgetController.AvailabilitySlotResponse> group : byStart.values()) {
            group.sort(Comparator.comparing(
                    PublicBookingWidgetController.AvailabilitySlotResponse::consultantName,
                    Comparator.nullsFirst(String.CASE_INSENSITIVE_ORDER)
            ));
            out.addAll(group);
        }
        return out;
    }

    private List<PublicBookingWidgetController.AvailabilitySlotResponse> buildFallbackSlots(
            Company company,
            WidgetConfig cfg,
            List<SessionType> chain,
            LocalDate date,
            Long consultantId,
            WidgetAvailabilitySnapshot availabilitySnapshot,
            GuestSettingsService.GuestBookingRules rules
    ) {
        LocalDate today = timeService.localDate(cfg.zoneId());
        if (date.isBefore(today)) {
            return new ArrayList<>();
        }

        int bookingMinutes = chainBookingMinutes(chain);
        int availabilityMinutes = chainAvailabilityMinutes(chain);
        LocalTime rangeStart;
        LocalTime rangeEnd;
        if (consultantId != null) {
            User consultant = availabilitySnapshot.supportedConsultants().stream()
                    .filter(candidate -> Objects.equals(candidate.getId(), consultantId))
                    .findFirst()
                    .orElse(null);
            if (consultant == null || !consultantSupportsChain(consultant, chain)) {
                return new ArrayList<>();
            }
            Optional<TimeWindow> window = resolveConsultantWorkingWindow(consultant, date);
            if (window.isEmpty()) {
                return new ArrayList<>();
            }
            rangeStart = window.get().start();
            rangeEnd = window.get().end();
        } else {
            rangeStart = cfg.workingHoursStart();
            rangeEnd = cfg.workingHoursEnd();
        }

        List<PublicBookingWidgetController.AvailabilitySlotResponse> items = new ArrayList<>();
        for (LocalDateTime start : AvailabilityWindowGrid.starts(
                date, rangeStart, rangeEnd, availabilityMinutes, 30)) {
            if (!slotAllowedByReservationRules(
                    start,
                    cfg,
                    rules
            )) {
                continue;
            }
            LocalDateTime end = start.plusMinutes(bookingMinutes);
            if (consultantId == null || isActuallyBookable(company.getId(), consultantId, start, end, chain, availabilitySnapshot)) {
                items.add(new PublicBookingWidgetController.AvailabilitySlotResponse(
                        (consultantId != null ? consultantId : 0L) + "|" + start + "|" + end,
                        start.toLocalTime().format(SLOT_LABEL_FORMAT),
                        DATE_TIME_FORMAT.format(start),
                        DATE_TIME_FORMAT.format(end),
                        consultantId,
                        null
                ));
            }
        }
        return items;
    }

    private boolean dateAllowedByReservationRules(LocalDate date, WidgetConfig cfg, GuestSettingsService.GuestBookingRules rules) {
        if (date == null || cfg == null || rules == null) return false;
        LocalDate today = timeService.localDate(cfg.zoneId());
        if (date.isBefore(today)) return false;
        return !date.isAfter(today.plusDays(rules.maxAdvanceBookingDays()));
    }

    private boolean slotAllowedByReservationRules(LocalDateTime slotStart, WidgetConfig cfg, GuestSettingsService.GuestBookingRules rules) {
        if (slotStart == null || cfg == null || rules == null) return false;
        return TenantReservationRulesService.slotAllowed(
                new TenantReservationRulesService.TenantReservationRules(
                        rules.minBookingNoticeMinutes(),
                        rules.maxAdvanceBookingDays(),
                        rules.rescheduleUntilHours(),
                        rules.cancelUntilHours(),
                        rules.employeeSelectionAllowed(),
                        rules.cancellationAllowed(),
                        rules.modificationAllowed(),
                        rules.noShowMode(),
                        rules.noShowAfterMinutes()
                ),
                slotStart,
                cfg.zoneId(),
                timeService.localDateTime(cfg.zoneId())
        );
    }

    private boolean isWidgetSlotStartInFuture(LocalDate date, LocalDateTime slotStart, ZoneId zoneId) {
        LocalDate today = timeService.localDate(zoneId);
        if (date.isBefore(today)) {
            return false;
        }
        if (date.isAfter(today)) {
            return true;
        }
        return slotStart.isAfter(timeService.localDateTime(zoneId));
    }

    private boolean isActuallyBookable(
            Long companyId,
            Long consultantId,
            LocalDateTime start,
            LocalDateTime end,
            List<SessionType> chain,
            WidgetAvailabilitySnapshot availabilitySnapshot
    ) {
        if (consultantId == null || start == null || end == null || availabilitySnapshot == null) {
            return false;
        }
        LocalDateTime requestedBusyEnd = start.plusMinutes(chainAvailabilityMinutes(chain));

        if (overlapsAny(
                availabilitySnapshot.bookingsByConsultant().getOrDefault(consultantId, List.of()),
                start,
                requestedBusyEnd
        )) {
            return false;
        }

        if (overlapsAny(
                availabilitySnapshot.personalBusyByOwner().getOrDefault(consultantId, List.of()),
                start,
                requestedBusyEnd
        )) {
            return false;
        }

        if (overlapsAnyHold(
                availabilitySnapshot.waitlistHoldsByEmployee().getOrDefault(consultantId, List.of()),
                start,
                requestedBusyEnd
        )) {
            return false;
        }

        if (availabilitySnapshot.enforcePhysicalSpace()) {
            if (overlapsAny(availabilitySnapshot.physicalBookings(), start, requestedBusyEnd)
                    || overlapsAnyHold(availabilitySnapshot.roomWaitlistHolds(), start, requestedBusyEnd)) {
                return false;
            }
        }
        return true;
    }

    private WidgetAvailabilitySnapshot loadWidgetAvailabilitySnapshot(
            Long companyId,
            LocalDateTime rangeStart,
            LocalDateTime rangeEnd,
            List<SessionType> chain,
            Long consultantId
    ) {
        long snapshotStartedNanos = System.nanoTime();
        List<User> supportedConsultants = supportedConsultants(companyId, chain).stream()
                .filter(candidate -> consultantId == null || Objects.equals(candidate.getId(), consultantId))
                .toList();
        java.util.Set<Long> supportedConsultantIds = supportedConsultants.stream()
                .map(User::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        LocalDate fromDate = rangeStart.toLocalDate();
        LocalDate toDate = rangeEnd.minusNanos(1).toLocalDate();
        List<BookableSlot> visibleBookableWindows = consultantId == null
                ? bookableSlots.findVisibleByCompanyAndDateRange(companyId, fromDate, toDate)
                : bookableSlots.findVisibleByConsultantAndCompanyAndDateRange(
                        consultantId,
                        companyId,
                        fromDate,
                        toDate
                );
        List<BookableSlot> bookableWindows = visibleBookableWindows.stream()
                .filter(slot -> slot.getConsultant() != null)
                .filter(slot -> supportedConsultantIds.contains(slot.getConsultant().getId()))
                .sorted(Comparator.comparing((BookableSlot slot) -> slot.getConsultant().getId())
                        .thenComparing(BookableSlot::getDayOfWeek)
                        .thenComparing(BookableSlot::getStartTime))
                .toList();

        boolean enforcePhysicalSpace = bookingCreationService.shouldEnforceSpaceOverlapProtection(
                companyId,
                bookingCreationService.isMultipleSessionsPerSpaceEnabled(companyId),
                false,
                null
        );
        Map<Long, List<WidgetBusyInterval>> bookingsByConsultant = new HashMap<>();
        List<WidgetBusyInterval> physicalBookings = new ArrayList<>();
        for (SessionBookingRepository.WidgetAvailabilityBusyInterval row :
                bookings.findWidgetAvailabilityBusyIntervals(companyId, consultantId, enforcePhysicalSpace, rangeStart, rangeEnd)) {
            if (row == null || row.getStartTime() == null || row.getBusyEndTime() == null) {
                continue;
            }
            WidgetBusyInterval interval = new WidgetBusyInterval(
                    row.getConsultantId(),
                    row.getSpaceId(),
                    row.getStartTime(),
                    row.getBusyEndTime(),
                    Boolean.TRUE.equals(row.getPhysical())
            );
            if (interval.consultantId() != null && supportedConsultantIds.contains(interval.consultantId())) {
                bookingsByConsultant.computeIfAbsent(interval.consultantId(), ignored -> new ArrayList<>())
                        .add(interval);
            }
            if (enforcePhysicalSpace && interval.physical()) {
                physicalBookings.add(interval);
            }
        }

        bookingsByConsultant.replaceAll((ownerId, intervals) -> mergeBusyIntervals(intervals));
        physicalBookings = new ArrayList<>(mergeBusyIntervals(physicalBookings));

        Map<Long, List<WidgetBusyInterval>> personalBusyByOwner = new HashMap<>();
        for (PersonalCalendarBlockRepository.WidgetAvailabilityPersonalBlock row :
                personalBlocks.findWidgetOverlappingRegularBlocks(companyId, consultantId, rangeStart, rangeEnd)) {
            if (row == null || row.getOwnerId() == null || row.getStartTime() == null || row.getEndTime() == null
                    || !supportedConsultantIds.contains(row.getOwnerId())) {
                continue;
            }
            addPersonalBusyInterval(personalBusyByOwner, row.getOwnerId(), row.getStartTime(), row.getEndTime(), rangeStart, rangeEnd);
        }
        Set<WidgetAvailabilityMarkerKey> seenAvailabilityMarkers = new HashSet<>();
        for (PersonalCalendarBlockRepository.WidgetAvailabilityPersonalBlock marker :
                personalBlocks.findWidgetAvailabilityMarkers(companyId, consultantId)) {
            if (marker == null || marker.getOwnerId() == null || marker.getStartTime() == null || marker.getEndTime() == null
                    || !supportedConsultantIds.contains(marker.getOwnerId())) {
                continue;
            }
            WidgetAvailabilityMarkerKey markerKey = new WidgetAvailabilityMarkerKey(
                    marker.getOwnerId(),
                    marker.getStartTime(),
                    marker.getEndTime(),
                    marker.getNotes()
            );
            if (!seenAvailabilityMarkers.add(markerKey)) {
                continue;
            }
            expandAvailabilityMarker(
                    personalBusyByOwner,
                    marker,
                    fromDate,
                    toDate,
                    rangeStart,
                    rangeEnd
            );
        }
        personalBusyByOwner.replaceAll((ownerId, intervals) -> mergeBusyIntervals(intervals));

        Map<Long, List<WidgetWaitlistHold>> waitlistHoldsByEmployee = new HashMap<>();
        List<WidgetWaitlistHold> roomWaitlistHolds = new ArrayList<>();
        if (waitlistHolds != null) {
            for (WaitlistBookingHoldRepository.WidgetAvailabilityHold row :
                    waitlistHolds.findWidgetAvailabilityHolds(companyId, consultantId, enforcePhysicalSpace, rangeStart, rangeEnd, Instant.now())) {
                if (row == null || row.getSlotStart() == null || row.getSlotEnd() == null) {
                    continue;
                }
                WidgetWaitlistHold hold = new WidgetWaitlistHold(
                        row.getEmployeeId(),
                        row.getRoomId(),
                        row.getSlotStart(),
                        row.getSlotEnd()
                );
                if (hold.employeeId() != null && supportedConsultantIds.contains(hold.employeeId())) {
                    waitlistHoldsByEmployee.computeIfAbsent(hold.employeeId(), ignored -> new ArrayList<>())
                            .add(hold);
                }
                if (enforcePhysicalSpace && hold.roomId() != null) {
                    roomWaitlistHolds.add(hold);
                }
            }
        }

        waitlistHoldsByEmployee.replaceAll((employeeId, holds) -> mergeWaitlistHolds(holds));
        roomWaitlistHolds = new ArrayList<>(mergeWaitlistHolds(roomWaitlistHolds));

        WidgetAvailabilitySnapshot snapshot = new WidgetAvailabilitySnapshot(
                supportedConsultants,
                bookableWindows,
                bookingsByConsultant,
                List.copyOf(physicalBookings),
                personalBusyByOwner,
                waitlistHoldsByEmployee,
                List.copyOf(roomWaitlistHolds),
                enforcePhysicalSpace
        );
        long elapsedMillis = (System.nanoTime() - snapshotStartedNanos) / 1_000_000L;
        if (elapsedMillis >= 750L) {
            LOG.warn(
                    "Slow widget availability snapshot: companyId={}, consultantId={}, from={}, to={}, consultants={}, windows={}, bookings={}, personalBlocks={}, holds={}, elapsedMs={}",
                    companyId,
                    consultantId,
                    rangeStart,
                    rangeEnd,
                    supportedConsultants.size(),
                    bookableWindows.size(),
                    bookingsByConsultant.values().stream().mapToInt(List::size).sum(),
                    personalBusyByOwner.values().stream().mapToInt(List::size).sum(),
                    waitlistHoldsByEmployee.values().stream().mapToInt(List::size).sum(),
                    elapsedMillis
            );
        }
        return snapshot;
    }

    private static boolean overlapsAny(
            List<WidgetBusyInterval> intervals,
            LocalDateTime start,
            LocalDateTime end
    ) {
        if (intervals == null || intervals.isEmpty() || start == null || end == null) {
            return false;
        }
        // Snapshot lists are sorted by start time. Stop as soon as later intervals can no
        // longer overlap instead of scanning the consultant's complete month for every slot.
        for (WidgetBusyInterval interval : intervals) {
            if (interval == null || interval.start() == null || interval.end() == null) continue;
            if (!interval.start().isBefore(end)) break;
            if (interval.end().isAfter(start)) return true;
        }
        return false;
    }

    private static boolean overlapsAnyHold(
            List<WidgetWaitlistHold> holds,
            LocalDateTime start,
            LocalDateTime end
    ) {
        if (holds == null || holds.isEmpty() || start == null || end == null) {
            return false;
        }
        for (WidgetWaitlistHold hold : holds) {
            if (hold == null || hold.start() == null || hold.end() == null) continue;
            if (!hold.start().isBefore(end)) break;
            if (hold.end().isAfter(start)) return true;
        }
        return false;
    }

    private record WidgetBusyInterval(
            Long consultantId,
            Long spaceId,
            LocalDateTime start,
            LocalDateTime end,
            boolean physical
    ) {}

    private record WidgetWaitlistHold(
            Long employeeId,
            Long roomId,
            LocalDateTime start,
            LocalDateTime end
    ) {}

    private record WidgetAvailabilityMarkerKey(
            Long ownerId,
            LocalDateTime start,
            LocalDateTime end,
            String notes
    ) {}

    private record WidgetAvailabilitySnapshot(
            List<User> supportedConsultants,
            List<BookableSlot> bookableWindows,
            Map<Long, List<WidgetBusyInterval>> bookingsByConsultant,
            List<WidgetBusyInterval> physicalBookings,
            Map<Long, List<WidgetBusyInterval>> personalBusyByOwner,
            Map<Long, List<WidgetWaitlistHold>> waitlistHoldsByEmployee,
            List<WidgetWaitlistHold> roomWaitlistHolds,
            boolean enforcePhysicalSpace
    ) {
        private static WidgetAvailabilitySnapshot empty() {
            return new WidgetAvailabilitySnapshot(
                    List.of(),
                    List.of(),
                    Map.of(),
                    List.of(),
                    Map.of(),
                    Map.of(),
                    List.of(),
                    false
            );
        }
    }

    private static void addPersonalBusyInterval(
            Map<Long, List<WidgetBusyInterval>> personalBusyByOwner,
            Long ownerId,
            LocalDateTime start,
            LocalDateTime end,
            LocalDateTime rangeStart,
            LocalDateTime rangeEnd
    ) {
        if (personalBusyByOwner == null || ownerId == null || start == null || end == null
                || !end.isAfter(start) || !start.isBefore(rangeEnd) || !end.isAfter(rangeStart)) {
            return;
        }
        personalBusyByOwner.computeIfAbsent(ownerId, ignored -> new ArrayList<>())
                .add(new WidgetBusyInterval(ownerId, null, start, end, false));
    }

    private static void expandAvailabilityMarker(
            Map<Long, List<WidgetBusyInterval>> personalBusyByOwner,
            PersonalCalendarBlockRepository.WidgetAvailabilityPersonalBlock marker,
            LocalDate fromDate,
            LocalDate toDate,
            LocalDateTime rangeStart,
            LocalDateTime rangeEnd
    ) {
        Optional<AvailabilityBlockMetadata.Metadata> parsed = AvailabilityBlockMetadata.parse(
                marker.getNotes(), marker.getStartTime(), marker.getEndTime());
        if (parsed.isEmpty()) {
            addPersonalBusyInterval(
                    personalBusyByOwner,
                    marker.getOwnerId(),
                    marker.getStartTime(),
                    marker.getEndTime(),
                    rangeStart,
                    rangeEnd
            );
            return;
        }

        AvailabilityBlockMetadata.Metadata metadata = parsed.get();
        LocalDate cursor = fromDate;
        if (metadata.startDate() != null && cursor.isBefore(metadata.startDate())) {
            cursor = metadata.startDate();
        }
        LocalDate last = toDate;
        if (!metadata.indefinite() && metadata.endDate() != null && last.isAfter(metadata.endDate())) {
            last = metadata.endDate();
        }
        long guard = 0;
        while (!cursor.isAfter(last) && guard++ < 3700) {
            boolean afterStart = metadata.startDate() == null || !cursor.isBefore(metadata.startDate());
            boolean beforeEnd = metadata.indefinite() || metadata.endDate() == null || !cursor.isAfter(metadata.endDate());
            if (afterStart && beforeEnd && cursor.getDayOfWeek() == metadata.dayOfWeek()) {
                LocalDateTime occurrenceStart = cursor.atTime(metadata.startTime());
                LocalDateTime occurrenceEnd = cursor.atTime(metadata.endTime());
                if (!occurrenceEnd.isAfter(occurrenceStart)) {
                    occurrenceEnd = occurrenceEnd.plusDays(1);
                }
                addPersonalBusyInterval(
                        personalBusyByOwner,
                        marker.getOwnerId(),
                        occurrenceStart,
                        occurrenceEnd,
                        rangeStart,
                        rangeEnd
                );
            }
            cursor = cursor.plusDays(1);
        }
    }

    private static List<WidgetBusyInterval> mergeBusyIntervals(List<WidgetBusyInterval> intervals) {
        if (intervals == null || intervals.isEmpty()) return List.of();
        List<WidgetBusyInterval> sorted = intervals.stream()
                .filter(Objects::nonNull)
                .filter(interval -> interval.start() != null && interval.end() != null && interval.end().isAfter(interval.start()))
                .sorted(Comparator.comparing(WidgetBusyInterval::start).thenComparing(WidgetBusyInterval::end))
                .toList();
        if (sorted.isEmpty()) return List.of();

        List<WidgetBusyInterval> merged = new ArrayList<>();
        WidgetBusyInterval current = sorted.get(0);
        for (int index = 1; index < sorted.size(); index++) {
            WidgetBusyInterval next = sorted.get(index);
            if (!next.start().isAfter(current.end())) {
                LocalDateTime mergedEnd = next.end().isAfter(current.end()) ? next.end() : current.end();
                current = new WidgetBusyInterval(current.consultantId(), current.spaceId(), current.start(), mergedEnd, current.physical() || next.physical());
            } else {
                merged.add(current);
                current = next;
            }
        }
        merged.add(current);
        return List.copyOf(merged);
    }

    private static List<WidgetWaitlistHold> mergeWaitlistHolds(List<WidgetWaitlistHold> holds) {
        if (holds == null || holds.isEmpty()) return List.of();
        List<WidgetWaitlistHold> sorted = holds.stream()
                .filter(Objects::nonNull)
                .filter(hold -> hold.start() != null && hold.end() != null && hold.end().isAfter(hold.start()))
                .sorted(Comparator.comparing(WidgetWaitlistHold::start).thenComparing(WidgetWaitlistHold::end))
                .toList();
        if (sorted.isEmpty()) return List.of();

        List<WidgetWaitlistHold> merged = new ArrayList<>();
        WidgetWaitlistHold current = sorted.get(0);
        for (int index = 1; index < sorted.size(); index++) {
            WidgetWaitlistHold next = sorted.get(index);
            if (!next.start().isAfter(current.end())) {
                LocalDateTime mergedEnd = next.end().isAfter(current.end()) ? next.end() : current.end();
                current = new WidgetWaitlistHold(current.employeeId(), current.roomId(), current.start(), mergedEnd);
            } else {
                merged.add(current);
                current = next;
            }
        }
        merged.add(current);
        return List.copyOf(merged);
    }

    private void lockTenantForClientMatch(Company company) {
        companies.findByIdForUpdate(company.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
    }

    private Client findOrCreateClient(Company company, User actor, PublicBookingWidgetController.BookingRequest request) {
        return findOrCreateClient(
                company,
                actor,
                request.firstName(),
                request.lastName(),
                request.email(),
                request.phone()
        );
    }

    private Client findOrCreateClient(
            Company company,
            User actor,
            String firstName,
            String lastName,
            String email,
            String phone
    ) {
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        String normalizedPhone = phone.trim();

        Optional<Client> existing = clients.findFirstCandidatesByCompanyIdAndNormalizedEmail(company.getId(), normalizedEmail)
                .stream()
                .findFirst();
        if (existing.isEmpty()) {
            existing = clients.findFirstCandidatesByCompanyIdAndNormalizedPhone(company.getId(), normalizedPhone)
                    .stream()
                    .findFirst();
        }
        if (existing.isPresent()) {
            Client client = existing.get();
            if (client.getAssignedTo() == null) {
                client.setAssignedTo(actor);
            }
            if (client.getEmail() == null || client.getEmail().isBlank()) {
                client.setEmail(normalizedEmail);
            }
            if (client.getPhone() == null || client.getPhone().isBlank()) {
                client.setPhone(normalizedPhone);
                client.setWhatsappPhone(normalizedPhone);
            }
            return clients.save(client);
        }

        Client client = new Client();
        client.setCompany(company);
        client.setAssignedTo(actor);
        client.setFirstName(firstName.trim());
        client.setLastName(lastName.trim());
        client.setEmail(normalizedEmail);
        client.setPhone(normalizedPhone);
        client.setWhatsappPhone(normalizedPhone);
        client.setWhatsappOptIn(false);
        client.setActive(true);
        client.setBatchPaymentEnabled(false);
        return clients.save(client);
    }

    private User resolveConsultantForBooking(Long companyId, Long consultantId, boolean availabilityEnabled) {
        if (consultantId == null) {
            if (availabilityEnabled) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A consultant-backed slot is required when availability is enabled.");
            }
            return null;
        }

        User consultant = users.findByIdAndCompanyIdAndActiveTrue(consultantId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant."));
        if (!isBookableConsultant(consultant)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant.");
        }
        return consultant;
    }

    private User resolveAdminActor(Long companyId) {
        return users.findFirstByCompanyIdAndActiveTrueAndRoleOrderByIdAsc(companyId, Role.ADMIN)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No admin user available for tenancy."));
    }

    private List<User> supportedConsultants(Long companyId, SessionType type) {
        return supportedConsultants(companyId, List.of(type));
    }

    private List<User> supportedConsultants(Long companyId, List<SessionType> chain) {
        return users.findActiveBookableByCompanyId(companyId).stream()
                .filter(consultant -> consultantSupportsChain(consultant, chain))
                .sorted(Comparator.comparing(this::consultantFullName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private boolean consultantSupportsChain(User consultant, List<SessionType> chain) {
        return consultant != null
                && chain != null
                && !chain.isEmpty()
                && chain.stream().allMatch(type -> consultantSupportsType(consultant, type));
    }

    @SuppressWarnings("unchecked")
    private List<Long> extractServiceIds(Object request) {
        if (request == null) {
            return List.of();
        }
        try {
            Object value = request.getClass().getMethod("serviceIds").invoke(request);
            if (!(value instanceof List<?> raw)) {
                return List.of();
            }
            return raw.stream()
                    .filter(Objects::nonNull)
                    .filter(Long.class::isInstance)
                    .map(Long.class::cast)
                    .toList();
        } catch (ReflectiveOperationException ignored) {
            // Compatibility with older single-service request records.
            return List.of();
        }
    }

    private List<SessionType> resolveServiceChain(Long companyId, Long typeId, List<Long> serviceIds) {
        List<Long> orderedIds = new ArrayList<>();
        if (serviceIds != null) {
            serviceIds.stream().filter(Objects::nonNull).forEach(orderedIds::add);
        }
        if (orderedIds.isEmpty()) {
            if (typeId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one service is required.");
            }
            orderedIds.add(typeId);
        } else if (typeId != null && !Objects.equals(orderedIds.get(0), typeId)) {
            orderedIds.add(0, typeId);
        }

        if (orderedIds.size() > 1
                && !guestSettingsService.publicSettings(companyId).multipleServicesEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "MULTIPLE_SERVICES_DISABLED: Multiple services per appointment are disabled for this tenant."
            );
        }

        List<SessionType> chain = new ArrayList<>();
        for (Long serviceId : orderedIds) {
            chain.add(resolveType(companyId, serviceId));
        }
        return List.copyOf(chain);
    }

    private List<SessionBookingController.BookingServiceRequest> bookingServiceRequests(List<SessionType> chain) {
        List<SessionBookingController.BookingServiceRequest> requests = new ArrayList<>();
        for (int position = 0; position < chain.size(); position++) {
            requests.add(new SessionBookingController.BookingServiceRequest(
                    chain.get(position).getId(),
                    position,
                    null
            ));
        }
        return List.copyOf(requests);
    }

    private boolean chainContainsGroupOnlyService(List<SessionType> chain) {
        return chain != null && chain.stream().anyMatch(this::isGroupWebsiteBookingOnly);
    }

    private int serviceDurationMinutes(SessionType type) {
        return Math.max(1, type == null || type.getDurationMinutes() == null ? 60 : type.getDurationMinutes());
    }

    private int serviceBreakMinutes(SessionType type) {
        return Math.max(0, type == null || type.getBreakMinutes() == null ? 0 : type.getBreakMinutes());
    }

    /**
     * Appointment duration shown to the client: all service durations plus breaks between services.
     * The final service break blocks availability but is not part of the appointment's displayed end time.
     */
    private int chainBookingMinutes(List<SessionType> chain) {
        int minutes = 0;
        for (int index = 0; index < chain.size(); index++) {
            SessionType type = chain.get(index);
            minutes += serviceDurationMinutes(type);
            if (index < chain.size() - 1) {
                minutes += serviceBreakMinutes(type);
            }
        }
        return Math.max(1, minutes);
    }

    private int chainAvailabilityMinutes(List<SessionType> chain) {
        if (chain == null || chain.isEmpty()) {
            return 1;
        }
        return chainBookingMinutes(chain) + serviceBreakMinutes(chain.get(chain.size() - 1));
    }

    private boolean isBookableConsultant(User user) {
        return user.isConsultant();
    }

    private boolean consultantSupportsType(User consultant, SessionType type) {
        return consultant.getTypes() == null
                || consultant.getTypes().isEmpty()
                || consultant.getTypes().stream().anyMatch(t -> t.getId().equals(type.getId()));
    }

    private String consultantFullName(User consultant) {
        return (consultant.getFirstName() + " " + consultant.getLastName()).trim();
    }

    private List<BookableSlot> bookableWindowsForDate(
            WidgetAvailabilitySnapshot availabilitySnapshot,
            LocalDate date
    ) {
        if (availabilitySnapshot == null || date == null) {
            return List.of();
        }
        return availabilitySnapshot.bookableWindows().stream()
                .filter(slot -> slot.getDayOfWeek() == date.getDayOfWeek())
                .filter(slot -> withinDateRange(slot, date))
                .toList();
    }

    private boolean withinDateRange(BookableSlot slot, LocalDate date) {
        if (slot.getStartDate() != null && date.isBefore(slot.getStartDate())) return false;
        if (slot.getEndDate() != null && date.isAfter(slot.getEndDate())) return false;
        return true;
    }

    private SessionType resolveType(Long companyId, Long typeId) {
        SessionType type = types.findAllWithLinkedServicesByCompanyId(companyId).stream()
                .filter(candidate -> candidate.getId().equals(typeId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid service."));
        if (!isWebsiteBookingEnabled(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available for website booking.");
        }
        return type;
    }

    private Company resolveCompany(String tenantCode) {
        if (tenantCode == null || tenantCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown tenant code.");
        }
        return companies.findByTenantCodeIgnoreCase(tenantCode.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown tenant code."));
    }

    private LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value, DATE_FORMAT);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date. Use YYYY-MM-DD.");
        }
    }

    private LocalDateTime parseStartTime(String value, LocalDate fallbackDate) {
        try {
            if (value.contains("T")) {
                return LocalDateTime.parse(value, DATE_TIME_FORMAT);
            }
            return LocalDateTime.of(fallbackDate, LocalTime.parse(value));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid startTime.");
        }
    }

    /**
     * Session types store linked transaction-service prices as net values. The public
     * website widget must display the same customer-facing amount as checkout: the
     * total gross price of all linked transaction services, including VAT.
     */
    private String toPriceLabel(SessionType type) {
        BigDecimal gross = sessionTypePriceGross(type);
        if (gross == null) return null;
        return "€" + gross.stripTrailingZeros().toPlainString();
    }

    private BigDecimal sessionTypePriceGross(SessionType type) {
        if (type == null || type.getLinkedServices() == null || type.getLinkedServices().isEmpty()) {
            return null;
        }
        BigDecimal total = BigDecimal.ZERO;
        boolean hasPrice = false;
        for (var link : type.getLinkedServices()) {
            if (link == null || link.getTransactionService() == null) {
                continue;
            }
            BigDecimal net = link.getPrice() != null ? link.getPrice() : link.getTransactionService().getNetPrice();
            if (net == null) {
                continue;
            }
            BigDecimal multiplier = link.getTransactionService().getTaxRate() == null
                    ? BigDecimal.ZERO
                    : link.getTransactionService().getTaxRate().multiplier;
            BigDecimal gross = net.add(net.multiply(multiplier)).setScale(2, java.math.RoundingMode.HALF_UP);
            total = total.add(gross);
            hasPrice = true;
        }
        return hasPrice ? total.setScale(2, java.math.RoundingMode.HALF_UP) : null;
    }

    private WidgetConfig loadConfig(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        boolean availabilityEnabled = !"false".equalsIgnoreCase(values.getOrDefault(SettingKey.BOOKABLE_ENABLED.name(), "true"));
        boolean typesEnabled = !"false".equalsIgnoreCase(values.getOrDefault(SettingKey.TYPES_ENABLED.name(), "true"));
        int sessionLengthMinutes = parseInteger(values.get(SettingKey.SESSION_LENGTH_MINUTES.name()), 60);
        LocalTime workingHoursStart = parseTime(values.get(SettingKey.WORKING_HOURS_START.name()), LocalTime.of(8, 0));
        LocalTime workingHoursEnd = parseTime(values.get(SettingKey.WORKING_HOURS_END.name()), LocalTime.of(18, 0));
        JsonNode guestSettings = parseJson(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        String companyName = firstNonBlank(
                textValue(guestSettings.path("publicName")),
                values.get(SettingKey.COMPANY_NAME.name()),
                "Calendra"
        );
        String companyLogoUrl = firstNonBlank(
                values.get(SettingKey.COMPANY_LOGO_URL.name()),
                textValue(guestSettings.path("logoImageUrl"))
        );
        String companyAddress = formatAddress(
                firstNonBlank(
                        values.get(SettingKey.COMPANY_PHYSICAL_ADDRESS.name()),
                        values.get(SettingKey.COMPANY_ADDRESS.name())
                ),
                firstNonBlank(
                        values.get(SettingKey.COMPANY_PHYSICAL_POSTAL_CODE.name()),
                        values.get(SettingKey.COMPANY_POSTAL_CODE.name())
                ),
                firstNonBlank(
                        values.get(SettingKey.COMPANY_PHYSICAL_CITY.name()),
                        values.get(SettingKey.COMPANY_CITY.name())
                )
        );
        return new WidgetConfig(
                companyName,
                companyLogoUrl,
                companyAddress,
                availabilityEnabled,
                typesEnabled,
                sessionLengthMinutes,
                workingHoursStart,
                workingHoursEnd,
                widgetZoneId
        );
    }

    private static JsonNode parseJson(String raw) {
        if (raw == null || raw.isBlank()) return JSON.createObjectNode();
        try {
            return JSON.readTree(raw);
        } catch (Exception ignored) {
            return JSON.createObjectNode();
        }
    }

    private static String textValue(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        String value = node.asText("").trim();
        return value.isBlank() ? null : value;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) return value.trim();
        }
        return null;
    }

    private static String formatAddress(String street, String postalCode, String city) {
        String locality = firstNonBlank(
                joinWithSpace(postalCode, city),
                city,
                postalCode
        );
        if (street == null || street.isBlank()) return locality;
        if (locality == null || locality.isBlank()) return street.trim();
        return street.trim() + ", " + locality;
    }

    private static String joinWithSpace(String first, String second) {
        String left = first == null ? "" : first.trim();
        String right = second == null ? "" : second.trim();
        if (left.isBlank()) return right.isBlank() ? null : right;
        if (right.isBlank()) return left;
        return left + " " + right;
    }

    private ZoneId tenantZoneId(Long companyId) {
        return widgetZoneId;
    }

    private int parseInteger(String value, int fallback) {
        try {
            return value == null || value.isBlank() ? fallback : Integer.parseInt(value.trim());
        } catch (Exception ex) {
            return fallback;
        }
    }

    private LocalTime parseTime(String value, LocalTime fallback) {
        try {
            return value == null || value.isBlank() ? fallback : LocalTime.parse(value.trim());
        } catch (Exception ex) {
            return fallback;
        }
    }

    private record WidgetConfig(
            String companyName,
            String companyLogoUrl,
            String companyAddress,
            boolean availabilityEnabled,
            boolean typesEnabled,
            int sessionLengthMinutes,
            LocalTime workingHoursStart,
            LocalTime workingHoursEnd,
            ZoneId zoneId
    ) {}
}
