package com.example.app.session;

import com.example.app.billing.TransactionService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Billing projection for every selected service in a session chain. */
public final class SessionBillingSupport {
    private SessionBillingSupport() {}

    @FunctionalInterface
    public interface PriceResolver {
        BigDecimal netPrice(TypeTransactionService link, Long locationId);
    }

    private static final PriceResolver BASE_PRICE = (link, locationId) -> {
        if (link == null || link.getTransactionService() == null) return BigDecimal.ZERO;
        return link.getPrice() != null ? link.getPrice() : link.getTransactionService().getNetPrice();
    };

    public record Charge(TransactionService transactionService, BigDecimal netPrice, int quantity) {}

    /** One billing component tied to the exact selected service position. */
    public record PositionedCharge(int servicePosition, TransactionService transactionService, BigDecimal netPrice) {}

    private record ChargeKey(Long transactionServiceId, BigDecimal netPrice) {}

    public static List<Charge> charges(SessionBooking booking, Set<Long> excludedTransactionServiceIds) {
        return charges(booking, excludedTransactionServiceIds, Set.of(), BASE_PRICE);
    }

    public static List<Charge> charges(
            SessionBooking booking, Set<Long> excludedTransactionServiceIds, PriceResolver priceResolver
    ) {
        return charges(booking, excludedTransactionServiceIds, Set.of(), priceResolver);
    }

    /**
     * Builds billing lines while optionally excluding exact service segments from a multi-service
     * booking. This is used when a pass/service voucher covers one segment but the remaining
     * services still need to be invoiced. Excluding by position is intentionally separate from
     * excluding transaction-service ids: two selected services may share the same billing item.
     */
    public static List<Charge> charges(
            SessionBooking booking,
            Set<Long> excludedTransactionServiceIds,
            Set<Integer> excludedServicePositions
    ) {
        return charges(booking, excludedTransactionServiceIds, excludedServicePositions, BASE_PRICE);
    }

    public static List<Charge> charges(
            SessionBooking booking,
            Set<Long> excludedTransactionServiceIds,
            Set<Integer> excludedServicePositions,
            PriceResolver priceResolver
    ) {
        Set<Long> excludedTransactions = excludedTransactionServiceIds == null ? Set.of() : excludedTransactionServiceIds;
        Set<Integer> excludedPositions = excludedServicePositions == null ? Set.of() : excludedServicePositions;
        LinkedHashMap<ChargeKey, Charge> charges = new LinkedHashMap<>();
        PriceResolver resolver = priceResolver == null ? BASE_PRICE : priceResolver;
        Long locationId = booking == null || booking.getLocation() == null ? null : booking.getLocation().getId();

        List<SessionService> services = SessionServiceSupport.orderedServices(booking);
        if (!services.isEmpty()) {
            for (SessionService service : services) {
                if (service == null || excludedPositions.contains(service.getPosition())) continue;
                addTypeCharges(charges, service.getSessionType(), excludedTransactions, locationId, resolver);
            }
        } else {
            // Legacy single-service bookings do not have session_service rows.
            List<SessionType> types = SessionServiceSupport.orderedTypes(booking);
            for (int position = 0; position < types.size(); position++) {
                if (excludedPositions.contains(position)) continue;
                addTypeCharges(charges, types.get(position), excludedTransactions, locationId, resolver);
            }
        }
        return new ArrayList<>(charges.values());
    }

    /**
     * Same source data as {@link #charges(SessionBooking, Set, Set)} but without aggregating
     * different service positions. This is needed when a VALUE voucher pays only part of one
     * selected service and the advance invoice must preserve that exact allocation.
     */
    public static List<PositionedCharge> positionedCharges(
            SessionBooking booking,
            Set<Long> excludedTransactionServiceIds,
            Set<Integer> excludedServicePositions
    ) {
        return positionedCharges(booking, excludedTransactionServiceIds, excludedServicePositions, BASE_PRICE);
    }

