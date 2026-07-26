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

    public record Charge(TransactionService transactionService, BigDecimal netPrice, int quantity) {}

    private record ChargeKey(Long transactionServiceId, BigDecimal netPrice) {}

    public static List<Charge> charges(SessionBooking booking, Set<Long> excludedTransactionServiceIds) {
        Set<Long> excluded = excludedTransactionServiceIds == null ? Set.of() : excludedTransactionServiceIds;
        LinkedHashMap<ChargeKey, Charge> charges = new LinkedHashMap<>();
        for (SessionType type : SessionServiceSupport.orderedTypes(booking)) {
            if (type == null || type.getLinkedServices() == null) continue;
            for (TypeTransactionService link : type.getLinkedServices()) {
                if (link == null || link.getTransactionService() == null || link.getTransactionService().getId() == null) continue;
                TransactionService tx = link.getTransactionService();
                if (excluded.contains(tx.getId())) continue;
                BigDecimal net = link.getPrice() != null ? link.getPrice() : tx.getNetPrice();
                if (net == null) net = BigDecimal.ZERO;
                net = net.setScale(4, RoundingMode.HALF_UP);
                ChargeKey key = new ChargeKey(tx.getId(), net);
                Charge existing = charges.get(key);
                charges.put(key, new Charge(tx, net, existing == null ? 1 : existing.quantity() + 1));
            }
        }
        return new ArrayList<>(charges.values());
    }

    public static boolean hasTransactionServices(SessionBooking booking) {
        return !charges(booking, Set.of()).isEmpty();
    }

    public static BigDecimal grossTotal(SessionBooking booking) {
        BigDecimal total = BigDecimal.ZERO;
        for (Charge charge : charges(booking, Set.of())) {
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
