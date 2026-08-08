package com.example.app.guest.order;

import com.example.app.client.Client;
import com.example.app.company.CompanyRepository;
import com.example.app.course.CourseAccessEmailService;
import com.example.app.course.MembershipCourse;
import com.example.app.course.MembershipCourseRepository;
import com.example.app.common.TimeService;
import com.example.app.guest.model.*;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionService;
import com.example.app.session.SessionType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestEntitlementService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<EntitlementStatus> ACTIVE_STATUSES = List.of(EntitlementStatus.ACTIVE);
    private static final char[] OPAQUE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom OPAQUE_CODE_RANDOM = new SecureRandom();

    private final GuestEntitlementRepository entitlements;
    private final GuestEntitlementUsageRepository usages;
    private final TimeService timeService;
    private final MembershipCourseRepository membershipCourses;
    private final CourseAccessEmailService courseAccessEmailService;
    private final CompanyRepository companies;

    @Autowired(required = false)
    private GiftCardEmailService giftCardEmailService;

    private final String publicBaseUrl;

    @Autowired
    public GuestEntitlementService(
            GuestEntitlementRepository entitlements,
            GuestEntitlementUsageRepository usages,
            TimeService timeService,
            MembershipCourseRepository membershipCourses,
            CourseAccessEmailService courseAccessEmailService,
            CompanyRepository companies,
            @Value("${app.public-base-url:}") String publicBaseUrl
    ) {
        this.entitlements = entitlements;
        this.usages = usages;
        this.timeService = timeService;
        this.membershipCourses = membershipCourses;
        this.courseAccessEmailService = courseAccessEmailService;
        this.companies = companies;
        this.publicBaseUrl = publicBaseUrl;
    }

    /** Backwards-compatible constructor used by older unit tests. */
    public GuestEntitlementService(GuestEntitlementRepository entitlements, GuestEntitlementUsageRepository usages, TimeService timeService) {
        this(entitlements, usages, timeService, null, null, null, "");
    }

    /** One selected booking service used when resolving voucher codes before checkout. */
    public record VoucherSelectionLine(int position, Long sessionTypeId) {}

    /** Exact SERVICE voucher assignment returned to public booking clients. */
    public record VoucherServiceAssignment(int position, Long sessionTypeId, Long entitlementId, String code) {}

    /** Non-consuming description of a voucher code. */
    public record VoucherCodeResolution(
            String code,
            Long entitlementId,
            VoucherRedemptionMode mode,
            BigDecimal remainingValueGross,
            BigDecimal faceValueGross,
            Set<String> eligibleServiceNames
    ) {}

    /** Result of classifying voucher codes for the selected service chain. */
    public record VoucherResolution(
            List<VoucherCodeResolution> vouchers,
            List<VoucherServiceAssignment> serviceAssignments,
            List<String> valueVoucherCodes
    ) {}

    /** Payable amount attributed to one exact service position after service-entitlement/deposit rules. */
    public record VoucherChargeLine(int position, Long sessionTypeId, BigDecimal amountGross) {
        /** Backwards-compatible convenience constructor for callers that do not track positions. */
        public VoucherChargeLine(Long sessionTypeId, BigDecimal amountGross) {
            this(-1, sessionTypeId, amountGross);
        }
    }

    /**
     * Resolves public voucher codes without consuming anything. SERVICE vouchers are matched to
     * exact service positions; VALUE vouchers remain code-based and are applied later at checkout.
     * A small augmenting-path matcher avoids greedy failures when two vouchers have overlapping
     * eligible-service sets.
     */
    @Transactional(readOnly = true)
    public VoucherResolution resolveVoucherCodesForServices(
            Client client,
            Long companyId,
            List<VoucherSelectionLine> selectedServices,
            String currency,
            List<String> rawCodes
    ) {
        List<String> codes = normalizeGiftCardCodes(rawCodes);
        if (codes.isEmpty()) {
            return new VoucherResolution(List.of(), List.of(), List.of());
        }
        if (client == null || companyId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher owner is not available.");
        }
        List<VoucherSelectionLine> services = selectedServices == null ? List.of() : selectedServices.stream()
                .filter(Objects::nonNull)
                .filter(line -> line.sessionTypeId() != null)
                .sorted(Comparator.comparingInt(VoucherSelectionLine::position))
                .toList();
        if (services.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one service is required to use a voucher.");
        }

        List<GuestEntitlement> resolved = new ArrayList<>();
        List<VoucherCodeResolution> summaries = new ArrayList<>();
        for (String code : codes) {
            GuestEntitlement entitlement = findGiftCardByVisibleCode(code, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher code is not valid: " + code));
            validateVoucherForResolution(entitlement, client, companyId, currency);
            resolved.add(entitlement);
            summaries.add(new VoucherCodeResolution(
                    code,
                    entitlement.getId(),
                    VoucherRules.entitlementMode(entitlement),
                    entitlement.getRemainingValueGross() == null ? null : entitlement.getRemainingValueGross().setScale(2, RoundingMode.HALF_UP),
                    VoucherRules.entitlementFaceValueGross(entitlement),
                    VoucherRules.entitlementEligibleServiceNames(entitlement)
            ));
        }

        List<Integer> serviceVoucherIndexes = new ArrayList<>();
        List<Integer> valueVoucherIndexes = new ArrayList<>();
        for (int i = 0; i < resolved.size(); i++) {
            GuestEntitlement entitlement = resolved.get(i);
            if (VoucherRules.isServiceVoucher(entitlement)) {
                serviceVoucherIndexes.add(i);
            } else if (VoucherRules.isValueVoucher(entitlement)) {
                valueVoucherIndexes.add(i);
            } else {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher code is not valid: " + codes.get(i));
            }
        }

        int[] servicePositionToVoucher = new int[services.size()];
        java.util.Arrays.fill(servicePositionToVoucher, -1);
        for (Integer voucherIndex : serviceVoucherIndexes) {
            boolean[] visitedPositions = new boolean[services.size()];
            if (!assignServiceVoucher(voucherIndex, resolved, services, servicePositionToVoucher, visitedPositions)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Service voucher is not valid for an available selected service: " + codes.get(voucherIndex));
            }
        }

        List<VoucherServiceAssignment> assignments = new ArrayList<>();
        for (int serviceIndex = 0; serviceIndex < services.size(); serviceIndex++) {
            int voucherIndex = servicePositionToVoucher[serviceIndex];
            if (voucherIndex < 0) continue;
            VoucherSelectionLine line = services.get(serviceIndex);
            assignments.add(new VoucherServiceAssignment(
                    line.position(),
                    line.sessionTypeId(),
                    resolved.get(voucherIndex).getId(),
                    codes.get(voucherIndex)
            ));
        }
        assignments.sort(Comparator.comparingInt(VoucherServiceAssignment::position));

        List<String> valueCodes = new ArrayList<>();
        for (Integer voucherIndex : valueVoucherIndexes) {
            GuestEntitlement entitlement = resolved.get(voucherIndex);
            boolean appliesToUncoveredService = false;
            for (int serviceIndex = 0; serviceIndex < services.size(); serviceIndex++) {
                if (servicePositionToVoucher[serviceIndex] >= 0) continue;
                if (VoucherRules.entitlementAllowsService(entitlement, services.get(serviceIndex).sessionTypeId())) {
                    appliesToUncoveredService = true;
                    break;
                }
            }
            if (!appliesToUncoveredService) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Value voucher is not valid for any remaining selected service: " + codes.get(voucherIndex));
            }
            valueCodes.add(codes.get(voucherIndex));
        }
        return new VoucherResolution(List.copyOf(summaries), List.copyOf(assignments), List.copyOf(valueCodes));
    }

    private boolean assignServiceVoucher(
            int voucherIndex,
            List<GuestEntitlement> vouchers,
            List<VoucherSelectionLine> services,
            int[] servicePositionToVoucher,
            boolean[] visitedPositions
    ) {
        GuestEntitlement voucher = vouchers.get(voucherIndex);
        for (int serviceIndex = 0; serviceIndex < services.size(); serviceIndex++) {
            if (visitedPositions[serviceIndex]) continue;
            VoucherSelectionLine service = services.get(serviceIndex);
            if (!VoucherRules.entitlementAllowsService(voucher, service.sessionTypeId())) continue;
            visitedPositions[serviceIndex] = true;
            int previousVoucher = servicePositionToVoucher[serviceIndex];
            if (previousVoucher < 0
                    || assignServiceVoucher(previousVoucher, vouchers, services, servicePositionToVoucher, visitedPositions)) {
                servicePositionToVoucher[serviceIndex] = voucherIndex;
                return true;
            }
        }
        return false;
    }

    private void validateVoucherForResolution(
            GuestEntitlement entitlement,
            Client client,
            Long companyId,
            String currency
    ) {
        Instant now = timeService.instant(companyId);
        boolean matchesClient = entitlement.getClient() != null && Objects.equals(entitlement.getClient().getId(), client.getId());
        boolean matchesCompany = entitlement.getCompany() != null && Objects.equals(entitlement.getCompany().getId(), companyId);
        boolean active = entitlement.getStatus() == EntitlementStatus.ACTIVE;
        boolean validFrom = entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now);
        boolean validUntil = entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now);
        boolean voucher = VoucherRules.isServiceVoucher(entitlement) || VoucherRules.isValueVoucher(entitlement);
        boolean usable = VoucherRules.isServiceVoucher(entitlement)
                ? entitlement.getRemainingUses() == null || entitlement.getRemainingUses() > 0
                : entitlement.getRemainingValueGross() != null && entitlement.getRemainingValueGross().compareTo(BigDecimal.ZERO) > 0;
        String expectedCurrency = currency == null ? null : currency.trim().toUpperCase(java.util.Locale.ROOT);
        boolean currencyMatches = !VoucherRules.isValueVoucher(entitlement)
                || expectedCurrency == null
                || entitlement.getProduct() == null
                || entitlement.getProduct().getCurrency() == null
                || expectedCurrency.equals(entitlement.getProduct().getCurrency().trim().toUpperCase(java.util.Locale.ROOT));
        if (!matchesClient || !matchesCompany || !active || !validFrom || !validUntil || !voucher || !usable || !currencyMatches) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Voucher code is not valid.");
        }
    }

    @Transactional
    public GuestEntitlement ensureEntitlementForOrder(GuestOrder order, GuestProduct product) {
        return entitlements.findBySourceOrderIdAndProductId(order.getId(), product.getId()).orElseGet(() -> createEntitlement(order, product));
    }

    @Transactional
    public GuestEntitlementSelection consumeBestMatchingEntitlement(Client client, Long companyId, Long sessionTypeId, SessionBooking booking) {
        GuestEntitlement entitlement = findBestMatchingEntitlement(client, companyId, sessionTypeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "No active membership or visit pack is available for this booking."));
        return consumeEntitlement(entitlement, booking);
    }

    @Transactional
    public GuestEntitlementSelection consumeSelectedEntitlement(Client client, Long companyId, Long sessionTypeId, Long entitlementId, SessionBooking booking) {
        return consumeSelectedEntitlement(client, companyId, sessionTypeId, entitlementId, booking, null);
    }

    @Transactional(readOnly = true)
    public GuestEntitlement validateSelectedEntitlement(Client client, Long companyId, Long sessionTypeId, Long entitlementId) {
        GuestEntitlement entitlement = entitlements.findById(entitlementId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected pass or visit is not available."));
        Instant now = timeService.instant(companyId);
        boolean matchesClient = client != null && entitlement.getClient() != null
                && Objects.equals(entitlement.getClient().getId(), client.getId());
        boolean matchesCompany = entitlement.getCompany() != null && Objects.equals(entitlement.getCompany().getId(), companyId);
        boolean active = entitlement.getStatus() == EntitlementStatus.ACTIVE;
        boolean validFrom = entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now);
        boolean validUntil = entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now);
        boolean hasUses = entitlement.getRemainingUses() == null || entitlement.getRemainingUses() > 0;
        boolean serviceVoucher = VoucherRules.isServiceVoucher(entitlement);
        boolean serviceEntitlement = entitlement.getEntitlementType() != EntitlementType.GIFT_CARD || serviceVoucher;
        boolean matchesService = entitlement.getProduct() != null
                && (serviceVoucher
                    ? VoucherRules.entitlementAllowsService(entitlement, sessionTypeId)
                    : entitlement.getProduct().getSessionType() == null
                        || Objects.equals(entitlement.getProduct().getSessionType().getId(), sessionTypeId));
        if (!matchesClient || !matchesCompany || !active || !validFrom || !validUntil || !hasUses || !serviceEntitlement || !matchesService) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected pass or visit is not available for this service.");
        }
        return entitlement;
    }

    @Transactional
    public GuestEntitlementSelection consumeSelectedEntitlement(Client client, Long companyId, Long sessionTypeId, Long entitlementId, SessionBooking booking, SessionService sessionService) {
        GuestEntitlement entitlement = validateSelectedEntitlement(client, companyId, sessionTypeId, entitlementId);
        return consumeEntitlement(entitlement, booking, sessionService);
    }

    private GuestEntitlementSelection consumeEntitlement(GuestEntitlement entitlement, SessionBooking booking) {
        return consumeEntitlement(entitlement, booking, null);
    }

    private GuestEntitlementSelection consumeEntitlement(GuestEntitlement entitlement, SessionBooking booking, SessionService sessionService) {
        GuestEntitlementUsage existingUsage = sessionService != null && sessionService.getId() != null
                ? usages.findBySessionServiceId(sessionService.getId()).orElse(null)
                : usages.findAllBySessionBookingIdOrderByUsedAtAsc(booking.getId()).stream()
                    .filter(row -> row.getSessionService() == null)
                    .findFirst().orElse(null);
        if (existingUsage != null) {
            return new GuestEntitlementSelection(existingUsage.getEntitlement(), false);
        }
        GuestEntitlementUsage usage = new GuestEntitlementUsage();
        usage.setEntitlement(entitlement);
        usage.setSessionBooking(booking);
        usage.setSessionService(sessionService);
        usage.setReason(EntitlementUsageReason.BOOKING);
        usage.setUsedAt(Instant.now());
        usages.save(usage);
        if (entitlement.getEntitlementType() == EntitlementType.MEMBERSHIP) {
            entitlement.setVisitCount(Math.max(0, entitlement.getVisitCount()) + 1);
        } else {
            decrementIfLimited(entitlement);
        }
        entitlements.save(entitlement);
        return new GuestEntitlementSelection(entitlement, true);
    }

    @Transactional
    public GuestEntitlementSelection consumeGiftCardCode(
            Client client,
            Long companyId,
            BigDecimal amountGross,
            String currency,
            SessionBooking booking,
            String rawCode
    ) {
        GiftCardRedemptionResult result = consumeGiftCardCodes(
                client,
                companyId,
                amountGross,
                currency,
                booking,
                rawCode == null ? List.of() : List.of(rawCode),
                true
        );
        GuestEntitlement entitlement = result.firstEntitlement();
        if (entitlement == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card code is required.");
        }
        return new GuestEntitlementSelection(entitlement, result.consumed());
    }

    /**
     * Redeems one or more visible gift-card codes against a booking. Only the amount that is
     * still needed is deducted from each card, so cards with a larger balance keep the remainder.
     *
     * @param requireFullCoverage when true, the supplied cards must cover the full amount. When
     *                            false, the caller can collect the returned remaining amount with
     *                            another payment method.
     */
    @Transactional
    public GiftCardRedemptionResult consumeGiftCardCodes(
            Client client,
            Long companyId,
            BigDecimal amountGross,
            String currency,
            SessionBooking booking,
            List<String> rawCodes,
            boolean requireFullCoverage
    ) {
        if (amountGross == null || amountGross.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card payment requires a positive booking amount.");
        }
        BigDecimal amount = amountGross.setScale(2, RoundingMode.HALF_UP);
        List<String> codes = normalizeGiftCardCodes(rawCodes);
        if (codes.isEmpty()) {
            if (requireFullCoverage) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card code is required.");
            }
            return new GiftCardRedemptionResult(null, BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP), amount, false);
        }

        List<GuestEntitlementUsage> existingUsages = usages.findAllBySessionBookingIdOrderByUsedAtAsc(booking.getId());
        if (!existingUsages.isEmpty()) {
            boolean allGiftCardUsages = existingUsages.stream()
                    .allMatch(usage -> VoucherRules.isValueVoucher(usage.getEntitlement()));
            if (allGiftCardUsages) {
                // Idempotent retry: do not deduct the same cards again. The order total has already
                // been reduced by the first checkout attempt, so the current amount remains due.
                GuestEntitlement first = existingUsages.get(0).getEntitlement();
                return new GiftCardRedemptionResult(first, BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP), amount, false);
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This booking already used a wallet entitlement.");
        }

        BigDecimal remaining = amount;
        BigDecimal applied = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        GuestEntitlement firstConsumed = null;

        for (String code : codes) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;

            GuestEntitlement entitlement = findGiftCardByVisibleCode(code, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card code is not valid: " + code));
            validateGiftCardForBooking(entitlement, client, companyId, currency);
            validateVoucherServiceScope(entitlement, booking);

            BigDecimal beforeBalance = entitlement.getRemainingValueGross() == null
                    ? BigDecimal.ZERO
                    : entitlement.getRemainingValueGross().setScale(2, RoundingMode.HALF_UP);
            if (beforeBalance.compareTo(BigDecimal.ZERO) <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card has no remaining balance: " + code);
            }

            BigDecimal amountFromCard = beforeBalance.min(remaining).setScale(2, RoundingMode.HALF_UP);
            if (amountFromCard.compareTo(BigDecimal.ZERO) <= 0) continue;

            BigDecimal nextBalance = beforeBalance.subtract(amountFromCard).setScale(2, RoundingMode.HALF_UP);
            GuestEntitlementUsage usage = new GuestEntitlementUsage();
            usage.setEntitlement(entitlement);
            usage.setSessionBooking(booking);
            usage.setReason(EntitlementUsageReason.BOOKING);
            usage.setUsedAt(Instant.now());
            usage.setUnitsUsed(toCents(amountFromCard));
            usage.setUnitsBefore(toCents(beforeBalance));
            usage.setUnitsAfter(toCents(nextBalance.max(BigDecimal.ZERO)));
            usages.save(usage);

            entitlement.setRemainingValueGross(nextBalance.max(BigDecimal.ZERO));
            if (nextBalance.compareTo(BigDecimal.ZERO) <= 0) {
                entitlement.setRemainingUses(0);
                entitlement.setStatus(EntitlementStatus.USED_UP);
            } else {
                entitlement.setRemainingUses(1);
                entitlement.setStatus(EntitlementStatus.ACTIVE);
            }
            entitlements.save(entitlement);

            if (firstConsumed == null) {
                firstConsumed = entitlement;
            }
            applied = applied.add(amountFromCard).setScale(2, RoundingMode.HALF_UP);
            remaining = remaining.subtract(amountFromCard).setScale(2, RoundingMode.HALF_UP);
        }

        if (firstConsumed == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card payment could not be allocated.");
        }
        if (requireFullCoverage && remaining.compareTo(BigDecimal.ZERO) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift cards do not have enough total balance for this booking.");
        }

        return new GiftCardRedemptionResult(firstConsumed, applied, remaining.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP), true);
    }

    /**
     * Redeems VALUE vouchers against exact payable service amounts. Unlike the legacy whole-booking
     * method, SELECTED_SERVICES vouchers can cover their eligible lines while unrelated services
     * remain payable by card/bank/venue. The supplied charge lines must already reflect service
     * voucher/pass coverage and any deposit percentage applied to the order.
     */
    @Transactional
    public GiftCardRedemptionResult consumeGiftCardCodesForCharges(
            Client client,
            Long companyId,
            BigDecimal amountGross,
            String currency,
            SessionBooking booking,
            List<VoucherChargeLine> chargeLines,
            List<String> rawCodes,
            boolean requireFullCoverage
    ) {
        if (amountGross == null || amountGross.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Value voucher payment requires a positive booking amount.");
        }
        BigDecimal amount = amountGross.setScale(2, RoundingMode.HALF_UP);
        List<String> codes = normalizeGiftCardCodes(rawCodes);
        if (codes.isEmpty()) {
            if (requireFullCoverage) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Value voucher code is required.");
            }
            return new GiftCardRedemptionResult(null, BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP), amount, false);
        }

        List<GuestEntitlementUsage> existingUsages = usages.findAllBySessionBookingIdOrderByUsedAtAsc(booking.getId());
        List<GuestEntitlementUsage> existingValueUsages = existingUsages.stream()
                .filter(usage -> VoucherRules.isValueVoucher(usage.getEntitlement()))
                .toList();
        if (!existingValueUsages.isEmpty()) {
            // Idempotent retry after a checkout already deducted a value voucher. Service voucher
            // usages on other session_service rows are deliberately ignored here.
            GuestEntitlement first = existingValueUsages.get(0).getEntitlement();
            return new GiftCardRedemptionResult(first, BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP), amount, false);
        }

        List<MutableVoucherChargeLine> outstanding = normalizeVoucherChargeLines(chargeLines, amount);
        BigDecimal applied = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        GuestEntitlement firstConsumed = null;
        boolean anyApplicableVoucher = false;

        for (String code : codes) {
            GuestEntitlement entitlement = findGiftCardByVisibleCode(code, companyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Value voucher code is not valid: " + code));
            validateGiftCardForBooking(entitlement, client, companyId, currency);

            BigDecimal eligibleOutstanding = outstanding.stream()
                    .filter(line -> line.remaining().compareTo(BigDecimal.ZERO) > 0)
                    .filter(line -> voucherAllowsChargeLine(entitlement, line.sessionTypeId()))
                    .map(MutableVoucherChargeLine::remaining)
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .setScale(2, RoundingMode.HALF_UP);
            if (eligibleOutstanding.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            anyApplicableVoucher = true;

            BigDecimal beforeBalance = entitlement.getRemainingValueGross() == null
                    ? BigDecimal.ZERO
                    : entitlement.getRemainingValueGross().setScale(2, RoundingMode.HALF_UP);
            if (beforeBalance.compareTo(BigDecimal.ZERO) <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Value voucher has no remaining balance: " + code);
            }

            BigDecimal amountFromCard = beforeBalance.min(eligibleOutstanding).setScale(2, RoundingMode.HALF_UP);
            if (amountFromCard.compareTo(BigDecimal.ZERO) <= 0) continue;

            BigDecimal stillToAllocate = amountFromCard;
            for (MutableVoucherChargeLine line : outstanding) {
                if (stillToAllocate.compareTo(BigDecimal.ZERO) <= 0) break;
                if (!voucherAllowsChargeLine(entitlement, line.sessionTypeId())) continue;
                if (line.remaining().compareTo(BigDecimal.ZERO) <= 0) continue;
                BigDecimal lineDeduction = line.remaining().min(stillToAllocate).setScale(2, RoundingMode.HALF_UP);
                line.setRemaining(line.remaining().subtract(lineDeduction).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP));
                stillToAllocate = stillToAllocate.subtract(lineDeduction).setScale(2, RoundingMode.HALF_UP);
            }

            BigDecimal nextBalance = beforeBalance.subtract(amountFromCard).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            GuestEntitlementUsage usage = new GuestEntitlementUsage();
            usage.setEntitlement(entitlement);
            usage.setSessionBooking(booking);
            usage.setReason(EntitlementUsageReason.BOOKING);
            usage.setUsedAt(Instant.now());
            usage.setUnitsUsed(toCents(amountFromCard));
            usage.setUnitsBefore(toCents(beforeBalance));
            usage.setUnitsAfter(toCents(nextBalance));
            usages.save(usage);

            entitlement.setRemainingValueGross(nextBalance);
            if (nextBalance.compareTo(BigDecimal.ZERO) <= 0) {
                entitlement.setRemainingUses(0);
                entitlement.setStatus(EntitlementStatus.USED_UP);
            } else {
                entitlement.setRemainingUses(1);
                entitlement.setStatus(EntitlementStatus.ACTIVE);
            }
            entitlements.save(entitlement);

            if (firstConsumed == null) firstConsumed = entitlement;
            applied = applied.add(amountFromCard).setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal remaining = outstanding.stream()
                .map(MutableVoucherChargeLine::remaining)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .max(BigDecimal.ZERO)
                .setScale(2, RoundingMode.HALF_UP);
        if (firstConsumed == null) {
            String reason = anyApplicableVoucher
                    ? "Value voucher payment could not be allocated."
                    : "Value voucher is not valid for the remaining selected services.";
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
        }
        if (requireFullCoverage && remaining.compareTo(BigDecimal.ZERO) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Value vouchers do not cover the full remaining amount for the selected services.");
        }
        List<VoucherChargeLine> remainingChargeLines = outstanding.stream()
                .map(line -> new VoucherChargeLine(line.position(), line.sessionTypeId(), line.remaining()))
                .toList();
        return new GiftCardRedemptionResult(firstConsumed, applied, remaining, true, remainingChargeLines);
    }

    private boolean voucherAllowsChargeLine(GuestEntitlement entitlement, Long sessionTypeId) {
        if (VoucherRules.entitlementScope(entitlement) == VoucherServiceScope.ALL_SERVICES) return true;
        return sessionTypeId != null && VoucherRules.entitlementAllowsService(entitlement, sessionTypeId);
    }

    private List<MutableVoucherChargeLine> normalizeVoucherChargeLines(List<VoucherChargeLine> chargeLines, BigDecimal targetAmount) {
        List<VoucherChargeLine> source = chargeLines == null ? List.of() : chargeLines.stream()
                .filter(Objects::nonNull)
                .filter(line -> line.sessionTypeId() != null)
                .filter(line -> line.amountGross() != null && line.amountGross().compareTo(BigDecimal.ZERO) > 0)
                .toList();
        if (source.isEmpty()) {
            return List.of(new MutableVoucherChargeLine(-1, null, targetAmount.setScale(2, RoundingMode.HALF_UP)));
        }
        BigDecimal sourceTotal = source.stream()
                .map(VoucherChargeLine::amountGross)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        if (sourceTotal.compareTo(BigDecimal.ZERO) <= 0) {
            return List.of(new MutableVoucherChargeLine(-1, null, targetAmount.setScale(2, RoundingMode.HALF_UP)));
        }

        BigDecimal remainingTarget = targetAmount.setScale(2, RoundingMode.HALF_UP);
        List<MutableVoucherChargeLine> normalized = new ArrayList<>();
        for (int i = 0; i < source.size(); i++) {
            VoucherChargeLine line = source.get(i);
            BigDecimal amountForLine;
            if (i == source.size() - 1) {
                amountForLine = remainingTarget.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            } else {
                amountForLine = line.amountGross()
                        .multiply(targetAmount)
                        .divide(sourceTotal, 2, RoundingMode.HALF_UP)
                        .max(BigDecimal.ZERO);
                if (amountForLine.compareTo(remainingTarget) > 0) amountForLine = remainingTarget;
                remainingTarget = remainingTarget.subtract(amountForLine).setScale(2, RoundingMode.HALF_UP);
            }
            normalized.add(new MutableVoucherChargeLine(line.position(), line.sessionTypeId(), amountForLine));
        }
        return normalized;
    }

    private static final class MutableVoucherChargeLine {
        private final int position;
        private final Long sessionTypeId;
        private BigDecimal remaining;

        private MutableVoucherChargeLine(int position, Long sessionTypeId, BigDecimal remaining) {
            this.position = position;
            this.sessionTypeId = sessionTypeId;
            this.remaining = remaining == null ? BigDecimal.ZERO : remaining.setScale(2, RoundingMode.HALF_UP);
        }

        int position() { return position; }
        Long sessionTypeId() { return sessionTypeId; }
        BigDecimal remaining() { return remaining; }
        void setRemaining(BigDecimal remaining) { this.remaining = remaining; }
    }

    private void validateGiftCardForBooking(GuestEntitlement entitlement, Client client, Long companyId, String currency) {
        Instant now = timeService.instant(companyId);
        boolean matchesClient = entitlement.getClient() != null && Objects.equals(entitlement.getClient().getId(), client.getId());
        boolean matchesCompany = entitlement.getCompany() != null && Objects.equals(entitlement.getCompany().getId(), companyId);
        boolean active = entitlement.getStatus() == EntitlementStatus.ACTIVE;
        boolean validFrom = entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now);
        boolean validUntil = entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now);
        boolean giftCard = VoucherRules.isValueVoucher(entitlement);
        String expectedCurrency = currency == null ? null : currency.trim().toUpperCase(java.util.Locale.ROOT);
        boolean currencyMatches = expectedCurrency == null
                || entitlement.getProduct() == null
                || entitlement.getProduct().getCurrency() == null
                || expectedCurrency.equals(entitlement.getProduct().getCurrency().trim().toUpperCase(java.util.Locale.ROOT));
        if (!matchesClient || !matchesCompany || !active || !validFrom || !validUntil || !giftCard || !currencyMatches) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card code is not valid.");
        }
    }

    private void validateVoucherServiceScope(GuestEntitlement entitlement, SessionBooking booking) {
        if (!voucherAllowsBooking(entitlement, booking)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Gift card is not valid for one or more services in this booking.");
        }
    }

    private boolean voucherAllowsBooking(GuestEntitlement entitlement, SessionBooking booking) {
        if (entitlement == null || booking == null) return false;
        if (VoucherRules.entitlementScope(entitlement) == VoucherServiceScope.ALL_SERVICES) return true;

        LinkedHashSet<Long> serviceTypeIds = new LinkedHashSet<>();
        if (booking.getServices() != null) {
            booking.getServices().forEach(service -> {
                if (service != null && service.getSessionType() != null && service.getSessionType().getId() != null) {
                    serviceTypeIds.add(service.getSessionType().getId());
                }
            });
        }
        if (serviceTypeIds.isEmpty() && booking.getType() != null && booking.getType().getId() != null) {
            serviceTypeIds.add(booking.getType().getId());
        }
        return !serviceTypeIds.isEmpty()
                && serviceTypeIds.stream().allMatch(typeId -> VoucherRules.entitlementAllowsService(entitlement, typeId));
    }

    @Transactional
    public GuestEntitlementSelection consumeBestMatchingGiftCard(
            Client client,
            Long companyId,
            BigDecimal amountGross,
            String currency,
            SessionBooking booking
    ) {
        if (amountGross == null || amountGross.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card payment requires a positive booking amount.");
        }
        BigDecimal amount = amountGross.setScale(2, RoundingMode.HALF_UP);
        List<GuestEntitlementUsage> existingUsages = usages.findAllBySessionBookingIdOrderByUsedAtAsc(booking.getId());
        if (!existingUsages.isEmpty()) {
            boolean allGiftCardUsages = existingUsages.stream()
                    .allMatch(usage -> VoucherRules.isValueVoucher(usage.getEntitlement()));
            if (allGiftCardUsages) {
                return new GuestEntitlementSelection(existingUsages.get(0).getEntitlement(), false);
            }
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This booking already used a wallet entitlement.");
        }
        List<GuestEntitlement> matchingGiftCards = findMatchingGiftCards(client, companyId, currency).stream()
                .filter(entitlement -> voucherAllowsBooking(entitlement, booking))
                .toList();
        BigDecimal totalAvailable = matchingGiftCards.stream()
                .map(GuestEntitlement::getRemainingValueGross)
                .filter(Objects::nonNull)
                .map(value -> value.setScale(2, RoundingMode.HALF_UP))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalAvailable.compareTo(amount) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No active gift cards with enough total balance are available for this booking.");
        }
        BigDecimal remaining = amount;
        GuestEntitlement firstConsumed = null;
        for (GuestEntitlement entitlement : matchingGiftCards) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            BigDecimal beforeBalance = entitlement.getRemainingValueGross() == null
                    ? BigDecimal.ZERO
                    : entitlement.getRemainingValueGross().setScale(2, RoundingMode.HALF_UP);
            if (beforeBalance.compareTo(BigDecimal.ZERO) <= 0) continue;
            BigDecimal amountFromCard = beforeBalance.min(remaining).setScale(2, RoundingMode.HALF_UP);
            if (amountFromCard.compareTo(BigDecimal.ZERO) <= 0) continue;
            BigDecimal nextBalance = beforeBalance.subtract(amountFromCard).setScale(2, RoundingMode.HALF_UP);
            GuestEntitlementUsage usage = new GuestEntitlementUsage();
            usage.setEntitlement(entitlement);
            usage.setSessionBooking(booking);
            usage.setReason(EntitlementUsageReason.BOOKING);
            usage.setUsedAt(Instant.now());
            usage.setUnitsUsed(toCents(amountFromCard));
            usage.setUnitsBefore(toCents(beforeBalance));
            usage.setUnitsAfter(toCents(nextBalance.max(BigDecimal.ZERO)));
            usages.save(usage);
            entitlement.setRemainingValueGross(nextBalance.max(BigDecimal.ZERO));
            if (nextBalance.compareTo(BigDecimal.ZERO) <= 0) {
                entitlement.setRemainingUses(0);
                entitlement.setStatus(EntitlementStatus.USED_UP);
            } else {
                entitlement.setRemainingUses(1);
                entitlement.setStatus(EntitlementStatus.ACTIVE);
            }
            entitlements.save(entitlement);
            if (firstConsumed == null) {
                firstConsumed = entitlement;
            }
            remaining = remaining.subtract(amountFromCard).setScale(2, RoundingMode.HALF_UP);
        }
        if (remaining.compareTo(BigDecimal.ZERO) > 0 || firstConsumed == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gift card payment could not be fully allocated.");
        }
        return new GuestEntitlementSelection(firstConsumed, true);
    }

    @Transactional
    public boolean restoreCreditsForRemovedServices(
            SessionBooking booking,
            com.example.app.session.SessionServicePlanService.Plan nextPlan
    ) {
        if (booking == null || booking.getId() == null) return false;
        List<GuestEntitlementUsage> usageRows = usages.findAllBySessionBookingIdOrderByUsedAtAsc(booking.getId());
        if (usageRows.isEmpty()) return false;

        Map<Long, Integer> retainedCounts = new LinkedHashMap<>();
        if (nextPlan != null && nextPlan.segments() != null) {
            for (var segment : nextPlan.segments()) {
                if (segment.type() != null && segment.type().getId() != null) {
                    retainedCounts.merge(segment.type().getId(), 1, Integer::sum);
                }
            }
        }
        Map<Long, Integer> matchedCounts = new LinkedHashMap<>();
        List<GuestEntitlementUsage> removed = new ArrayList<>();
        for (GuestEntitlementUsage usage : usageRows) {
            SessionService line = usage.getSessionService();
            if (line == null || line.getSessionType() == null || line.getSessionType().getId() == null) continue;
            Long typeId = line.getSessionType().getId();
            int matched = matchedCounts.getOrDefault(typeId, 0);
            int retained = retainedCounts.getOrDefault(typeId, 0);
            if (matched < retained) {
                matchedCounts.put(typeId, matched + 1);
            } else {
                restoreUsageCredit(usage);
                removed.add(usage);
            }
        }
        if (!removed.isEmpty()) usages.deleteAll(removed);
        return !removed.isEmpty();
    }

    @Transactional
    public boolean maybeRestoreCreditForBooking(SessionBooking booking) {
        List<GuestEntitlementUsage> usageRows = usages.findAllBySessionBookingIdOrderByUsedAtAsc(booking.getId());
        if (usageRows.isEmpty()) return false;
        for (GuestEntitlementUsage usage : usageRows) {
            restoreUsageCredit(usage);
        }
        usages.deleteAll(usageRows);
        return true;
    }

    private void restoreUsageCredit(GuestEntitlementUsage usage) {
        GuestEntitlement entitlement = usage.getEntitlement();
        if (entitlement.getEntitlementType() == EntitlementType.GIFT_CARD && VoucherRules.isValueVoucher(entitlement)) {
            BigDecimal restoredBalance = usage.getUnitsBefore() == null
                    ? entitlement.getRemainingValueGross()
                    : BigDecimal.valueOf(usage.getUnitsBefore(), 2).setScale(2, RoundingMode.HALF_UP);
            entitlement.setRemainingValueGross(restoredBalance);
            entitlement.setRemainingUses(1);
        } else if (VoucherRules.isServiceVoucher(entitlement)) {
            incrementIfLimited(entitlement);
        } else if (entitlement.getEntitlementType() == EntitlementType.MEMBERSHIP) {
            entitlement.setVisitCount(Math.max(0, entitlement.getVisitCount() - 1));
        } else {
            incrementIfLimited(entitlement);
        }
        entitlement.setStatus(EntitlementStatus.ACTIVE);
        entitlements.save(entitlement);
    }

    @Transactional(readOnly = true)
    public boolean autoRenews(GuestEntitlement entitlement) {
        String raw = entitlement.getMetadataJson();
        if (raw != null && !raw.isBlank()) {
            try {
                JsonNode root = JSON.readTree(raw);
                if (root.has("autoRenews")) {
                    return root.path("autoRenews").asBoolean(entitlement.getProduct().isAutoRenews());
                }
            } catch (Exception ignore) {
            }
        }
        return entitlement.getProduct() != null && entitlement.getProduct().isAutoRenews();
    }

    @Transactional
    public GuestEntitlement updateAutoRenew(GuestEntitlement entitlement, boolean autoRenews) {
        if (entitlement.getEntitlementType() != EntitlementType.MEMBERSHIP) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Auto-renew is only available for memberships.");
        }
        Map<String, Object> metadata = metadata(entitlement.getMetadataJson());
        metadata.put("autoRenews", autoRenews);
        entitlement.setMetadataJson(writeMetadata(metadata));
        return entitlements.save(entitlement);
    }

    @Transactional(readOnly = true)
    public java.util.Optional<GuestEntitlementUsage> findBookingUsage(Long bookingId) {
        if (bookingId == null) return java.util.Optional.empty();
        return usages.findAllBySessionBookingIdOrderByUsedAtAsc(bookingId).stream()
                .filter(row -> row.getSessionService() == null)
                .findFirst();
    }

    @Transactional
    public GuestEntitlementUsage annotateBookingSettlement(Long bookingId, Long sourceOpenBillId, BigDecimal coveredGross) {
        GuestEntitlementUsage usage = findBookingUsage(bookingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Entitlement usage was not created for this booking."));
        usage.setSourceOpenBillId(sourceOpenBillId);
        usage.setCoveredGross(coveredGross == null ? null : coveredGross.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP));
        return usages.save(usage);
    }

    @Transactional(readOnly = true)
    public java.util.Optional<GuestEntitlement> findOwnedEntitlementByVisibleCode(String rawCode, Long companyId) {
        if (rawCode == null || rawCode.isBlank() || companyId == null) return java.util.Optional.empty();
        String code = rawCode.trim();
        return entitlements.findByEntitlementCode(code)
                .filter(entitlement -> entitlement.getCompany() != null && Objects.equals(entitlement.getCompany().getId(), companyId))
                .or(() -> entitlements.findFirstByDisplayCodeAndCompanyIdOrderByCreatedAtDesc(code, companyId));
    }

    @Transactional(readOnly = true)
    public java.util.Optional<GuestEntitlement> findOwnedEntitlement(Long entitlementId, Long clientId, Long companyId) {
        return entitlements.findById(entitlementId)
                .filter(entitlement -> Objects.equals(entitlement.getClient().getId(), clientId))
                .filter(entitlement -> Objects.equals(entitlement.getCompany().getId(), companyId));
    }

    /**
     * Marks {@link EntitlementStatus#ACTIVE} and {@link EntitlementStatus#PENDING} entitlements as {@link EntitlementStatus#EXPIRED}
     * when {@code validUntil} is set and not after {@code now}.
     *
     * @return number of rows updated
     */
    @Transactional
    public int markExpiredEntitlements(Instant now) {
        return entitlements.markExpiredEntitlements(
                EntitlementStatus.EXPIRED,
                List.of(EntitlementStatus.ACTIVE, EntitlementStatus.PENDING),
                now);
    }

    private GuestEntitlement createEntitlement(GuestOrder order, GuestProduct product) {
        GuestEntitlement entitlement = new GuestEntitlement();
        entitlement.setCompany(order.getCompany());
        entitlement.setClient(order.getClient());
        entitlement.setProduct(product);
        entitlement.setSourceOrder(order);
        entitlement.setEntitlementType(entitlementType(product.getProductType()));
        entitlement.setStatus(EntitlementStatus.ACTIVE);
        entitlement.setValidFrom(order.getPaidAt() != null ? order.getPaidAt() : Instant.now());
        if (product.getValidityDays() != null && product.getValidityDays() > 0) {
            entitlement.setValidUntil(entitlement.getValidFrom().plusSeconds(product.getValidityDays() * 86400L));
        }
        entitlement.setRemainingUses(product.getProductType() == ProductType.GIFT_CARD ? Integer.valueOf(1) : product.getUsageLimit());
        if (product.getProductType() == ProductType.GIFT_CARD
                && VoucherRules.productMode(product) == VoucherRedemptionMode.VALUE) {
            BigDecimal faceValue = product.getVoucherFaceValueGross() == null
                    ? product.getPriceGross()
                    : product.getVoucherFaceValueGross();
            entitlement.setRemainingValueGross((faceValue == null ? BigDecimal.ZERO : faceValue).setScale(2, RoundingMode.HALF_UP));
        }
        if (product.getProductType() == ProductType.GIFT_CARD) {
            Long companyId = order.getCompany() == null ? null : order.getCompany().getId();
            lockCompanyForGiftCardNumber(companyId);
            int seq = nextGiftCardSequence(companyId);
            String couponCode = generateUniqueGiftCardCouponCode(companyId);
            entitlement.setDisplaySeq(seq);
            entitlement.setDisplayCode(couponCode);
            // For gift cards, the public coupon code is also the redeemable code. This keeps the
            // code shown in tenant web, guest app and website widget fully unified.
            entitlement.setEntitlementCode(couponCode);
        } else {
            int seq = (int) (entitlements.countByProductId(product.getId()) + 1);
            entitlement.setDisplaySeq(seq);
            entitlement.setDisplayCode(buildDisplayCode(product, seq));
            entitlement.setEntitlementCode(generateUniqueEntitlementCode());
        }
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("autoRenews", product.isAutoRenews());
        metadata.put("listPriceGross", order.getSubtotalGross() == null ? BigDecimal.ZERO.doubleValue() : order.getSubtotalGross().doubleValue());
        if (product.getProductType() == ProductType.GIFT_CARD) {
            Map<String, Object> orderMetadata = metadata(order.getMetadataJson());
            copyTextMetadata(orderMetadata, metadata, "giftCardRecipientName");
            copyTextMetadata(orderMetadata, metadata, "giftCardMessage");
            VoucherRedemptionMode voucherMode = VoucherRules.productMode(product);
            VoucherServiceScope voucherScope = VoucherRules.productScope(product);
            metadata.put("voucherMode", voucherMode == null ? VoucherRedemptionMode.VALUE.name() : voucherMode.name());
            metadata.put("voucherScope", voucherScope == null ? VoucherServiceScope.ALL_SERVICES.name() : voucherScope.name());
            metadata.put("eligibleSessionTypeIds", product.getVoucherSessionTypes() == null
                    ? List.of()
                    : product.getVoucherSessionTypes().stream().map(SessionType::getId).filter(Objects::nonNull).toList());
            metadata.put("eligibleServiceNames", product.getVoucherSessionTypes() == null
                    ? List.of()
                    : product.getVoucherSessionTypes().stream().map(SessionType::getName).filter(Objects::nonNull).toList());
            BigDecimal faceValue = product.getVoucherFaceValueGross() == null ? product.getPriceGross() : product.getVoucherFaceValueGross();
            metadata.put("faceValueGross", faceValue == null ? null : faceValue.setScale(2, RoundingMode.HALF_UP).doubleValue());
        }
        if ((product.getProductType() == ProductType.COURSE || product.getProductType() == ProductType.MEMBERSHIP) && membershipCourses != null) {
            metadata.put("includedCourseIds", mappedCourseIds(product));
        }
        if (product.getProductType() == ProductType.COURSE) {
            String token = UUID.randomUUID().toString();
            entitlement.setCourseAccessToken(token);
            metadata.put("courseAccessToken", token);
            metadata.put("courseAccessUrl", buildCourseAccessUrl(token));
            metadata.put("courseAccessSource", "DIRECT_PURCHASE");
            metadata.put("lifetimeAccess", true);
        }
        entitlement.setMetadataJson(writeMetadata(metadata));
        entitlement = entitlements.save(entitlement);
        if (product.getProductType() == ProductType.GIFT_CARD && giftCardEmailService != null) {
            giftCardEmailService.sendGiftCardEmail(entitlement);
        }
        if (product.getProductType() == ProductType.COURSE) {
            if (courseAccessEmailService != null) {
                courseAccessEmailService.sendCourseAccessEmail(entitlement, courseAccessUrl(entitlement));
            }
        } else if (product.getProductType() == ProductType.MEMBERSHIP) {
            createMembershipCourseAccessEntitlements(order, entitlement, product);
        }
        return entitlement;
    }

    private void createMembershipCourseAccessEntitlements(GuestOrder order, GuestEntitlement membershipEntitlement, GuestProduct membershipProduct) {
        if (membershipCourses == null || membershipProduct == null || membershipProduct.getId() == null) return;
        List<MembershipCourse> rows = membershipCourses.findAllByMembershipProductIdAndCompanyIdOrderByCourseTitleAsc(
                membershipProduct.getId(),
                membershipProduct.getCompany().getId()
        );
        for (MembershipCourse row : rows) {
            if (row.getCourse() == null) continue;
            GuestEntitlement courseEntitlement = new GuestEntitlement();
            courseEntitlement.setCompany(order.getCompany());
            courseEntitlement.setClient(order.getClient());
            courseEntitlement.setProduct(membershipProduct);
            courseEntitlement.setSourceOrder(order);
            courseEntitlement.setEntitlementType(EntitlementType.COURSE);
            courseEntitlement.setStatus(EntitlementStatus.ACTIVE);
            courseEntitlement.setValidFrom(membershipEntitlement.getValidFrom());
            courseEntitlement.setValidUntil(membershipEntitlement.getValidUntil());
            courseEntitlement.setRemainingUses(1);
            courseEntitlement.setEntitlementCode(generateUniqueEntitlementCode());
            int seq = (int) (entitlements.countByProductId(membershipProduct.getId()) + 1);
            courseEntitlement.setDisplaySeq(seq);
            courseEntitlement.setDisplayCode(buildDisplayCode(membershipProduct, seq));
            Map<String, Object> metadata = new LinkedHashMap<>();
            String token = UUID.randomUUID().toString();
            courseEntitlement.setCourseAccessToken(token);
            metadata.put("courseAccessToken", token);
            metadata.put("courseAccessUrl", buildCourseAccessUrl(token));
            metadata.put("courseAccessSource", "MEMBERSHIP");
            metadata.put("membershipEntitlementId", membershipEntitlement.getId());
            metadata.put("courseId", row.getCourse().getId());
            metadata.put("courseTitle", row.getCourse().getTitle());
            metadata.put("lifetimeAccess", false);
            courseEntitlement.setMetadataJson(writeMetadata(metadata));
            courseEntitlement = entitlements.save(courseEntitlement);
            if (courseAccessEmailService != null) {
                courseAccessEmailService.sendCourseAccessEmail(courseEntitlement, courseAccessUrl(courseEntitlement));
            }
        }
    }

    private List<Long> mappedCourseIds(GuestProduct product) {
        if (membershipCourses == null || product == null || product.getId() == null || product.getCompany() == null) {
            return List.of();
        }
        return membershipCourses.findAllByMembershipProductIdAndCompanyIdOrderByCourseTitleAsc(
                        product.getId(),
                        product.getCompany().getId()
                ).stream()
                .map(row -> row.getCourse() == null ? null : row.getCourse().getId())
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private static void copyTextMetadata(Map<String, Object> source, Map<String, Object> target, String key) {
        if (source == null || target == null || key == null) return;
        Object value = source.get(key);
        if (value == null) return;
        String text = String.valueOf(value).trim();
        if (!text.isBlank()) {
            target.put(key, text);
        }
    }

    private String courseAccessUrl(GuestEntitlement entitlement) {
        String token = entitlement.getCourseAccessToken();
        if (token == null || token.isBlank()) {
            token = String.valueOf(metadata(entitlement.getMetadataJson()).getOrDefault("courseAccessToken", ""));
        }
        return buildCourseAccessUrl(token);
    }

    private String buildCourseAccessUrl(String token) {
        String base = publicBaseUrl == null || publicBaseUrl.isBlank() ? "" : publicBaseUrl.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (base.isBlank()) {
            return "/course-access/" + token;
        }
        return base + "/course-access/" + token;
    }


    private void lockCompanyForGiftCardNumber(Long companyId) {
        if (companyId == null || companies == null) return;
        companies.findByIdForUpdate(companyId);
    }

    private int nextGiftCardSequence(Long companyId) {
        if (companyId == null) return 1;
        Integer currentMax = entitlements.maxDisplaySeqByCompanyIdAndEntitlementType(companyId, EntitlementType.GIFT_CARD);
        return (currentMax == null ? 0 : currentMax) + 1;
    }

    private String generateUniqueGiftCardCouponCode(Long companyId) {
        for (int attempt = 0; attempt < 24; attempt++) {
            String code = "GC-" + randomOpaqueCode(4) + "-" + randomOpaqueCode(4);
            boolean usedAsEntitlementCode = entitlements.existsByEntitlementCode(code);
            boolean usedAsDisplayCode = companyId != null && entitlements.existsByCompanyIdAndDisplayCodeIgnoreCase(companyId, code);
            if (!usedAsEntitlementCode && !usedAsDisplayCode) {
                return code;
            }
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not generate gift card coupon code.");
    }


    private String generateUniqueEntitlementCode() {
        for (int attempt = 0; attempt < 16; attempt++) {
            String code = "ENT-" + randomOpaqueCode(10);
            if (!entitlements.existsByEntitlementCode(code)) {
                return code;
            }
        }
        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not generate entitlement code.");
    }

    private static String randomOpaqueCode(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(OPAQUE_CODE_ALPHABET[OPAQUE_CODE_RANDOM.nextInt(OPAQUE_CODE_ALPHABET.length)]);
        }
        return sb.toString();
    }

    /**
     * Derives a human-friendly code like "CM8-425-001":
     *  - Prefix: uppercase initials of product name (first letter of each alnum word),
     *    truncated to 3 chars; falls back to a 2-letter code for the product type.
     *  - Middle: integer part of the product's gross price (rounded), or "0".
     *  - Suffix: zero-padded 3-digit per-product running sequence.
     */
    private static String buildDisplayCode(GuestProduct product, int sequence) {
        String prefix = initials(product.getName());
        if (prefix.isBlank()) {
            prefix = switch (product.getProductType()) {
                case CLASS_TICKET -> "TK";
                case PACK -> "PK";
                case MEMBERSHIP -> "MB";
                case GIFT_CARD -> "GC";
                case COURSE -> "CR";
                default -> "GP";
            };
        }
        int priceInt = product.getPriceGross() == null
                ? 0
                : product.getPriceGross().setScale(0, java.math.RoundingMode.HALF_UP).intValue();
        return String.format("%s-%d-%03d", prefix, priceInt, Math.max(1, sequence));
    }

    private static String initials(String name) {
        if (name == null || name.isBlank()) return "";
        StringBuilder sb = new StringBuilder();
        boolean newWord = true;
        for (int i = 0; i < name.length() && sb.length() < 3; i++) {
            char c = name.charAt(i);
            if (Character.isLetterOrDigit(c)) {
                if (newWord) {
                    sb.append(Character.toUpperCase(c));
                    newWord = false;
                }
            } else {
                newWord = true;
            }
        }
        return sb.toString();
    }

    private java.util.Optional<GuestEntitlement> findBestMatchingEntitlement(Client client, Long companyId, Long sessionTypeId) {
        Instant now = timeService.instant(companyId);
        return entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(client.getId(), companyId, ACTIVE_STATUSES).stream()
                .filter(entitlement -> entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now))
                .filter(entitlement -> entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now))
                .filter(entitlement -> entitlement.getEntitlementType() != EntitlementType.GIFT_CARD || VoucherRules.isServiceVoucher(entitlement))
                .filter(entitlement -> entitlement.getRemainingUses() == null || entitlement.getRemainingUses() > 0)
                .filter(entitlement -> entitlement.getProduct() != null)
                .filter(entitlement -> VoucherRules.isServiceVoucher(entitlement)
                        ? VoucherRules.entitlementAllowsService(entitlement, sessionTypeId)
                        : entitlement.getProduct().getSessionType() == null
                            || Objects.equals(entitlement.getProduct().getSessionType().getId(), sessionTypeId))
                .sorted(entitlementPriority())
                .findFirst();
    }

    private java.util.Optional<GuestEntitlement> findGiftCardByVisibleCode(String code, Long companyId) {
        return entitlements.findByEntitlementCode(code)
                .filter(entitlement -> entitlement.getCompany() != null && Objects.equals(entitlement.getCompany().getId(), companyId))
                .or(() -> entitlements.findFirstByDisplayCodeAndCompanyIdOrderByCreatedAtDesc(code, companyId));
    }

    private static String normalizeGiftCardCode(String rawCode) {
        if (rawCode == null) return null;
        String code = rawCode.trim().replaceAll("\\s+", "").toUpperCase(java.util.Locale.ROOT);
        return code.isBlank() ? null : code;
    }

    private static List<String> normalizeGiftCardCodes(List<String> rawCodes) {
        if (rawCodes == null || rawCodes.isEmpty()) return List.of();
        LinkedHashSet<String> unique = new LinkedHashSet<>();
        for (String rawCode : rawCodes) {
            String code = normalizeGiftCardCode(rawCode);
            if (code != null) unique.add(code);
        }
        return new ArrayList<>(unique);
    }

    private List<GuestEntitlement> findMatchingGiftCards(Client client, Long companyId, String currency) {
        Instant now = timeService.instant(companyId);
        String expectedCurrency = currency == null ? null : currency.trim().toUpperCase(java.util.Locale.ROOT);
        return entitlements.findAllByClientIdAndCompanyIdAndStatusInOrderByCreatedAtDesc(client.getId(), companyId, ACTIVE_STATUSES).stream()
                .filter(entitlement -> entitlement.getValidFrom() == null || !entitlement.getValidFrom().isAfter(now))
                .filter(entitlement -> entitlement.getValidUntil() == null || entitlement.getValidUntil().isAfter(now))
                .filter(VoucherRules::isValueVoucher)
                .filter(entitlement -> entitlement.getProduct() != null)
                .filter(entitlement -> expectedCurrency == null
                        || entitlement.getProduct().getCurrency() == null
                        || expectedCurrency.equals(entitlement.getProduct().getCurrency().trim().toUpperCase(java.util.Locale.ROOT)))
                .filter(entitlement -> entitlement.getRemainingValueGross() != null
                        && entitlement.getRemainingValueGross().compareTo(BigDecimal.ZERO) > 0)
                .sorted(giftCardConsumptionPriority())
                .toList();
    }

    private Comparator<GuestEntitlement> entitlementPriority() {
        return Comparator
                .comparing((GuestEntitlement entitlement) -> entitlement.getValidUntil() == null ? Instant.MAX : entitlement.getValidUntil())
                .thenComparing(GuestEntitlement::getCreatedAt);
    }

    private Comparator<GuestEntitlement> giftCardConsumptionPriority() {
        return Comparator
                .comparing((GuestEntitlement entitlement) -> entitlement.getRemainingValueGross() == null
                        ? BigDecimal.ZERO
                        : entitlement.getRemainingValueGross().setScale(2, RoundingMode.HALF_UP))
                .thenComparing(GuestEntitlement::getCreatedAt);
    }

    private static int toCents(BigDecimal amount) {
        return amount.movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValue();
    }

    private void decrementIfLimited(GuestEntitlement entitlement) {
        if (entitlement.getRemainingUses() == null) return;
        entitlement.setRemainingUses(Math.max(0, entitlement.getRemainingUses() - 1));
        if (entitlement.getRemainingUses() <= 0) {
            entitlement.setStatus(EntitlementStatus.USED_UP);
        }
    }

    private void incrementIfLimited(GuestEntitlement entitlement) {
        if (entitlement.getRemainingUses() == null) return;
        entitlement.setRemainingUses(entitlement.getRemainingUses() + 1);
    }

    private static EntitlementType entitlementType(ProductType productType) {
        return switch (productType) {
            case CLASS_TICKET -> EntitlementType.TICKET;
            case PACK -> EntitlementType.PACK;
            case MEMBERSHIP -> EntitlementType.MEMBERSHIP;
            case GIFT_CARD -> EntitlementType.GIFT_CARD;
            case COURSE -> EntitlementType.COURSE;
            default -> EntitlementType.ACCESS;
        };
    }

    private static Map<String, Object> metadata(String raw) {
        if (raw == null || raw.isBlank()) return new LinkedHashMap<>();
        try {
            return JSON.readValue(raw, LinkedHashMap.class);
        } catch (Exception ex) {
            return new LinkedHashMap<>();
        }
    }

    private static String writeMetadata(Map<String, Object> metadata) {
        try {
            return JSON.writeValueAsString(metadata);
        } catch (Exception ex) {
            return "{}";
        }
    }

    public record GiftCardRedemptionResult(
            GuestEntitlement firstEntitlement,
            BigDecimal amountApplied,
            BigDecimal remainingAmount,
            boolean consumed,
            List<VoucherChargeLine> remainingChargeLines
    ) {
        public GiftCardRedemptionResult(
                GuestEntitlement firstEntitlement,
                BigDecimal amountApplied,
                BigDecimal remainingAmount,
                boolean consumed
        ) {
            this(firstEntitlement, amountApplied, remainingAmount, consumed, List.of());
        }
    }

    public record GuestEntitlementSelection(GuestEntitlement entitlement, boolean consumed) {}
}
