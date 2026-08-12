package com.example.app.guest.catalog;

import com.example.app.commerce.CommerceLocationScopeService;

import com.example.app.client.Client;
import com.example.app.common.SimulatedTimeContext;
import com.example.app.common.TimeService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.guest.common.GuestSettingsService;
import com.example.app.guest.model.GuestProduct;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.ProductType;
import com.example.app.guest.model.VoucherRules;
import com.example.app.guest.tenant.GuestLocationAccessService;
import com.example.app.guest.tenant.GuestTenantService;
import com.example.app.location.Location;
import com.example.app.session.AvailabilityWindowGrid;
import com.example.app.session.BookableSlot;
import com.example.app.session.BookableSlotRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingController;
import com.example.app.session.SessionServicePlanService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import com.example.app.session.SessionType;
import com.example.app.session.TypeTransactionService;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.SessionTypeLocationPriceService;
import com.example.app.session.SessionTypeBreakSettingsService;
import com.example.app.settings.CourseModuleAccessService;
import com.example.app.settings.EntitlementsModuleAccessService;
import com.example.app.settings.TenantFeatureAccessService;
import com.example.app.settings.TenantReservationRulesService;
import com.example.app.user.User;
import com.example.app.user.ConsultantLocationService;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestCatalogService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int SLOT_GRID_MINUTES = 30;

    private final SessionTypeRepository sessionTypes;
    private final GuestProductRepository guestProducts;
    private final BookableSlotRepository bookableSlots;
    private final SessionBookingRepository bookings;
    private final UserRepository users;
    private final SessionBookingCreationService bookingCreationService;
    private final GuestSettingsService guestSettings;
    private final TimeService timeService;
    private final CourseModuleAccessService courseModuleAccessService;
    private final TenantFeatureAccessService featureAccess;
    private final ZoneId zoneId;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private GuestLocationAccessService guestLocations;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private GuestTenantService guestTenantService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ConsultantLocationService consultantLocations;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private CommerceLocationScopeService commerceLocations;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private SessionTypeLocationPriceService locationPrices;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private SessionTypeBreakSettingsService breakSettings;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private EntitlementsModuleAccessService entitlementsModuleAccessService;

    public GuestCatalogService(
            SessionTypeRepository sessionTypes,
            GuestProductRepository guestProducts,
            BookableSlotRepository bookableSlots,
            SessionBookingRepository bookings,
            UserRepository users,
            SessionBookingCreationService bookingCreationService,
            GuestSettingsService guestSettings,
            TimeService timeService,
            CourseModuleAccessService courseModuleAccessService,
            TenantFeatureAccessService featureAccess,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String timezoneId
    ) {
        this.sessionTypes = sessionTypes;
        this.guestProducts = guestProducts;
        this.bookableSlots = bookableSlots;
        this.bookings = bookings;
        this.users = users;
        this.bookingCreationService = bookingCreationService;
        this.guestSettings = guestSettings;
        this.timeService = timeService;
        this.courseModuleAccessService = courseModuleAccessService;
        this.featureAccess = featureAccess;
        this.zoneId = ZoneId.of((timezoneId == null || timezoneId.isBlank()) ? "Europe/Ljubljana" : timezoneId.trim());
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.ProductResponse> products(Long companyId, GuestUser guestUser) {
        return products(companyId, null, guestUser);
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.ProductResponse> products(Long companyId, Long locationId, GuestUser guestUser) {
        if (guestUser != null && guestTenantService != null) {
            if (locationId != null) {
                guestTenantService.requireLocationSubscription(guestUser, companyId, locationId);
            } else {
                // Old mobile clients did not send locationId on the dashboard products call.
                // Keep that endpoint compatible, but scope it to the guest's subscribed locations
                // instead of falling back to the entire company.
                guestTenantService.requireLink(guestUser, companyId);
                List<Long> subscribedLocations = guestTenantService.subscribedLocationIds(guestUser, companyId);
                java.util.LinkedHashMap<String, GuestDtos.ProductResponse> merged = new java.util.LinkedHashMap<>();
                for (Long subscribedLocationId : subscribedLocations) {
                    for (GuestDtos.ProductResponse product : productsForScope(companyId, subscribedLocationId, guestUser)) {
                        merged.putIfAbsent(product.productId(), product);
                    }
                }
                return List.copyOf(merged.values());
            }
        }
        return productsForScope(companyId, locationId, guestUser);
    }

    private List<GuestDtos.ProductResponse> productsForScope(Long companyId, Long locationId, GuestUser guestUser) {
        SimulatedTimeContext.set(companyId);
        Location selectedLocation = locationId == null || guestLocations == null
                ? null : guestLocations.requireDiscoverable(companyId, locationId);
        List<GuestDtos.ProductResponse> out = new ArrayList<>();
        boolean billingEnabled = !Boolean.FALSE.equals(guestSettings.billingEnabled(companyId));
        boolean coursesEnabled = courseModuleAccessService == null || courseModuleAccessService.isEnabled(companyId);
        boolean giftCardsEnabled = guestSettings.giftCardsEnabled(companyId);
        String defaultCurrency = tenantCurrency(companyId);
        for (SessionType type : sessionTypes.findAllWithLinkedServicesByCompanyId(companyId)) {
            if (!isVisibleInGuestServiceStep(companyId, type, guestUser)) continue;
            if (selectedLocation != null && !guestLocations.isServiceAvailableAt(type, selectedLocation.getId())) continue;
            BigDecimal price = sessionTypePriceGross(type, selectedLocation == null ? null : selectedLocation.getId());
            String productType = Boolean.TRUE.equals(type.isWidgetGroupBookingEnabled()) ? "CLASS_TICKET" : "SESSION_SINGLE";
            out.add(new GuestDtos.ProductResponse(
                    derivedProductId(type),
                    type.getName(),
                    productType,
                    price.doubleValue(),
                    defaultCurrency,
                    String.valueOf(type.getId()),
                    type.getName(),
                    true,
                    type.getDescription(),
                    type.getDurationMinutes() == null ? 60 : type.getDurationMinutes(),
                    null,
                    null,
                    null,
                    publicGroup(type) == null ? null : String.valueOf(publicGroup(type).getId()),
                    publicGroup(type) == null ? null : publicGroup(type).getName(),
                    publicGroup(type) == null ? null : publicGroup(type).getSortOrder(),
                    type.getGuestSortOrder(),
                    null,
                    null,
                    null,
                    List.of(),
                    List.of()
            ));
        }
        if (!entitlementsEnabled(companyId)) {
            return out;
        }
        for (GuestProduct product : guestProducts.findAllByCompanyIdAndActiveTrueAndGuestVisibleTrueOrderBySortOrderAscIdAsc(companyId)) {
            if (product.getCourse() != null) continue;
            if (product.getProductType() == ProductType.GIFT_CARD && !giftCardsEnabled) continue;
            if (product.getProductType() == ProductType.COURSE
                    && (!coursesEnabled || (product.getSessionType() == null && product.getServiceGroup() == null))) continue;
            if (!billingEnabled && !product.isBookable()) continue;
            // Wallet products can cover several services. For guest visibility/location
            // checks, any eligible service is sufficient; an unrestricted membership
            // (no explicit service scope) remains visible as a wildcard product. Course
            // access products intentionally ignore booking-step visibility.
            if (product.getProductType() != ProductType.COURSE
                    && !productHasVisibleEligibleService(product, companyId, guestUser)) continue;
            if (selectedLocation != null && commerceLocations != null
                    && !commerceLocations.productAvailableAt(product, selectedLocation.getId())) continue;
            if (selectedLocation != null
                    && !productHasEligibleServiceAtLocation(product, selectedLocation.getId())) continue;
            out.add(new GuestDtos.ProductResponse(
                    String.valueOf(product.getId()),
                    product.getName(),
                    product.getProductType().name(),
                    product.getPriceGross().doubleValue(),
                    product.getCurrency(),
                    product.getSessionType() == null ? null : String.valueOf(product.getSessionType().getId()),
                    product.getSessionType() == null ? null : product.getSessionType().getName(),
                    product.isBookable(),
                    product.getDescription() != null ? product.getDescription() : product.getSessionType() == null ? null : product.getSessionType().getDescription(),
                    product.getSessionType() != null && product.getSessionType().getDurationMinutes() != null ? product.getSessionType().getDurationMinutes() : 60,
                    product.getPromoText(),
                    product.getValidityDays(),
                    product.getUsageLimit(),
                    product.getServiceGroup() != null
                            ? String.valueOf(product.getServiceGroup().getId())
                            : product.getSessionType() == null || publicGroup(product.getSessionType()) == null
                                ? null : String.valueOf(publicGroup(product.getSessionType()).getId()),
                    product.getServiceGroup() != null
                            ? product.getServiceGroup().getName()
                            : product.getSessionType() == null || publicGroup(product.getSessionType()) == null
                                ? null : publicGroup(product.getSessionType()).getName(),
                    product.getServiceGroup() != null
                            ? product.getServiceGroup().getSortOrder()
                            : product.getSessionType() == null || publicGroup(product.getSessionType()) == null
                                ? null : publicGroup(product.getSessionType()).getSortOrder(),
                    product.getSessionType() == null ? Integer.MAX_VALUE : product.getSessionType().getGuestSortOrder(),
                    product.getProductType() == ProductType.GIFT_CARD && VoucherRules.productMode(product) != null ? VoucherRules.productMode(product).name() : null,
                    product.getProductType() == ProductType.GIFT_CARD && VoucherRules.productScope(product) != null ? VoucherRules.productScope(product).name() : null,
                    product.getProductType() == ProductType.GIFT_CARD && VoucherRules.productFaceValueGross(product) != null ? VoucherRules.productFaceValueGross(product).doubleValue() : null,
                    product.getProductType() == ProductType.GIFT_CARD && product.getVoucherSessionTypes() != null
                            ? product.getVoucherSessionTypes().stream().map(type -> String.valueOf(type.getId())).toList() : List.of(),
                    product.getProductType() == ProductType.GIFT_CARD && product.getVoucherSessionTypes() != null
                            ? product.getVoucherSessionTypes().stream().map(type -> type.getName() == null ? "" : type.getName().trim()).filter(name -> !name.isBlank()).toList() : List.of()
            ));
        }
        return out;
    }

    private List<SessionType> productEligibleSessionTypes(GuestProduct product) {
        if (product == null) return List.of();
        if (product.getServiceGroup() != null && product.getServiceGroup().getId() != null
                && product.getCompany() != null && product.getCompany().getId() != null) {
            return sessionTypes.findAllByCompanyIdAndServiceGroupId(
                    product.getCompany().getId(), product.getServiceGroup().getId());
        }
        if (product.getEligibleSessionTypes() != null && !product.getEligibleSessionTypes().isEmpty()) {
            return product.getEligibleSessionTypes().stream().filter(Objects::nonNull).toList();
        }
        return product.getSessionType() == null ? List.of() : List.of(product.getSessionType());
    }

    private boolean productHasVisibleEligibleService(GuestProduct product, Long companyId, GuestUser guestUser) {
        List<SessionType> eligible = productEligibleSessionTypes(product);
        if (product != null && product.getServiceGroup() != null && eligible.isEmpty()) return false;
        if (eligible.isEmpty()) return true;
        return eligible.stream().anyMatch(type -> isVisibleInGuestServiceStep(companyId, type, guestUser));
    }

    private boolean productHasEligibleServiceAtLocation(GuestProduct product, Long locationId) {
        List<SessionType> eligible = productEligibleSessionTypes(product);
        if (product != null && product.getServiceGroup() != null && eligible.isEmpty()) return false;
        if (eligible.isEmpty() || locationId == null || guestLocations == null) return true;
        return eligible.stream().anyMatch(type -> guestLocations.isServiceAvailableAt(type, locationId));
    }

    private com.example.app.session.ServiceGroup publicGroup(SessionType type) {
        if (type == null || type.getCompany() == null
                || !featureAccess.areServiceGroupsEnabled(type.getCompany().getId())
                || type.getServiceGroup() == null || !type.getServiceGroup().isActive()) return null;
        return type.getServiceGroup();
    }

    @Transactional(readOnly = true)
    public GuestDtos.AvailabilityResponse availability(Long companyId, Long sessionTypeId, String dateText, GuestUser guestUser) {
        return availability(companyId, sessionTypeId, dateText, null, guestUser);
    }

    @Transactional(readOnly = true)
    public GuestDtos.AvailabilityResponse availability(Long companyId, Long sessionTypeId, String dateText, Long consultantId, GuestUser guestUser) {
        SimulatedTimeContext.set(companyId);
        LocalDate date = LocalDate.parse(dateText);
        SessionType type = sessionTypes.findById(sessionTypeId)
                .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        if (!isVisibleInGuestServiceStep(companyId, type, guestUser)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available in the guest app.");
        }
        GuestSettingsService.GuestBookingRules rules = guestSettings.bookingRules(companyId);
        if (!dateAllowedByReservationRules(companyId, date, rules)) {
            return new GuestDtos.AvailabilityResponse(String.valueOf(type.getId()), date.toString(), List.of());
        }
        Long requestedConsultantId = rules.employeeSelectionAllowed() ? consultantId : null;
        int durationMinutes = type.getDurationMinutes() == null ? 60 : type.getDurationMinutes();

        if (isGuestGroupService(type)) {
            List<GuestDtos.AvailabilitySlotResponse> groupSlots = guestGroupSessionSlots(companyId, type, date, requestedConsultantId, guestUser);
            return new GuestDtos.AvailabilityResponse(String.valueOf(type.getId()), date.toString(), groupSlots);
        }

        Map<String, GuestDtos.AvailabilitySlotResponse> merged = new LinkedHashMap<>();
        addSlotsFromBookableWindows(companyId, type, date, durationMinutes, requestedConsultantId, merged, rules);
        addSlotsFromWorkingHours(companyId, type, date, durationMinutes, requestedConsultantId, merged, rules);

        List<GuestDtos.AvailabilitySlotResponse> sorted = merged.values().stream()
                .sorted(Comparator.comparing(GuestDtos.AvailabilitySlotResponse::startsAt).thenComparing(GuestDtos.AvailabilitySlotResponse::endsAt))
                .toList();
        return new GuestDtos.AvailabilityResponse(String.valueOf(type.getId()), date.toString(), sorted);
    }

    @Transactional(readOnly = true)
    public GuestDtos.AvailabilityResponse availability(
            Long companyId,
            List<Long> sessionTypeIds,
            String dateText,
            Long consultantId,
            Long locationId,
            GuestUser guestUser
    ) {
        if (guestLocations == null) {
            return availability(companyId, sessionTypeIds, dateText, consultantId, guestUser);
        }
        requireSubscribedLocation(companyId, locationId, guestUser);
        Location location = guestLocations.resolveBookable(companyId, locationId);
        List<SessionType> chain = resolveGuestServiceChain(companyId, sessionTypeIds, guestUser);
        chain.forEach(type -> guestLocations.requireServiceAvailableAt(type, location));

        SimulatedTimeContext.set(companyId);
        LocalDate date = LocalDate.parse(dateText);
        GuestSettingsService.GuestBookingRules rules = guestSettings.bookingRules(companyId, location.getId());
        int totalDuration = chain.stream()
                .mapToInt(service -> Math.max(1, service.getDurationMinutes() == null ? 60 : service.getDurationMinutes()))
                .sum();
        double totalPrice = chain.stream().map(type -> sessionTypePriceGross(type, location.getId()))
                .reduce(BigDecimal.ZERO, BigDecimal::add).doubleValue();
        SessionType first = chain.get(0);
        if (!dateAllowedByReservationRules(companyId, date, rules)) {
            return new GuestDtos.AvailabilityResponse(
                    String.valueOf(first.getId()), dateText, List.of(),
                    chain.stream().map(type -> String.valueOf(type.getId())).toList(),
                    totalDuration, totalPrice, tenantCurrency(companyId)
            );
        }

        Long requestedConsultantId = rules.employeeSelectionAllowed() ? consultantId : null;
        if (chain.size() == 1 && isGuestGroupService(first)) {
            List<GuestDtos.AvailabilitySlotResponse> slots = guestGroupSessionSlots(
                    companyId, first, date, requestedConsultantId, guestUser, location.getId()
            );
            return new GuestDtos.AvailabilityResponse(
                    String.valueOf(first.getId()), dateText, slots,
                    List.of(String.valueOf(first.getId())),
                    totalDuration, totalPrice, tenantCurrency(companyId)
            );
        }
        if (chain.stream().anyMatch(this::isGuestGroupService)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group services cannot be combined in one public booking.");
        }
        if (chain.size() > 1 && !guestSettings.publicSettings(companyId).multipleServicesEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Multiple services are disabled for this tenant.");
        }

        Map<String, GuestDtos.AvailabilitySlotResponse> merged = new LinkedHashMap<>();
        if (chain.size() == 1) {
            int durationMinutes = Math.max(1, first.getDurationMinutes() == null ? 60 : first.getDurationMinutes());
            addSlotsFromBookableWindows(companyId, first, date, durationMinutes, requestedConsultantId, merged, rules, location.getId());
            addSlotsFromWorkingHours(companyId, first, date, durationMinutes, requestedConsultantId, merged, rules, location.getId());
        } else {
            List<SessionBookingController.BookingServiceRequest> requests = new ArrayList<>();
            for (int i = 0; i < chain.size(); i++) {
                requests.add(new SessionBookingController.BookingServiceRequest(chain.get(i).getId(), i, null));
            }
            for (GuestDtos.AvailabilitySlotResponse candidate : multiServiceCandidateSlots(
                    companyId, chain, date, totalDuration, requestedConsultantId, rules, location.getId())) {
                try {
                    String[] parts = candidate.slotId().split("\\|");
                    if (parts.length < 3) continue;
                    Long candidateConsultantId = parseOptionalConsultantId(parts[0]);
                    if (candidateConsultantId == null
                            || !consultantSupportsAll(candidateConsultantId, chain, companyId)
                            || !consultantAvailableAt(candidateConsultantId, companyId, location.getId())) continue;
                    LocalDateTime startsAt = LocalDateTime.parse(parts[1]);
                    SessionServicePlanService.Plan plan = bookingCreationService.validateServiceChainWindowAtLocation(
                            companyId, List.of(), candidateConsultantId, startsAt, requests,
                            SessionBookingCreationService.bookingExcludeIds((Long) null), location.getId()
                    );
                    merged.putIfAbsent(
                            availabilityMergeKey(plan.startTime(), plan.endTime()),
                            new GuestDtos.AvailabilitySlotResponse(
                                    slotToken(candidateConsultantId, plan.startTime(), plan.endTime()),
                                    plan.startTime().toString(), plan.endTime().toString(), true
                            )
                    );
                } catch (RuntimeException ignored) {
                    // Candidate is omitted unless the complete ordered chain fits.
                }
            }
        }

        return new GuestDtos.AvailabilityResponse(
                String.valueOf(first.getId()),
                dateText,
                merged.values().stream().sorted(Comparator.comparing(GuestDtos.AvailabilitySlotResponse::startsAt)).toList(),
                chain.stream().map(type -> String.valueOf(type.getId())).toList(),
                totalDuration,
                totalPrice,
                tenantCurrency(companyId)
        );
    }

    /** Shared ordered-chain availability used by mobile, widget and public booking. */
    @Transactional(readOnly = true)
    public GuestDtos.AvailabilityResponse availability(
            Long companyId,
            List<Long> sessionTypeIds,
            String dateText,
            Long consultantId,
            GuestUser guestUser
    ) {
        List<SessionType> chain = resolveGuestServiceChain(companyId, sessionTypeIds, guestUser);
        SessionType first = chain.get(0);
        if (chain.size() == 1) {
            GuestDtos.AvailabilityResponse legacy = availability(companyId, first.getId(), dateText, consultantId, guestUser);
            return new GuestDtos.AvailabilityResponse(
                    String.valueOf(first.getId()),
                    dateText,
                    legacy.slots(),
                    List.of(String.valueOf(first.getId())),
                    Math.max(1, first.getDurationMinutes() == null ? 60 : first.getDurationMinutes()),
                    sessionTypePriceGross(first).doubleValue(),
                    tenantCurrency(companyId)
            );
        }
        if (!guestSettings.publicSettings(companyId).multipleServicesEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Multiple services are disabled for this tenant.");
        }
        if (chain.stream().anyMatch(this::isGuestGroupService)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group services cannot be combined in one public booking.");
        }

        SimulatedTimeContext.set(companyId);
        LocalDate date = LocalDate.parse(dateText);
        GuestSettingsService.GuestBookingRules rules = guestSettings.bookingRules(companyId);
        int totalDuration = chain.stream()
                .mapToInt(service -> Math.max(1, service.getDurationMinutes() == null ? 60 : service.getDurationMinutes()))
                .sum();
        if (!dateAllowedByReservationRules(companyId, date, rules)) {
            return new GuestDtos.AvailabilityResponse(
                    String.valueOf(first.getId()),
                    date.toString(),
                    List.of(),
                    chain.stream().map(type -> String.valueOf(type.getId())).toList(),
                    totalDuration,
                    chain.stream().map(GuestCatalogService::sessionTypePriceGross)
                            .reduce(BigDecimal.ZERO, BigDecimal::add).doubleValue(),
                    tenantCurrency(companyId)
            );
        }
        Long requestedConsultantId = rules.employeeSelectionAllowed() ? consultantId : null;
        List<SessionBookingController.BookingServiceRequest> requests = new ArrayList<>();
        for (int i = 0; i < chain.size(); i++) {
            requests.add(new SessionBookingController.BookingServiceRequest(chain.get(i).getId(), i, null));
        }
        Map<String, GuestDtos.AvailabilitySlotResponse> slots = new LinkedHashMap<>();
        List<GuestDtos.AvailabilitySlotResponse> candidates = multiServiceCandidateSlots(
                companyId,
                chain,
                date,
                totalDuration,
                requestedConsultantId,
                rules,
                null
        );
        for (GuestDtos.AvailabilitySlotResponse candidate : candidates) {
            try {
                String[] parts = candidate.slotId().split("\\|");
                if (parts.length < 3) continue;
                Long candidateConsultantId = parseOptionalConsultantId(parts[0]);
                if (candidateConsultantId == null || !consultantSupportsAll(candidateConsultantId, chain, companyId)) continue;
                LocalDateTime startsAt = LocalDateTime.parse(parts[1]);
                SessionServicePlanService.Plan plan = bookingCreationService.validateServiceChainWindow(
                        companyId, List.of(), candidateConsultantId, startsAt, requests,
                        SessionBookingCreationService.bookingExcludeIds((Long) null)
                );
                slots.putIfAbsent(
                        availabilityMergeKey(plan.startTime(), plan.endTime()),
                        new GuestDtos.AvailabilitySlotResponse(
                                slotToken(candidateConsultantId, plan.startTime(), plan.endTime()),
                                plan.startTime().toString(),
                                plan.endTime().toString(),
                                true
                        )
                );
            } catch (RuntimeException ignored) {
                // Candidate is omitted unless the complete ordered chain fits.
            }
        }
        double totalPrice = chain.stream().map(GuestCatalogService::sessionTypePriceGross)
                .reduce(BigDecimal.ZERO, BigDecimal::add).doubleValue();
        return new GuestDtos.AvailabilityResponse(
                String.valueOf(first.getId()),
                dateText,
                slots.values().stream().sorted(Comparator.comparing(GuestDtos.AvailabilitySlotResponse::startsAt)).toList(),
                chain.stream().map(type -> String.valueOf(type.getId())).toList(),
                totalDuration,
                totalPrice,
                tenantCurrency(companyId)
        );
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.ConsultantResponse> consultants(
            Long companyId, List<Long> sessionTypeIds, Long locationId, GuestUser guestUser
    ) {
        if (guestLocations == null) return consultants(companyId, sessionTypeIds, guestUser);
        requireSubscribedLocation(companyId, locationId, guestUser);
        Location location = guestLocations.resolveBookable(companyId, locationId);
        List<SessionType> chain = resolveGuestServiceChain(companyId, sessionTypeIds, guestUser);
        chain.forEach(type -> guestLocations.requireServiceAvailableAt(type, location));
        if (!guestSettings.bookingRules(companyId, location.getId()).employeeSelectionAllowed()) return List.of();
        return supportedGuestConsultants(companyId, chain.get(0), location.getId()).stream()
                .filter(user -> chain.stream().allMatch(type -> consultantSupportsSessionType(user, type)))
                .map(u -> new GuestDtos.ConsultantResponse(String.valueOf(u.getId()), u.getFirstName(), u.getLastName(), u.getEmail()))
                .toList();
    }

    /** Validates an authenticated guest booking chain against one location (used by slot holds/orders). */
    @Transactional(readOnly = true)
    public Long requireGuestBookableLocation(
            Long companyId, Long locationId, List<Long> sessionTypeIds, GuestUser guestUser
    ) {
        if (guestLocations == null) return locationId;
        requireSubscribedLocation(companyId, locationId, guestUser);
        Location location = guestLocations.resolveBookable(companyId, locationId);
        List<SessionType> chain = resolveGuestServiceChain(companyId, sessionTypeIds, guestUser);
        chain.forEach(type -> guestLocations.requireServiceAvailableAt(type, location));
        return location.getId();
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.ConsultantResponse> consultants(Long companyId, List<Long> sessionTypeIds, GuestUser guestUser) {
        List<SessionType> chain = resolveGuestServiceChain(companyId, sessionTypeIds, guestUser);
        if (chain.size() > 1 && !guestSettings.publicSettings(companyId).multipleServicesEnabled()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Multiple services are disabled for this tenant.");
        }
        if (!guestSettings.bookingRules(companyId).employeeSelectionAllowed()) return List.of();
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .filter(this::isBookableGuestConsultant)
                .filter(user -> chain.stream().allMatch(type -> consultantSupportsSessionType(user, type)))
                .sorted(Comparator.comparing(user -> ((user.getFirstName() + " " + user.getLastName()).trim()), String.CASE_INSENSITIVE_ORDER))
                .map(user -> new GuestDtos.ConsultantResponse(String.valueOf(user.getId()), user.getFirstName(), user.getLastName(), user.getEmail()))
                .toList();
    }

    private List<SessionType> resolveGuestServiceChain(Long companyId, List<Long> sessionTypeIds, GuestUser guestUser) {
        List<Long> ids = sessionTypeIds == null ? List.of() : sessionTypeIds.stream().filter(Objects::nonNull).toList();
        if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one service is required.");
        List<SessionType> chain = new ArrayList<>();
        for (Long id : ids) {
            SessionType type = sessionTypes.findById(id)
                    .filter(candidate -> Objects.equals(candidate.getCompany().getId(), companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
            if (!isVisibleInGuestServiceStep(companyId, type, guestUser)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A selected service is not available in this booking channel.");
            }
            chain.add(type);
        }
        return List.copyOf(chain);
    }

    private List<GuestDtos.AvailabilitySlotResponse> multiServiceCandidateSlots(
            Long companyId,
            List<SessionType> chain,
            LocalDate date,
            int totalDurationMinutes,
            Long requiredConsultantId,
            GuestSettingsService.GuestBookingRules rules,
            Long locationId
    ) {
        Map<String, GuestDtos.AvailabilitySlotResponse> merged = new LinkedHashMap<>();
        int availabilityMinutes = totalDurationMinutes + finalServiceBreakMinutes(chain, locationId);
        DayOfWeek dayOfWeek = date.getDayOfWeek();

        List<BookableSlot> windows = (locationId == null ? bookableSlots.findAllForWidgetByCompanyId(companyId) : bookableSlots.findAllForWidgetByCompanyIdAndLocationId(companyId, locationId)).stream()
                .filter(slot -> slot.getConsultant() != null)
                .filter(slot -> slot.getConsultant().isActive())
                .filter(slot -> slot.getConsultant().isConsultant())
                .filter(slot -> requiredConsultantId == null
                        || Objects.equals(slot.getConsultant().getId(), requiredConsultantId))
                .filter(slot -> slot.getDayOfWeek() == dayOfWeek)
                .filter(slot -> slot.isIndefinite() || withinBookableDateRange(slot, date))
                .filter(slot -> chain.stream().allMatch(type -> consultantSupportsSessionType(slot.getConsultant(), type)))
                .sorted(Comparator.comparing((BookableSlot slot) -> slot.getConsultant().getId())
                        .thenComparing(BookableSlot::getStartTime))
                .toList();
        for (BookableSlot window : windows) {
            addMultiServiceCandidateStarts(
                    merged,
                    window.getConsultant().getId(),
                    date,
                    window.getStartTime(),
                    window.getEndTime(),
                    totalDurationMinutes,
                    availabilityMinutes,
                    companyId,
                    rules
            );
        }

        for (User consultant : supportedGuestConsultants(companyId, chain.get(0), locationId)) {
            if (requiredConsultantId != null && !Objects.equals(consultant.getId(), requiredConsultantId)) continue;
            if (!chain.stream().allMatch(type -> consultantSupportsSessionType(consultant, type))) continue;
            Optional<TimeWindow> workingWindow = resolveConsultantWorkingWindow(consultant, date, locationId);
            if (workingWindow.isEmpty()) continue;
            addMultiServiceCandidateStarts(
                    merged,
                    consultant.getId(),
                    date,
                    workingWindow.get().start(),
                    workingWindow.get().end(),
                    totalDurationMinutes,
                    availabilityMinutes,
                    companyId,
                    rules
            );
        }

        return merged.values().stream()
                .sorted(Comparator.comparing(GuestDtos.AvailabilitySlotResponse::startsAt)
                        .thenComparing(GuestDtos.AvailabilitySlotResponse::endsAt))
                .toList();
    }

    private void addMultiServiceCandidateStarts(
            Map<String, GuestDtos.AvailabilitySlotResponse> merged,
            Long consultantId,
            LocalDate date,
            LocalTime windowStart,
            LocalTime windowEnd,
            int totalDurationMinutes,
            int availabilityMinutes,
            Long companyId,
            GuestSettingsService.GuestBookingRules rules
    ) {
        for (LocalDateTime start : AvailabilityWindowGrid.starts(
                date,
                windowStart,
                windowEnd,
                availabilityMinutes,
                SLOT_GRID_MINUTES
        )) {
            if (!slotAllowedByReservationRules(companyId, start, rules)) continue;
            LocalDateTime end = start.plusMinutes(totalDurationMinutes);
            String id = slotToken(consultantId, start, end);
            merged.putIfAbsent(
                    consultantId + "|" + availabilityMergeKey(start, end),
                    new GuestDtos.AvailabilitySlotResponse(id, start.toString(), end.toString(), true)
            );
        }
    }

    private boolean consultantSupportsAll(Long consultantId, List<SessionType> chain, Long companyId) {
        return users.findById(consultantId)
                .filter(User::isActive)
                .filter(user -> Objects.equals(user.getCompany().getId(), companyId))
                .filter(this::isBookableGuestConsultant)
                .map(user -> chain.stream().allMatch(type -> consultantSupportsSessionType(user, type)))
                .orElse(false);
    }

    private static Long parseOptionalConsultantId(String raw) {
        try {
            if (raw == null || raw.isBlank() || "null".equalsIgnoreCase(raw)) return null;
            return Long.parseLong(raw.trim());
        } catch (Exception ex) {
            return null;
        }
    }

    @Transactional(readOnly = true)
    public List<GuestDtos.ConsultantResponse> consultants(Long companyId, Long sessionTypeId) {
        SessionType type = sessionTypes.findById(sessionTypeId)
                .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        if (!isGuestBookable(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not enabled for the guest app.");
        }
        if (!guestSettings.bookingRules(companyId).employeeSelectionAllowed()) {
            return List.of();
        }
        return supportedGuestConsultants(companyId, type).stream()
                .map(u -> new GuestDtos.ConsultantResponse(
                        String.valueOf(u.getId()),
                        u.getFirstName(),
                        u.getLastName(),
                        u.getEmail()
                ))
                .toList();
    }

    public ResolvedProduct resolveProduct(Long companyId, String productId) {
        return resolveProduct(companyId, productId, null, null);
    }

    /**
     * Resolves a service exposed by the public website widget.
     *
     * Website visibility is intentionally independent from guest-app visibility.
     * A tenant may expose a scheduled group session in the website widget while
     * keeping the same service hidden from Calendra Connect. Reusing
     * {@link #resolveProduct(Long, String, GuestUser)} here therefore caused the
     * widget to list a service successfully and then reject it while creating the
     * order with "This service is not available in the guest app.".
     */
    @Transactional(readOnly = true)
    public ResolvedProduct resolveWebsiteSessionProduct(Long companyId, Long sessionTypeId) {
        return resolveWebsiteSessionProduct(companyId, sessionTypeId, null);
    }

    @Transactional(readOnly = true)
    public ResolvedProduct resolveWebsiteSessionProduct(Long companyId, Long sessionTypeId, Long locationId) {
        if (sessionTypeId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing service identifier.");
        }
        SessionType type = sessionTypes.findById(sessionTypeId)
                .filter(candidate -> candidate.getCompany() != null
                        && Objects.equals(candidate.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        if (!type.isActive() || !type.isWidgetGroupBookingEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "This service is not available in the website widget."
            );
        }
        BigDecimal price = sessionTypePriceGross(type, locationId);
        String productType = type.getMaxParticipantsPerSession() == null
                ? "SESSION_SINGLE"
                : "CLASS_TICKET";
        return new ResolvedProduct(
                null,
                type,
                type.getName(),
                productType,
                price,
                tenantCurrency(companyId),
                true
        );
    }

    /**
     * Resolves a persisted wallet product for an order that was already created by tenant staff.
     *
     * Staff-side Client > Wallet purchases are intentionally allowed for active products even when
     * the product is hidden from the guest app. Once the invoice has been created, fulfillment must
     * also remain possible if guest visibility (or the active flag) is changed before payment.
     * Guest-app availability checks therefore do not belong in this post-payment resolution path.
     */
    @Transactional(readOnly = true)
    public ResolvedProduct resolveStaffWalletProduct(Long companyId, Long productId) {
        return resolveExistingWalletProduct(companyId, productId);
    }

    /**
     * Resolves the stored wallet product behind an order that already exists. This path is
     * intentionally independent of the current Ugodnosti switch: disabling the module blocks
     * new purchases and redemptions, but an already-captured payment must still be fulfilled so
     * we never leave a paid order without the benefit it purchased. The resulting entitlement
     * remains hidden while the module is disabled.
     */
    @Transactional(readOnly = true)
    public ResolvedProduct resolveExistingWalletProduct(Long companyId, Long productId) {
        if (productId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing product identifier.");
        }
        GuestProduct product = guestProducts.findByIdAndCompanyId(productId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        if (product.getCourse() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This product cannot be fulfilled as a wallet entitlement.");
        }
        return new ResolvedProduct(
                product,
                product.getSessionType(),
                product.getName(),
                product.getProductType() == null ? ProductType.PACK.name() : product.getProductType().name(),
                product.getPriceGross(),
                product.getCurrency(),
                product.isBookable()
        );
    }

    @Transactional(readOnly = true)
    public ResolvedProduct resolveProduct(Long companyId, String productId, GuestUser guestUser) {
        return resolveProduct(companyId, productId, null, guestUser);
    }

    @Transactional(readOnly = true)
    public ResolvedProduct resolveProduct(Long companyId, String productId, Long locationId, GuestUser guestUser) {
        requireSubscribedLocation(companyId, locationId, guestUser);
        if (productId == null || productId.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing product identifier.");
        if (productId.startsWith("session-")) {
            Long typeId = parseId(productId.substring("session-".length()));
            SessionType type = sessionTypes.findById(typeId)
                    .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
            if (!isVisibleInGuestServiceStep(companyId, type, guestUser)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available in the guest app.");
            }
            BigDecimal price = sessionTypePriceGross(type, locationId);
            return new ResolvedProduct(null, type, type.getName(), type.isWidgetGroupBookingEnabled() ? "CLASS_TICKET" : "SESSION_SINGLE", price, tenantCurrency(companyId), true);
        }
        assertEntitlementsEnabled(companyId);
        GuestProduct product = guestProducts.findByIdAndCompanyId(parseId(productId), companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found."));
        boolean coursesEnabled = courseModuleAccessService == null || courseModuleAccessService.isEnabled(companyId);
        boolean giftCardsEnabled = guestSettings.giftCardsEnabled(companyId);
        if (product.getProductType() == ProductType.GIFT_CARD && !giftCardsEnabled) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vouchers are disabled for this tenant.");
        }
        if (product.getCourse() != null || !product.isActive() || !product.isGuestVisible()
                || (product.getProductType() == ProductType.COURSE
                    && (!coursesEnabled || (product.getSessionType() == null && product.getServiceGroup() == null)))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This product is not available in the guest app.");
        }
        if (Boolean.FALSE.equals(guestSettings.billingEnabled(companyId)) && !product.isBookable()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Purchases are disabled for this tenant.");
        }
        // Course access products intentionally ignore booking-step visibility. Other
        // wallet products with an explicit multi-service scope are purchasable when at
        // least one eligible service is visible. Unrestricted memberships are wildcards.
        if (product.getProductType() != ProductType.COURSE
                && !productHasVisibleEligibleService(product, companyId, guestUser)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available in the guest app.");
        }
        return new ResolvedProduct(product, product.getSessionType(), product.getName(), product.getProductType().name(), product.getPriceGross(), product.getCurrency(), product.isBookable());
    }

    private boolean entitlementsEnabled(Long companyId) {
        return entitlementsModuleAccessService == null || entitlementsModuleAccessService.isEnabled(companyId);
    }

    private void assertEntitlementsEnabled(Long companyId) {
        if (entitlementsModuleAccessService != null) {
            entitlementsModuleAccessService.assertEnabled(companyId);
        }
    }

    public SlotPayload parseSlotId(String slotId) {
        try {
            String[] parts = slotId.split("\\|");
            return new SlotPayload(Long.parseLong(parts[0]), LocalDateTime.parse(parts[1]), LocalDateTime.parse(parts[2]));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid slot identifier.");
        }
    }


    public void assertSlotWithinReservationWindow(
            Long companyId,
            String slotId,
            GuestSettingsService.GuestBookingRules rules
    ) {
        LocalDateTime startsAt = slotStartFromToken(slotId);
        if (startsAt == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid slot identifier.");
        }
        if (!slotAllowedByReservationRules(companyId, startsAt, rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected slot is no longer bookable.");
        }
    }

    public SlotPayload requireBookableRescheduleSlot(
            Long companyId,
            Long sessionTypeId,
            String slotId,
            Long excludeBookingId,
            Long locationId,
            GuestUser guestUser
    ) {
        if (isGroupSlotToken(slotId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group-session slots cannot be used for rescheduling.");
        }
        SlotPayload slot = parseSlotId(slotId);
        if (slot.startsAt() == null || slot.endsAt() == null || !slot.endsAt().isAfter(slot.startsAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid slot identifier.");
        }
        SessionType type = sessionTypes.findById(sessionTypeId)
                .filter(t -> Objects.equals(t.getCompany().getId(), companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
        if (!isVisibleInGuestServiceStep(companyId, type, guestUser)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This service is not available in the guest app.");
        }
        if (isGuestGroupService(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group-session bookings cannot be rescheduled to a private slot.");
        }
        int durationMinutes = type.getDurationMinutes() == null ? 60 : type.getDurationMinutes();
        if (!slot.endsAt().equals(slot.startsAt().plusMinutes(durationMinutes))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected slot no longer matches the booking service duration.");
        }
        LocalDate slotDate = slot.startsAt().toLocalDate();
        GuestSettingsService.GuestBookingRules rules = guestSettings.bookingRules(companyId, locationId);
        if (!slotAllowedByReservationRules(companyId, slot.startsAt(), rules)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected slot is no longer bookable.");
        }
        User consultant = users.findByIdAndCompanyId(slot.consultantId(), companyId)
                .filter(User::isActive)
                .filter(this::isBookableGuestConsultant)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant not found."));
        if (!consultantSupportsSessionType(consultant, type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant does not offer this service.");
        }
        if (!consultantAvailableAt(consultant, locationId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consultant is not available at this location.");
        }
        if (!isSlotInsideConfiguredGuestAvailability(companyId, type, consultant, slot, durationMinutes, locationId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected slot is outside the current guest booking availability.");
        }
        try {
            bookingCreationService.validateBookingWindowAtLocation(
                    companyId,
                    List.of(),
                    consultant.getId(),
                    null,
                    slot.startsAt(),
                    slot.endsAt(),
                    type.getId(),
                    SessionBookingCreationService.bookingExcludeIds(excludeBookingId),
                    bookingCreationService.isSpacesEnabled(companyId),
                    bookingCreationService.isMultipleSessionsPerSpaceEnabled(companyId),
                    bookingCreationService.isMultipleClientsPerSessionEnabled(companyId),
                    false,
                    false,
                    locationId
            );
        } catch (ResponseStatusException ex) {
            if (HttpStatus.CONFLICT.equals(ex.getStatusCode())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Selected slot is no longer available. Please choose another time.");
            }
            throw ex;
        }
        return slot;
    }

    public GuestSettingsService.GuestBookingRules bookingRules(Long companyId) {
        return bookingRules(companyId, null);
    }

    public GuestSettingsService.GuestBookingRules bookingRules(Long companyId, Long locationId) {
        return guestSettings.bookingRules(companyId, locationId);
    }

    /**
     * Matches public widget semantics: consultants with no explicit session types are treated as offering every type.
     */
    private boolean consultantSupportsSessionType(User consultant, SessionType type) {
        if (consultant == null) {
            return false;
        }
        Set<SessionType> types = consultant.getTypes();
        if (types == null || types.isEmpty()) {
            return true;
        }
        return types.stream().anyMatch(t -> Objects.equals(t.getId(), type.getId()));
    }

    private boolean isBookableGuestConsultant(User user) {
        return user.isConsultant();
    }

    private List<User> supportedGuestConsultants(Long companyId, SessionType type) {
        return supportedGuestConsultants(companyId, type, null);
    }

    private List<User> supportedGuestConsultants(Long companyId, SessionType type, Long locationId) {
        List<User> candidates = locationId == null
                ? users.findActiveBookableByCompanyId(companyId)
                : users.findActiveBookableByCompanyIdAndLocationId(companyId, locationId);
        return candidates.stream()
                .filter(User::isActive)
                .filter(this::isBookableGuestConsultant)
                .filter(u -> consultantSupportsSessionType(u, type))
                .filter(u -> locationId == null || consultantAvailableAt(u, locationId))
                .sorted(Comparator.comparing(u -> ((u.getFirstName() + " " + u.getLastName()).trim()), String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    private boolean consultantAvailableAt(User consultant, Long locationId) {
        return locationId == null || consultantLocations == null || consultantLocations.isAvailableAt(consultant, locationId);
    }

    private boolean consultantAvailableAt(Long consultantId, Long companyId, Long locationId) {
        return users.findByIdAndCompanyIdAndActiveTrue(consultantId, companyId)
                .map(user -> consultantAvailableAt(user, locationId))
                .orElse(false);
    }

    private void addSlotsFromBookableWindows(Long companyId, SessionType type, LocalDate date, int durationMinutes,
                                             Long requiredConsultantId,
                                             Map<String, GuestDtos.AvailabilitySlotResponse> merged,
                                             GuestSettingsService.GuestBookingRules rules) {
        addSlotsFromBookableWindows(companyId, type, date, durationMinutes, requiredConsultantId, merged, rules, null);
    }

    private void addSlotsFromBookableWindows(Long companyId, SessionType type, LocalDate date, int durationMinutes,
                                             Long requiredConsultantId,
                                             Map<String, GuestDtos.AvailabilitySlotResponse> merged,
                                             GuestSettingsService.GuestBookingRules rules,
                                             Long locationId) {
        int availabilityMinutes = durationMinutes + serviceBreakMinutes(type, locationId);
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        List<BookableSlot> windows = (locationId == null ? bookableSlots.findAllForWidgetByCompanyId(companyId) : bookableSlots.findAllForWidgetByCompanyIdAndLocationId(companyId, locationId)).stream()
                .filter(slot -> slot.getConsultant() != null)
                .filter(slot -> slot.getConsultant().isActive())
                .filter(slot -> slot.getConsultant().isConsultant())
                .filter(slot -> requiredConsultantId == null
                        || Objects.equals(slot.getConsultant().getId(), requiredConsultantId))
                .filter(slot -> slot.getDayOfWeek() == dayOfWeek)
                .filter(slot -> slot.isIndefinite() || withinBookableDateRange(slot, date))
                .filter(slot -> consultantSupportsSessionType(slot.getConsultant(), type))
                .sorted(Comparator.comparing((BookableSlot s) -> s.getConsultant().getId()).thenComparing(BookableSlot::getStartTime))
                .toList();

        for (BookableSlot window : windows) {
            for (LocalDateTime start : AvailabilityWindowGrid.starts(
                    date, window.getStartTime(), window.getEndTime(), availabilityMinutes, SLOT_GRID_MINUTES)) {
                LocalDateTime end = start.plusMinutes(durationMinutes);
                if (!slotAllowedByReservationRules(companyId, start, rules)) {
                    continue;
                }
                if (isActuallyGuestBookable(companyId, window.getConsultant().getId(), start, end, type.getId(), locationId)) {
                    String id = slotToken(window.getConsultant().getId(), start, end);
                    merged.putIfAbsent(availabilityMergeKey(start, end), new GuestDtos.AvailabilitySlotResponse(id, start.toString(), end.toString(), true));
                }
            }
        }
    }

    private void addSlotsFromWorkingHours(Long companyId, SessionType type, LocalDate date, int durationMinutes,
                                          Long requiredConsultantId,
                                          Map<String, GuestDtos.AvailabilitySlotResponse> merged,
                                          GuestSettingsService.GuestBookingRules rules) {
        addSlotsFromWorkingHours(companyId, type, date, durationMinutes, requiredConsultantId, merged, rules, null);
    }

    private void addSlotsFromWorkingHours(Long companyId, SessionType type, LocalDate date, int durationMinutes,
                                          Long requiredConsultantId,
                                          Map<String, GuestDtos.AvailabilitySlotResponse> merged,
                                          GuestSettingsService.GuestBookingRules rules,
                                          Long locationId) {
        int availabilityMinutes = durationMinutes + serviceBreakMinutes(type, locationId);
        for (User consultant : supportedGuestConsultants(companyId, type, locationId)) {
            if (requiredConsultantId != null && !Objects.equals(consultant.getId(), requiredConsultantId)) {
                continue;
            }
            Optional<TimeWindow> dayWindow = resolveConsultantWorkingWindow(consultant, date, locationId);
            if (dayWindow.isEmpty()) {
                continue;
            }
            for (LocalDateTime start : AvailabilityWindowGrid.starts(
                    date, dayWindow.get().start(), dayWindow.get().end(), availabilityMinutes, SLOT_GRID_MINUTES)) {
                LocalDateTime end = start.plusMinutes(durationMinutes);
                if (!slotAllowedByReservationRules(companyId, start, rules)) {
                    continue;
                }
                if (isActuallyGuestBookable(companyId, consultant.getId(), start, end, type.getId(), locationId)) {
                    String id = slotToken(consultant.getId(), start, end);
                    merged.putIfAbsent(availabilityMergeKey(start, end), new GuestDtos.AvailabilitySlotResponse(id, start.toString(), end.toString(), true));
                }
            }
        }
    }


    private boolean isSlotInsideConfiguredGuestAvailability(
            Long companyId,
            SessionType type,
            User consultant,
            SlotPayload slot,
            int durationMinutes,
            Long locationId
    ) {
        LocalDate date = slot.startsAt().toLocalDate();
        int availabilityMinutes = durationMinutes + serviceBreakMinutes(type, locationId);
        if (isSlotInsideBookableWindow(companyId, type, consultant, slot, date, durationMinutes, availabilityMinutes, locationId)) {
            return true;
        }
        Optional<TimeWindow> workingWindow = resolveConsultantWorkingWindow(consultant, date, locationId);
        return workingWindow
                .map(window -> generatedSlotMatchesWindow(slot, window.start(), window.end(), durationMinutes, availabilityMinutes))
                .orElse(false);
    }

    private boolean isSlotInsideBookableWindow(
            Long companyId,
            SessionType type,
            User consultant,
            SlotPayload slot,
            LocalDate date,
            int durationMinutes,
            int availabilityMinutes,
            Long locationId
    ) {
        DayOfWeek dayOfWeek = date.getDayOfWeek();
        List<BookableSlot> configuredWindows = locationId == null
                ? bookableSlots.findAllForWidgetByCompanyId(companyId)
                : bookableSlots.findAllForWidgetByCompanyIdAndLocationId(companyId, locationId);
        return configuredWindows.stream()
                .filter(window -> window.getConsultant() != null)
                .filter(window -> Objects.equals(window.getConsultant().getId(), consultant.getId()))
                .filter(window -> window.getConsultant().isActive())
                .filter(window -> window.getConsultant().isConsultant())
                .filter(window -> window.getDayOfWeek() == dayOfWeek)
                .filter(window -> window.isIndefinite() || withinBookableDateRange(window, date))
                .filter(window -> consultantSupportsSessionType(window.getConsultant(), type))
                .anyMatch(window -> generatedSlotMatchesWindow(slot, window.getStartTime(), window.getEndTime(), durationMinutes, availabilityMinutes));
    }

    private boolean generatedSlotMatchesWindow(SlotPayload slot, LocalTime windowStart, LocalTime windowEnd, int durationMinutes, int availabilityMinutes) {
        if (windowStart == null || windowEnd == null || !windowEnd.isAfter(windowStart)) {
            return false;
        }
        for (LocalDateTime candidateStart : AvailabilityWindowGrid.starts(
                slot.startsAt().toLocalDate(), windowStart, windowEnd, availabilityMinutes, SLOT_GRID_MINUTES)) {
            LocalDateTime candidateEnd = candidateStart.plusMinutes(durationMinutes);
            if (candidateStart.equals(slot.startsAt()) && candidateEnd.equals(slot.endsAt())) {
                return true;
            }
        }
        return false;
    }

    private static LocalDateTime slotStartFromToken(String slotId) {
        if (slotId == null || slotId.isBlank()) return null;
        try {
            String[] parts = slotId.split("\\|");
            if (isGroupSlotToken(slotId)) {
                return parts.length >= 4 ? LocalDateTime.parse(parts[2]) : null;
            }
            return parts.length >= 3 ? LocalDateTime.parse(parts[1]) : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean dateAllowedByReservationRules(Long companyId, LocalDate date, GuestSettingsService.GuestBookingRules rules) {
        if (date == null || rules == null) return false;
        LocalDate today = timeService.localDate(tenantZoneId(companyId));
        if (date.isBefore(today)) return false;
        return !date.isAfter(today.plusDays(rules.maxAdvanceBookingDays()));
    }

    private boolean slotAllowedByReservationRules(Long companyId, LocalDateTime slotStart, GuestSettingsService.GuestBookingRules rules) {
        if (slotStart == null || rules == null) return false;
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
                tenantZoneId(companyId),
                timeService.localDateTime(tenantZoneId(companyId))
        );
    }

    private String tenantCurrency(Long companyId) {
        return "EUR";
    }

    private ZoneId tenantZoneId(Long companyId) {
        return zoneId;
    }

    private void requireSubscribedLocation(Long companyId, Long locationId, GuestUser guestUser) {
        if (guestUser == null || locationId == null || guestTenantService == null) return;
        guestTenantService.requireLocationSubscription(guestUser, companyId, locationId);
    }

    private boolean isActuallyGuestBookable(Long companyId, Long consultantId, LocalDateTime start, LocalDateTime end, Long typeId, Long locationId) {
        try {
            bookingCreationService.validateBookingWindowAtLocation(
                    companyId,
                    List.of(),
                    consultantId,
                    null,
                    start,
                    end,
                    typeId,
                    SessionBookingCreationService.bookingExcludeIds((Long) null),
                    bookingCreationService.isSpacesEnabled(companyId),
                    bookingCreationService.isMultipleSessionsPerSpaceEnabled(companyId),
                    bookingCreationService.isMultipleClientsPerSessionEnabled(companyId),
                    false,
                    false,
                    locationId
            );
            return true;
        } catch (ResponseStatusException ex) {
            return false;
        }
    }

    private static boolean withinBookableDateRange(BookableSlot slot, LocalDate date) {
        if (slot.getStartDate() != null && date.isBefore(slot.getStartDate())) {
            return false;
        }
        if (slot.getEndDate() != null && date.isAfter(slot.getEndDate())) {
            return false;
        }
        return true;
    }

    private Optional<TimeWindow> resolveConsultantWorkingWindow(User consultant, LocalDate date, Long locationId) {
        String raw = consultantLocations == null ? consultant.getWorkingHoursJson() : consultantLocations.workingHoursJsonFor(consultant, locationId);
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

    private boolean isVisibleInGuestServiceStep(Long companyId, SessionType type, GuestUser guestUser) {
        if (!isGuestBookable(type)) {
            return false;
        }
        if (!isGuestGroupService(type)) {
            return true;
        }
        return hasVisibleGuestGroupSession(companyId, type, guestUser);
    }

    private boolean isGuestGroupService(SessionType type) {
        return type != null && type.isGroupBookingEnabled() && type.getMaxParticipantsPerSession() != null;
    }

    private boolean hasVisibleGuestGroupSession(Long companyId, SessionType type, GuestUser guestUser) {
        LocalDateTime now = timeService.localDateTime(tenantZoneId(companyId), companyId);
        LocalDateTime to = now.plusMonths(6);
        return bookings.findPublicGroupSessionCandidates(companyId, type.getId(), now.toLocalDate().atStartOfDay(), to)
                .stream()
                .collect(java.util.stream.Collectors.groupingBy(this::groupKeyOf, LinkedHashMap::new, java.util.stream.Collectors.toList()))
                .values()
                .stream()
                .anyMatch(rows -> guestCanJoinGroupRows(type, rows, guestUser));
    }

    private List<GuestDtos.AvailabilitySlotResponse> guestGroupSessionSlots(
            Long companyId,
            SessionType type,
            LocalDate date,
            Long consultantId,
            GuestUser guestUser
    ) {
        return guestGroupSessionSlots(companyId, type, date, consultantId, guestUser, null);
    }

    private List<GuestDtos.AvailabilitySlotResponse> guestGroupSessionSlots(
            Long companyId,
            SessionType type,
            LocalDate date,
            Long consultantId,
            GuestUser guestUser,
            Long locationId
    ) {
        LocalDateTime from = date.atStartOfDay();
        LocalDateTime to = date.plusDays(1).atStartOfDay();
        return bookings.findPublicGroupSessionCandidates(companyId, type.getId(), from, to)
                .stream()
                .filter(row -> locationId == null || (row.getLocation() != null && Objects.equals(row.getLocation().getId(), locationId)))
                .collect(java.util.stream.Collectors.groupingBy(this::groupKeyOf, LinkedHashMap::new, java.util.stream.Collectors.toList()))
                .values()
                .stream()
                .map(rows -> toGuestGroupSlot(type, rows, consultantId, guestUser))
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(GuestDtos.AvailabilitySlotResponse::startsAt))
                .toList();
    }

    private GuestDtos.AvailabilitySlotResponse toGuestGroupSlot(
            SessionType type,
            List<SessionBooking> rows,
            Long consultantId,
            GuestUser guestUser
    ) {
        if (rows == null || rows.isEmpty()) return null;
        SessionBooking representative = rows.stream()
                .min(Comparator.comparing(SessionBooking::getId))
                .orElse(rows.get(0));
        if (representative.getStartTime() == null
                || !slotAllowedByReservationRules(
                representative.getCompany().getId(),
                representative.getStartTime(),
                guestSettings.bookingRules(representative.getCompany().getId()))) {
            return null;
        }
        if (consultantId != null) {
            Long bookingConsultantId = representative.getConsultant() == null ? null : representative.getConsultant().getId();
            if (!Objects.equals(bookingConsultantId, consultantId)) {
                return null;
            }
        }
        if (!guestCanJoinGroupRows(type, rows, guestUser)) {
            return null;
        }
        String slotId = groupSlotToken(representative.getId(), representative.getStartTime(), representative.getEndTime());
        return new GuestDtos.AvailabilitySlotResponse(
                slotId,
                representative.getStartTime().toString(),
                representative.getEndTime().toString(),
                true
        );
    }

    private boolean guestCanJoinGroupRows(SessionType type, List<SessionBooking> rows, GuestUser guestUser) {
        if (rows == null || rows.isEmpty()) return false;
        SessionBooking representative = rows.stream()
                .min(Comparator.comparing(SessionBooking::getId))
                .orElse(rows.get(0));
        if (representative.getStartTime() == null
                || !slotAllowedByReservationRules(
                representative.getCompany().getId(),
                representative.getStartTime(),
                guestSettings.bookingRules(representative.getCompany().getId()))) {
            return false;
        }
        boolean hasBlockingSessionRow = rows.stream()
                .anyMatch(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()));
        if (!hasBlockingSessionRow) {
            return false;
        }
        Integer maxParticipants = representative.getMaxParticipantsOverride() != null && representative.getMaxParticipantsOverride() > 0
                ? representative.getMaxParticipantsOverride()
                : type.getMaxParticipantsPerSession();
        Set<String> limitedEmails = parseGuestLimitUserEmails(type.getGuestLimitUserEmails());
        String guestEmail = normalizeEmail(guestUser == null ? null : guestUser.getEmail());
        if (!guestEmail.isBlank()) {
            boolean guestAlreadyBooked = rows.stream()
                    .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                    .map(SessionBooking::getClient)
                    .filter(Objects::nonNull)
                    .anyMatch(client -> guestEmail.equals(normalizeEmail(client.getEmail())));
            if (guestAlreadyBooked) {
                return false;
            }
        }
        boolean guestLimited = limitedEmails.contains(guestEmail);
        long totalBookedParticipants = rows.stream()
                .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .map(Client::getId)
                .distinct()
                .count();
        if (maxParticipants != null && totalBookedParticipants >= maxParticipants) {
            return false;
        }
        if (limitedEmails.isEmpty() || guestLimited || maxParticipants == null) {
            return true;
        }
        int publicLimit = Math.max(0, maxParticipants - limitedEmails.size());
        if (publicLimit <= 0) {
            return false;
        }
        long publicBookedParticipants = rows.stream()
                .filter(row -> SessionBookingStatus.isAvailabilityBlocking(row.getBookingStatus()))
                .map(SessionBooking::getClient)
                .filter(Objects::nonNull)
                .filter(client -> !limitedEmails.contains(normalizeEmail(client.getEmail())))
                .map(Client::getId)
                .distinct()
                .count();
        return publicBookedParticipants < publicLimit;
    }

    private Set<String> parseGuestLimitUserEmails(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        return raw.lines()
                .map(this::normalizeEmail)
                .filter(email -> email != null && !email.isBlank())
                .collect(java.util.stream.Collectors.toSet());
    }

    private String normalizeEmail(String email) {
        return email == null || email.isBlank() ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private String groupKeyOf(SessionBooking booking) {
        if (booking.getBookingGroupKey() != null && !booking.getBookingGroupKey().isBlank()) {
            return booking.getBookingGroupKey();
        }
        return "legacy-" + booking.getId();
    }

    public static boolean isGroupSlotToken(String slotId) {
        return slotId != null && slotId.startsWith("group|");
    }

    public static Long groupBookingIdFromSlotToken(String slotId) {
        if (!isGroupSlotToken(slotId)) return null;
        String[] parts = slotId.split("\\|");
        if (parts.length < 4) return null;
        try {
            return Long.parseLong(parts[1]);
        } catch (Exception ex) {
            return null;
        }
    }

    private static String groupSlotToken(Long representativeBookingId, LocalDateTime start, LocalDateTime end) {
        return "group|" + representativeBookingId + "|" + start + "|" + end;
    }

    private boolean isGuestBookable(SessionType type) {
        return type != null && type.isActive() && type.isGuestBookingEnabled();
    }

    public static String derivedProductId(SessionType type) {
        return "session-" + type.getId();
    }

    /**
     * Session types store per-linked-service net prices; guest checkout and app UI require gross.
     */

    private int serviceBreakMinutes(SessionType type, Long locationId) {
        if (type == null) return 0;
        if (locationId != null && breakSettings != null) {
            return Math.max(0, breakSettings.effectiveBreakMinutes(type, locationId));
        }
        return Math.max(0, type.getBreakMinutes() == null ? 0 : type.getBreakMinutes());
    }

    private int finalServiceBreakMinutes(List<SessionType> chain, Long locationId) {
        if (chain == null || chain.isEmpty()) return 0;
        return serviceBreakMinutes(chain.get(chain.size() - 1), locationId);
    }

    private BigDecimal sessionTypePriceGross(SessionType type, Long locationId) {
        if (type == null || type.getLinkedServices() == null || type.getLinkedServices().isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal total = BigDecimal.ZERO;
        for (TypeTransactionService link : type.getLinkedServices()) {
            if (link == null || link.getTransactionService() == null) continue;
            BigDecimal net = locationId != null && locationPrices != null
                    ? locationPrices.effectiveNet(link, locationId)
                    : (link.getPrice() != null ? link.getPrice() : link.getTransactionService().getNetPrice());
            if (net == null) net = BigDecimal.ZERO;
            BigDecimal multiplier = link.getTransactionService().getTaxRate() == null
                    ? BigDecimal.ZERO
                    : link.getTransactionService().getTaxRate().multiplier;
            total = total.add(net.add(net.multiply(multiplier)).setScale(2, java.math.RoundingMode.HALF_UP));
        }
        return total.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    public static BigDecimal sessionTypePriceGross(SessionType type) {
        if (type == null || type.getLinkedServices() == null || type.getLinkedServices().isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal total = BigDecimal.ZERO;
        for (TypeTransactionService link : type.getLinkedServices()) {
            if (link == null || link.getTransactionService() == null) {
                continue;
            }
            BigDecimal net = link.getPrice() != null ? link.getPrice() : link.getTransactionService().getNetPrice();
            if (net == null) {
                net = BigDecimal.ZERO;
            }
            BigDecimal multiplier = link.getTransactionService().getTaxRate() == null
                    ? BigDecimal.ZERO
                    : link.getTransactionService().getTaxRate().multiplier;
            BigDecimal gross = net.add(net.multiply(multiplier)).setScale(2, java.math.RoundingMode.HALF_UP);
            total = total.add(gross);
        }
        return total.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static String slotToken(Long consultantId, LocalDateTime start, LocalDateTime end) {
        return consultantId + "|" + start + "|" + end;
    }

    private static String availabilityMergeKey(LocalDateTime start, LocalDateTime end) {
        return start + "|" + end;
    }

    private static Long parseId(String raw) {
        try {
            return Long.parseLong(raw.trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid identifier.");
        }
    }

    public record ResolvedProduct(GuestProduct persistedProduct, SessionType sessionType, String name, String productType, BigDecimal priceGross, String currency, boolean bookable) {}
    public record SlotPayload(Long consultantId, LocalDateTime startsAt, LocalDateTime endsAt) {}
}