    public static List<PositionedCharge> positionedCharges(
            SessionBooking booking,
            Set<Long> excludedTransactionServiceIds,
            Set<Integer> excludedServicePositions,
            PriceResolver priceResolver
    ) {
        Set<Long> excludedTransactions = excludedTransactionServiceIds == null ? Set.of() : excludedTransactionServiceIds;
        Set<Integer> excludedPositions = excludedServicePositions == null ? Set.of() : excludedServicePositions;
        List<PositionedCharge> out = new ArrayList<>();
        PriceResolver resolver = priceResolver == null ? BASE_PRICE : priceResolver;
        Long locationId = booking == null || booking.getLocation() == null ? null : booking.getLocation().getId();
        List<SessionService> services = SessionServiceSupport.orderedServices(booking);
        if (!services.isEmpty()) {
            for (SessionService service : services) {
                if (service == null || excludedPositions.contains(service.getPosition())) continue;
                addPositionedTypeCharges(out, service.getPosition(), service.getSessionType(), excludedTransactions, locationId, resolver);
            }
        } else {
            List<SessionType> types = SessionServiceSupport.orderedTypes(booking);
            for (int position = 0; position < types.size(); position++) {
                if (excludedPositions.contains(position)) continue;
                addPositionedTypeCharges(out, position, types.get(position), excludedTransactions, locationId, resolver);
            }
        }
        return out;
    }

    private static void addPositionedTypeCharges(
            List<PositionedCharge> out,
            int position,
            SessionType type,
            Set<Long> excludedTransactionServiceIds,
            Long locationId,
            PriceResolver priceResolver
    ) {
        if (type == null || type.getLinkedServices() == null) return;
        for (TypeTransactionService link : type.getLinkedServices()) {
            if (link == null || link.getTransactionService() == null || link.getTransactionService().getId() == null) continue;
            TransactionService tx = link.getTransactionService();
            if (excludedTransactionServiceIds.contains(tx.getId())) continue;
            BigDecimal net = priceResolver.netPrice(link, locationId);
            if (net == null) net = BigDecimal.ZERO;
            out.add(new PositionedCharge(position, tx, net.setScale(4, RoundingMode.HALF_UP)));
        }
    }

    private static void addTypeCharges(
            LinkedHashMap<ChargeKey, Charge> charges,
            SessionType type,
            Set<Long> excludedTransactionServiceIds,
            Long locationId,
            PriceResolver priceResolver
    ) {
        if (type == null || type.getLinkedServices() == null) return;
        for (TypeTransactionService link : type.getLinkedServices()) {
            if (link == null || link.getTransactionService() == null || link.getTransactionService().getId() == null) continue;
            TransactionService tx = link.getTransactionService();
            if (excludedTransactionServiceIds.contains(tx.getId())) continue;
            BigDecimal net = priceResolver.netPrice(link, locationId);
            if (net == null) net = BigDecimal.ZERO;
            net = net.setScale(4, RoundingMode.HALF_UP);
            ChargeKey key = new ChargeKey(tx.getId(), net);
            Charge existing = charges.get(key);
            charges.put(key, new Charge(tx, net, existing == null ? 1 : existing.quantity() + 1));
        }
    }

    public static boolean hasTransactionServices(SessionBooking booking) {
        return !charges(booking, Set.of()).isEmpty();
    }

    public static boolean hasTransactionServices(SessionBooking booking, PriceResolver priceResolver) {
        return !charges(booking, Set.of(), priceResolver).isEmpty();
    }

    public static BigDecimal grossTotal(SessionBooking booking) {
        return grossTotal(booking, BASE_PRICE);
    }

    public static BigDecimal grossTotal(SessionBooking booking, PriceResolver priceResolver) {
        BigDecimal total = BigDecimal.ZERO;
        for (Charge charge : charges(booking, Set.of(), priceResolver)) {
            TransactionService tx = charge.transactionService();
            BigDecimal multiplier = tx.getTaxRate() == null ? BigDecimal.ZERO : tx.getTaxRate().multiplier;
            BigDecimal unitGross = charge.netPrice()
                    .add(charge.netPrice().multiply(multiplier))
                    .setScale(2, RoundingMode.HALF_UP);
            total = total.add(unitGross.multiply(BigDecimal.valueOf(charge.quantity())));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    public static SessionPriceCalculationMode priceCalculationMode(SessionBooking booking) {
        List<SessionService> services = SessionServiceSupport.orderedServices(booking);
        if (!services.isEmpty()) {
            String snapshot = services.get(0).getPriceCalculationModeSnapshot();
            if (snapshot != null && !snapshot.isBlank()) {
                try {
                    return SessionPriceCalculationMode.valueOf(snapshot);
                } catch (IllegalArgumentException ignored) {
                    // Fall through to the live type for legacy or manually corrected rows.
                }
            }
        }
        SessionType type = SessionServiceSupport.orderedTypes(booking).stream()
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
        return type != null && type.getPriceCalculationMode() != null
                ? type.getPriceCalculationMode()
                : SessionPriceCalculationMode.PER_CLIENT;
    }
}
