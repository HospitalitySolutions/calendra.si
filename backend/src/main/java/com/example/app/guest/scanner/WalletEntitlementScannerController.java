package com.example.app.guest.scanner;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.client.Client;
import com.example.app.commerce.CommerceLocationScopeService;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.EntitlementType;
import com.example.app.guest.model.EntitlementUsageReason;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsage;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.guest.model.VoucherRules;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingCreationService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionType;
import com.example.app.settings.EntitlementsModuleAccessService;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.time.Instant;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/wallet-scanner")
public class WalletEntitlementScannerController {
    private static final long DUPLICATE_SCAN_COOLDOWN_SECONDS = 60;

    private final GuestEntitlementRepository entitlements;
    private final GuestEntitlementUsageRepository usages;
    private final SessionBookingCreationService bookingCreationService;
    private final SessionBookingRepository sessionBookings;
    private final GuestEntitlementService entitlementService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ActivityLogService activityLogs;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private CommerceLocationScopeService commerceLocations;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private LocationRepository locations;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private EntitlementsModuleAccessService entitlementsModuleAccessService;

    @org.springframework.beans.factory.annotation.Autowired
    public WalletEntitlementScannerController(
            GuestEntitlementRepository entitlements,
            GuestEntitlementUsageRepository usages,
            SessionBookingCreationService bookingCreationService,
            SessionBookingRepository sessionBookings,
            GuestEntitlementService entitlementService
    ) {
        this.entitlements = entitlements;
        this.usages = usages;
        this.bookingCreationService = bookingCreationService;
        this.sessionBookings = sessionBookings;
        this.entitlementService = entitlementService;
    }

    /** Backwards-compatible constructor used by focused unit tests. */
    public WalletEntitlementScannerController(
            GuestEntitlementRepository entitlements,
            GuestEntitlementUsageRepository usages,
            SessionBookingCreationService bookingCreationService,
            SessionBookingRepository sessionBookings
    ) {
        this(entitlements, usages, bookingCreationService, sessionBookings, null);
    }

    @GetMapping("/payment-options")
    @Transactional(readOnly = true)
    public List<PaymentEntitlementOptionResponse> paymentOptions(
            @RequestParam Long paymentBookingId,
            @RequestParam(required = false) Long paymentClientId,
            @AuthenticationPrincipal User me
    ) {
        assertEntitlementsEnabled(me == null || me.getCompany() == null ? null : me.getCompany().getId());
        if (!SecurityUtils.canScanWalletEntitlements(me)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to scan wallet entitlements.");
        }
        if (paymentBookingId == null) {
            return List.of();
        }
        SessionBooking booking = sessionBookings.findByIdAndCompanyId(paymentBookingId, me.getCompany().getId()).orElse(null);
        if (booking == null || booking.getClient() == null || booking.getClient().getId() == null) {
            return List.of();
        }
        if (usages.findBySessionBookingId(booking.getId()).isPresent()) {
            return List.of();
        }
        Long bookingTypeId = booking.getType() == null ? null : booking.getType().getId();
        if (bookingTypeId == null) {
            return List.of();
        }
        Long walletClientId = paymentClientId != null && paymentClientId > 0
                ? paymentClientId
                : booking.getClient().getId();
        Instant now = Instant.now();
        return entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(
                        walletClientId,
                        me.getCompany().getId(),
                        List.of(EntitlementStatus.ACTIVE)
                ).stream()
                .filter(entitlement -> entitlement.getEntitlementType() == EntitlementType.TICKET
                        || entitlement.getEntitlementType() == EntitlementType.PACK
                        || entitlement.getEntitlementType() == EntitlementType.MEMBERSHIP
                        || VoucherRules.isServiceVoucher(entitlement))
                .filter(entitlement -> entitlement.getEntitlementType() == EntitlementType.MEMBERSHIP
                        || (entitlement.getRemainingUses() != null && entitlement.getRemainingUses() > 0))
                .filter(entitlement -> entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now))
                .filter(entitlement -> entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now))
                .filter(entitlement -> booking.getLocation() == null || commerceLocations == null
                        || commerceLocations.entitlementAvailableAt(entitlement, booking.getLocation().getId()))
                .filter(entitlement -> entitlement.getProduct() != null
                        && (VoucherRules.isServiceVoucher(entitlement)
                            ? bookingHasSingleService(booking) && VoucherRules.entitlementAllowsService(entitlement, bookingTypeId)
                            : entitlement.getProduct().allowsSessionType(booking.getType())))
                .filter(entitlement -> firstUsableCode(entitlement) != null)
                .map(this::paymentOptionResponse)
                .toList();
    }

    @PostMapping("/scan")
    @Transactional
    public ScanResponse scan(@RequestBody ScanRequest request, @AuthenticationPrincipal User me) {
        assertEntitlementsEnabled(me == null || me.getCompany() == null ? null : me.getCompany().getId());
        if (!SecurityUtils.canScanWalletEntitlements(me)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to scan wallet entitlements.");
        }
        String scannedCode = extractEntitlementCode(request == null ? null : request.code());
        if (scannedCode == null || scannedCode.isBlank()) {
            return failure("INVALID_CODE", "Enter an entitlement code.", null);
        }

        Long companyId = me.getCompany().getId();
        GuestEntitlement entitlement = entitlements.findByEntitlementCode(scannedCode)
                .or(() -> entitlements.findFirstByDisplayCodeAndCompanyIdOrderByCreatedAtDesc(scannedCode, companyId))
                .orElse(null);
        if (entitlement == null) {
            return failure("INVALID_CODE", "No entitlement was found for this code.", null);
        }
        if (!Objects.equals(entitlement.getCompany().getId(), companyId)) {
            return failure("TENANT_MISMATCH", "This entitlement belongs to another tenant.", null);
        }

        Instant now = Instant.now();
        if (usages.existsByEntitlementIdAndReasonAndUsedAtAfter(
                entitlement.getId(),
                EntitlementUsageReason.QR_SCAN,
                now.minusSeconds(DUPLICATE_SCAN_COOLDOWN_SECONDS))) {
            return failure("DUPLICATE_SCAN", "This entitlement was scanned recently. Please wait before scanning it again.", entitlement);
        }

        ScanResponse invalidState = validateEntitlement(entitlement, now);
        if (invalidState != null) {
            return invalidState;
        }

        Long paymentBookingId = request == null ? null : request.paymentBookingId();
        if (paymentBookingId != null) {
            return scanIntoPaymentBooking(request, entitlement, me, now);
        }
        Long groupBookingId = request == null ? null : request.groupBookingId();
        if (groupBookingId != null) {
            return scanIntoGroupSession(request, entitlement, me, now);
        }

        StandaloneLocationResolution locationResolution = resolveStandaloneScanLocation(request, entitlement, companyId);
        if (locationResolution.error() != null) {
            return locationResolution.error();
        }

        if (VoucherRules.isValueVoucher(entitlement)) {
            return failure("UNSUPPORTED_ENTITLEMENT", "Value vouchers must be used as a payment method, not as a visit entitlement.", entitlement);
        }

        EntitlementType type = entitlement.getEntitlementType();
        Integer before;
        Integer after;
        String result;
        String message;

        if (type == EntitlementType.MEMBERSHIP) {
            before = currentVisitCount(entitlement);
            after = before;
            result = "MEMBERSHIP_VALIDATED";
            message = "Membership is valid. Visits are counted when a linked booking is checked out.";
        } else {
            Integer remaining = entitlement.getRemainingUses();
            if (remaining == null || remaining <= 0) {
                entitlement.setStatus(EntitlementStatus.USED_UP);
                entitlements.save(entitlement);
                return failure("NO_VISITS_REMAINING", "This entitlement has no visits remaining.", entitlement);
            }
            before = remaining;
            after = Math.max(0, remaining - 1);
            entitlement.setRemainingUses(after);
            if (after <= 0) {
                entitlement.setStatus(EntitlementStatus.USED_UP);
            }
            result = "VISIT_DEDUCTED";
            message = "Visit deducted.";
        }

        GuestEntitlementUsage usage = buildScanUsage(
                entitlement,
                null,
                locationResolution.location(),
                me,
                normalizeSource(request == null ? null : request.source()),
                before,
                after,
                now);
        if (type == EntitlementType.MEMBERSHIP) {
            // A standalone membership scan is an audit/validation event, not a completed visit.
            usage.setUnitsUsed(0);
        }
        usages.save(usage);
        entitlements.save(entitlement);
        if (VoucherRules.isServiceVoucher(entitlement)) {
            recordScannedVoucherRedemption(me, entitlement, usage);
        }

        return new ScanResponse(true, result, message, clientResponse(entitlement.getClient()), entitlementResponse(entitlement), null);
    }

    private void assertEntitlementsEnabled(Long companyId) {
        if (entitlementsModuleAccessService != null) {
            entitlementsModuleAccessService.assertEnabled(companyId);
        }
    }

    private ScanResponse scanIntoPaymentBooking(ScanRequest request, GuestEntitlement entitlement, User me, Instant now) {
        SessionBooking booking = sessionBookings.findByIdAndCompanyId(request.paymentBookingId(), me.getCompany().getId()).orElse(null);
        if (booking == null || booking.getClient() == null || booking.getClient().getId() == null) {
            return failure("PAYMENT_BOOKING_NOT_FOUND", "Selected session participant was not found.", entitlement);
        }
        if (!entitlementAvailableAt(entitlement, booking.getLocation())) {
            return failure("LOCATION_MISMATCH", "This entitlement is not valid at the booking location.", entitlement);
        }
        Long expectedWalletClientId = request.paymentClientId() != null && request.paymentClientId() > 0
                ? request.paymentClientId()
                : booking.getClient().getId();
        if (entitlement.getClient() == null || entitlement.getClient().getId() == null
                || !Objects.equals(entitlement.getClient().getId(), expectedWalletClientId)) {
            return failure("PAYMENT_CLIENT_MISMATCH", "This entitlement belongs to another guest.", entitlement);
        }
        GuestEntitlementUsage existingUsage = usages.findBySessionBookingId(booking.getId()).orElse(null);
        if (existingUsage != null) {
            if (existingUsage.getEntitlement() != null
                    && Objects.equals(existingUsage.getEntitlement().getId(), entitlement.getId())) {
                return new ScanResponse(
                        true,
                        "SESSION_ENTITLEMENT_ALREADY_APPLIED",
                        "This entitlement is already linked to the session and can be used to settle the open bill.",
                        clientResponse(entitlement.getClient()),
                        entitlementResponse(entitlement),
                        booking.getId()
                );
            }
            return failure("ALREADY_PAID_WITH_ENTITLEMENT", "This participant was already paid with another entitlement.", entitlement);
        }

        EntitlementType type = entitlement.getEntitlementType();
        if (type != EntitlementType.TICKET && type != EntitlementType.PACK && type != EntitlementType.MEMBERSHIP
                && !VoucherRules.isServiceVoucher(entitlement)) {
            return failure("UNSUPPORTED_PAYMENT_ENTITLEMENT", "Only class tickets, packs, memberships and service vouchers can cover a session.", entitlement);
        }
        if (VoucherRules.isServiceVoucher(entitlement) && !bookingHasSingleService(booking)) {
            return failure("UNSUPPORTED_PAYMENT_ENTITLEMENT", "A service voucher cannot settle a combined multi-service bill from this screen.", entitlement);
        }

        ScanResponse serviceValidation = validateBookingPaymentServiceType(booking, entitlement);
        if (serviceValidation != null) {
            return serviceValidation;
        }

        // Payment selection is validation-only. The entitlement is consumed atomically when the
        // open bill is settled, so closing the picker or abandoning the invoice cannot burn a visit.
        return new ScanResponse(
                true,
                "SESSION_ENTITLEMENT_VALIDATED",
                "Entitlement can cover this session.",
                clientResponse(entitlement.getClient()),
                entitlementResponse(entitlement),
                booking.getId()
        );
    }

    private ScanResponse scanIntoGroupSession(ScanRequest request, GuestEntitlement entitlement, User me, Instant now) {
        SessionBooking groupSession = sessionBookings.findByIdAndCompanyId(request.groupBookingId(), me.getCompany().getId()).orElse(null);
        if (groupSession != null && !entitlementAvailableAt(entitlement, groupSession.getLocation())) {
            return failure("LOCATION_MISMATCH", "This entitlement is not valid at the group session location.", entitlement);
        }
        ScanResponse groupValidation = validateGroupScanServiceType(groupSession, entitlement);
        if (groupValidation != null) {
            return groupValidation;
        }

        EntitlementType type = entitlement.getEntitlementType();
        if (type != EntitlementType.TICKET && type != EntitlementType.PACK) {
            return failure("UNSUPPORTED_ENTITLEMENT", "Only class tickets and packs can be scanned into a group session.", entitlement);
        }
        Integer remaining = entitlement.getRemainingUses();
        if (remaining == null || remaining <= 0) {
            entitlement.setStatus(EntitlementStatus.USED_UP);
            entitlements.save(entitlement);
            return failure("NO_VISITS_REMAINING", "This entitlement has no visits remaining.", entitlement);
        }
        if (entitlement.getClient() == null || entitlement.getClient().getId() == null) {
            return failure("INVALID_CODE", "This entitlement is not linked to a client.", entitlement);
        }

        SessionBooking joined = bookingCreationService.joinClientToGroupSession(new SessionBookingCreationService.GroupJoinRequest(
                me.getCompany().getId(),
                request.groupBookingId(),
                entitlement.getClient().getId(),
                "WALLET_SCANNER",
                null,
                null,
                "RESERVED",
                false
        ));

        Integer before = remaining;
        Integer after = Math.max(0, remaining - 1);
        entitlement.setRemainingUses(after);
        if (after <= 0) {
            entitlement.setStatus(EntitlementStatus.USED_UP);
        }
        GuestEntitlementUsage usage = buildScanUsage(entitlement, joined, joined.getLocation(), me, normalizeSource(request.source()), before, after, now);
        usages.save(usage);
        entitlements.save(entitlement);

        return new ScanResponse(
                true,
                "GROUP_MEMBER_ADDED",
                "Guest added to group session and visit deducted.",
                clientResponse(entitlement.getClient()),
                entitlementResponse(entitlement),
                joined.getId()
        );
    }


    private StandaloneLocationResolution resolveStandaloneScanLocation(ScanRequest request, GuestEntitlement entitlement, Long companyId) {
        if (commerceLocations == null || locations == null) {
            return new StandaloneLocationResolution(null,
                    failure("LOCATION_UNAVAILABLE", "Location configuration is unavailable.", entitlement));
        }
        Long requestedLocationId = request == null ? null : request.locationId();
        Location selected;
        if (requestedLocationId != null) {
            selected = locations.findByIdAndCompanyId(requestedLocationId, companyId)
                    .filter(Location::isActive)
                    .orElse(null);
            if (selected == null) {
                return new StandaloneLocationResolution(null,
                        failure("LOCATION_MISMATCH", "Selected location is invalid or inactive.", entitlement));
            }
        } else {
            List<Location> eligible = locations.findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(companyId).stream()
                    .filter(location -> commerceLocations.entitlementAvailableAt(entitlement, location.getId()))
                    .toList();
            if (eligible.size() == 1) {
                selected = eligible.getFirst();
            } else if (eligible.isEmpty()) {
                return new StandaloneLocationResolution(null,
                        failure("LOCATION_MISMATCH", "This entitlement is not valid at any active location.", entitlement));
            } else {
                return new StandaloneLocationResolution(null,
                        failure("LOCATION_REQUIRED", "Select the location where the entitlement is being used.", entitlement));
            }
        }
        if (!entitlementAvailableAt(entitlement, selected)) {
            return new StandaloneLocationResolution(null,
                    failure("LOCATION_MISMATCH", "This entitlement is not valid at the selected location.", entitlement));
        }
        return new StandaloneLocationResolution(selected, null);
    }

    private boolean entitlementAvailableAt(GuestEntitlement entitlement, Location location) {
        return location == null || commerceLocations == null || commerceLocations.entitlementAvailableAt(entitlement, location.getId());
    }

    private ScanResponse validateBookingPaymentServiceType(SessionBooking booking, GuestEntitlement entitlement) {
        if (booking == null) {
            return failure("PAYMENT_BOOKING_NOT_FOUND", "Selected session participant was not found.", entitlement);
        }
        SessionType bookingType = booking.getType();
        if (bookingType == null || bookingType.getId() == null) {
            return failure("PAYMENT_BOOKING_NOT_FOUND", "Selected session has no service type.", entitlement);
        }
        if (entitlement.getProduct() == null) {
            return failure(
                    "SERVICE_TYPE_MISMATCH",
                    "This entitlement has no product configuration.",
                    entitlement
            );
        }
        // Non-voucher wallet products may cover one or several services. A membership with
        // no configured service scope remains a wildcard entitlement for backwards compatibility.
        boolean matches = VoucherRules.isServiceVoucher(entitlement)
                ? VoucherRules.entitlementAllowsService(entitlement, bookingType.getId())
                : entitlement.getProduct().allowsSessionType(bookingType);
        if (!matches) {
            return failure(
                    "SERVICE_TYPE_MISMATCH",
                    "This entitlement is for a different service type than this session.",
                    entitlement
            );
        }
        return null;
    }

    private static boolean bookingHasSingleService(SessionBooking booking) {
        if (booking == null) return false;
        if (booking.getServices() == null || booking.getServices().isEmpty()) return booking.getType() != null;
        return booking.getServices().size() == 1;
    }

    private ScanResponse validateGroupScanServiceType(SessionBooking groupSession, GuestEntitlement entitlement) {
        if (groupSession == null) {
            return failure("GROUP_JOIN_FAILED", "Selected group session was not found.", entitlement);
        }
        if (groupSession.getClientGroup() == null) {
            return failure("GROUP_JOIN_FAILED", "Selected session is not a group session.", entitlement);
        }
        SessionType groupSessionType = groupSession.getType();
        if (groupSessionType == null || groupSessionType.getId() == null) {
            return failure("GROUP_JOIN_FAILED", "Selected group session has no service type.", entitlement);
        }
        if (entitlement.getProduct() == null) {
            return failure(
                    "SERVICE_TYPE_MISMATCH",
                    "This ticket or pack has no product configuration.",
                    entitlement
            );
        }
        boolean matches = VoucherRules.isServiceVoucher(entitlement)
                ? VoucherRules.entitlementAllowsService(entitlement, groupSessionType.getId())
                : entitlement.getProduct().allowsSessionType(groupSessionType);
        if (!matches) {
            return failure(
                    "SERVICE_TYPE_MISMATCH",
                    "This ticket or pack is for a different service type than this group session.",
                    entitlement
            );
        }
        return null;
    }

    private GuestEntitlementUsage buildScanUsage(
            GuestEntitlement entitlement,
            SessionBooking booking,
            Location location,
            User me,
            String source,
            Integer before,
            Integer after,
            Instant now
    ) {
        GuestEntitlementUsage usage = new GuestEntitlementUsage();
        usage.setEntitlement(entitlement);
        usage.setSessionBooking(booking);
        Location resolvedLocation = location != null ? location : booking == null ? null : booking.getLocation();
        if (resolvedLocation == null || resolvedLocation.getId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location is required for wallet entitlement usage.");
        }
        usage.setLocation(resolvedLocation);
        usage.setReason(EntitlementUsageReason.QR_SCAN);
        usage.setUsedAt(now);
        usage.setUnitsUsed(1);
        usage.setScanSource(source);
        usage.setScannedBy(me);
        usage.setUnitsBefore(before);
        usage.setUnitsAfter(after);
        return usage;
    }

    private record StandaloneLocationResolution(Location location, ScanResponse error) {}

    private ScanResponse validateEntitlement(GuestEntitlement entitlement, Instant now) {
        if (entitlement.getStatus() == EntitlementStatus.EXPIRED
                || (entitlement.getValidUntil() != null && !entitlement.getValidUntil().isAfter(now))) {
            entitlement.setStatus(EntitlementStatus.EXPIRED);
            entitlements.save(entitlement);
            return failure("EXPIRED", "This entitlement is expired.", entitlement);
        }
        if (entitlement.getValidFrom() != null && entitlement.getValidFrom().isAfter(now)) {
            return failure("NOT_YET_VALID", "This entitlement is not valid yet.", entitlement);
        }
        if (entitlement.getStatus() == EntitlementStatus.USED_UP
                || (entitlement.getEntitlementType() != EntitlementType.MEMBERSHIP
                && (entitlement.getRemainingUses() == null || entitlement.getRemainingUses() <= 0))) {
            entitlement.setStatus(EntitlementStatus.USED_UP);
            entitlements.save(entitlement);
            return failure("NO_VISITS_REMAINING", "This entitlement has no visits remaining.", entitlement);
        }
        if (entitlement.getStatus() != EntitlementStatus.ACTIVE) {
            return failure("INACTIVE", "This entitlement is not active.", entitlement);
        }
        return null;
    }

    private ScanResponse failure(String result, String message, GuestEntitlement entitlement) {
        return new ScanResponse(
                false,
                result,
                message,
                entitlement == null ? null : clientResponse(entitlement.getClient()),
                entitlement == null ? null : entitlementResponse(entitlement),
                null);
    }


    private static String extractEntitlementCode(String rawCode) {
        if (rawCode == null) return null;
        String value = rawCode.trim();
        if (value.isBlank()) return null;

        String fromUri = extractEntitlementCodeFromUri(value);
        if (fromUri != null && !fromUri.isBlank()) {
            return fromUri.trim();
        }
        return value;
    }

    private static String extractEntitlementCodeFromUri(String value) {
        if (!value.contains("://") && !value.contains("?")) {
            return null;
        }
        try {
            URI uri = URI.create(value);
            String query = uri.getRawQuery();
            String fromQuery = extractQueryValue(query, "entitlementCode");
            if (fromQuery == null) fromQuery = extractQueryValue(query, "code");
            if (fromQuery == null) fromQuery = extractQueryValue(query, "token");
            if (fromQuery != null && !fromQuery.isBlank()) return fromQuery;

            String path = uri.getPath();
            if (path != null && !path.isBlank()) {
                String last = path.substring(path.lastIndexOf('/') + 1);
                if (!last.isBlank()) {
                    return URLDecoder.decode(last, StandardCharsets.UTF_8);
                }
            }
        } catch (Exception ignored) {
            int codeIndex = value.indexOf("code=");
            if (codeIndex >= 0) {
                String candidate = value.substring(codeIndex + 5);
                int ampIndex = candidate.indexOf('&');
                if (ampIndex >= 0) candidate = candidate.substring(0, ampIndex);
                return URLDecoder.decode(candidate, StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static String extractQueryValue(String rawQuery, String key) {
        if (rawQuery == null || rawQuery.isBlank() || key == null || key.isBlank()) return null;
        String prefix = key + "=";
        for (String part : rawQuery.split("&")) {
            if (part.startsWith(prefix)) {
                return URLDecoder.decode(part.substring(prefix.length()), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static String normalizeSource(String source) {
        if ("manual".equalsIgnoreCase(source)) return "MANUAL";
        if ("wallet".equalsIgnoreCase(source)) return "WALLET";
        return "QR";
    }

    private static ScanClientResponse clientResponse(Client client) {
        if (client == null) return null;
        return new ScanClientResponse(client.getId(), client.getFirstName(), client.getLastName(), client.getEmail(), client.getPhone());
    }

    private ScanEntitlementResponse entitlementResponse(GuestEntitlement entitlement) {
        if (entitlement == null) return null;
        return new ScanEntitlementResponse(
                entitlement.getId(),
                firstUsableCode(entitlement),
                entitlement.getProduct() == null ? null : entitlement.getProduct().getName(),
                entitlement.getEntitlementType() == null ? null : entitlement.getEntitlementType().name(),
                entitlement.getRemainingUses(),
                entitlement.getProduct() == null ? null : entitlement.getProduct().getUsageLimit(),
                currentVisitCount(entitlement),
                entitlement.getValidUntil(),
                entitlement.getStatus() == null ? null : entitlement.getStatus().name(),
                VoucherRules.entitlementMode(entitlement) == null ? null : VoucherRules.entitlementMode(entitlement).name(),
                VoucherRules.entitlementScope(entitlement) == null ? null : VoucherRules.entitlementScope(entitlement).name(),
                VoucherRules.isValueVoucher(entitlement) ? entitlement.getRemainingValueGross() : null,
                List.copyOf(VoucherRules.entitlementEligibleServiceNames(entitlement)));
    }

    private int currentVisitCount(GuestEntitlement entitlement) {
        if (entitlement == null) return 0;
        if (entitlement.getEntitlementType() != EntitlementType.MEMBERSHIP || entitlementService == null) {
            return Math.max(0, entitlement.getVisitCount());
        }
        return entitlementService.membershipVisitCount(entitlement);
    }

    private void recordScannedVoucherRedemption(User actor, GuestEntitlement entitlement, GuestEntitlementUsage usage) {
        if (activityLogs == null || actor == null || entitlement == null) return;
        try {
            Client client = entitlement.getClient();
            String clientName = client == null ? null : ((client.getFirstName() == null ? "" : client.getFirstName().trim())
                    + " " + (client.getLastName() == null ? "" : client.getLastName().trim())).trim();
            if (clientName != null && clientName.isBlank()) clientName = client.getEmail();
            String code = entitlement.getDisplayCode() == null || entitlement.getDisplayCode().isBlank()
                    ? entitlement.getEntitlementCode()
                    : entitlement.getDisplayCode();
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("voucherMode", "SERVICE");
            details.put("code", code);
            details.put("scanSource", usage == null ? null : usage.getScanSource());
            details.put("remainingUses", entitlement.getRemainingUses());
            activityLogs.recordUser(
                    actor, ActivityModule.BILLING, ActivityAction.VOUCHER_REDEEMED,
                    "VOUCHER", entitlement.getId(), entitlement.getProduct() == null ? "Service voucher" : entitlement.getProduct().getName(),
                    client == null ? null : "CLIENT", client == null ? null : client.getId(), clientName,
                    "Redeemed service voucher by scanner", null, null, details);
        } catch (Exception ignored) {
            // Scanning/redemption must not fail because audit logging is unavailable.
        }
    }

    private PaymentEntitlementOptionResponse paymentOptionResponse(GuestEntitlement entitlement) {
        return new PaymentEntitlementOptionResponse(
                entitlement.getId(),
                firstUsableCode(entitlement),
                entitlement.getDisplayCode(),
                entitlement.getProduct() == null ? null : entitlement.getProduct().getName(),
                entitlement.getEntitlementType() == null ? null : entitlement.getEntitlementType().name(),
                entitlement.getRemainingUses(),
                entitlement.getProduct() == null ? null : entitlement.getProduct().getUsageLimit(),
                entitlement.getValidUntil(),
                VoucherRules.entitlementMode(entitlement) == null ? null : VoucherRules.entitlementMode(entitlement).name(),
                VoucherRules.entitlementScope(entitlement) == null ? null : VoucherRules.entitlementScope(entitlement).name(),
                VoucherRules.isValueVoucher(entitlement) ? entitlement.getRemainingValueGross() : null,
                List.copyOf(VoucherRules.entitlementEligibleServiceNames(entitlement))
        );
    }

    private static String firstUsableCode(GuestEntitlement entitlement) {
        if (entitlement == null) return null;
        if (entitlement.getEntitlementType() == EntitlementType.GIFT_CARD
                && entitlement.getDisplayCode() != null
                && !entitlement.getDisplayCode().isBlank()) {
            return entitlement.getDisplayCode();
        }
        if (entitlement.getEntitlementCode() != null && !entitlement.getEntitlementCode().isBlank()) {
            return entitlement.getEntitlementCode();
        }
        if (entitlement.getDisplayCode() != null && !entitlement.getDisplayCode().isBlank()) {
            return entitlement.getDisplayCode();
        }
        return null;
    }

    public record PaymentEntitlementOptionResponse(
            Long id,
            String code,
            String displayCode,
            String productName,
            String entitlementType,
            Integer remainingUses,
            Integer totalUses,
            Instant validUntil,
            String voucherMode,
            String voucherScope,
            BigDecimal remainingValueGross,
            List<String> eligibleServiceNames
    ) {
    }

    public record ScanRequest(String code, String source, Long groupBookingId, Long paymentBookingId, Long paymentClientId, Long locationId) {
        public ScanRequest(String code, String source, Long groupBookingId, Long paymentBookingId, Long paymentClientId) {
            this(code, source, groupBookingId, paymentBookingId, paymentClientId, null);
        }
    }

    public record ScanResponse(
            boolean success,
            String result,
            String message,
            ScanClientResponse client,
            ScanEntitlementResponse entitlement,
            Long bookingId
    ) {
    }

    public record ScanClientResponse(Long id, String firstName, String lastName, String email, String phone) {
    }

    public record ScanEntitlementResponse(
            Long id,
            String code,
            String productName,
            String entitlementType,
            Integer remainingUses,
            Integer totalUses,
            Integer visitCount,
            Instant validUntil,
            String status,
            String voucherMode,
            String voucherScope,
            BigDecimal remainingValueGross,
            List<String> eligibleServiceNames
    ) {
    }
}
