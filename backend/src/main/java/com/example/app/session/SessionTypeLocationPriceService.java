package com.example.app.session;

import com.example.app.billing.TransactionService;
import com.example.app.company.CompanyRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SessionTypeLocationPriceService {
    private final SessionTypeLocationPriceRepository prices;
    private final LocationRepository locations;
    private final CompanyRepository companies;

    public SessionTypeLocationPriceService(
            SessionTypeLocationPriceRepository prices,
            LocationRepository locations,
            CompanyRepository companies
    ) {
        this.prices = prices;
        this.locations = locations;
        this.companies = companies;
    }

    public Optional<BigDecimal> overridePrice(Long companyId, Long typeId, Long transactionServiceId, Long locationId) {
        if (companyId == null || typeId == null || transactionServiceId == null || locationId == null) return Optional.empty();
        return prices.findByCompanyIdAndSessionTypeIdAndTransactionServiceIdAndLocationId(
                        companyId, typeId, transactionServiceId, locationId)
                .map(SessionTypeLocationPrice::getPrice);
    }

    public BigDecimal effectiveNet(TypeTransactionService link, Long locationId) {
        if (link == null || link.getSessionType() == null || link.getTransactionService() == null) return BigDecimal.ZERO;
        SessionType type = link.getSessionType();
        TransactionService tx = link.getTransactionService();
        Long companyId = type.getCompany() == null ? null : type.getCompany().getId();
        BigDecimal base = link.getPrice() != null ? link.getPrice() : tx.getNetPrice();
        if (locationId == null) return normalize(base);
        return normalize(overridePrice(companyId, type.getId(), tx.getId(), locationId).orElse(base));
    }

    /**
     * Builds an in-memory location-price resolver for a calendar/list batch.
     *
     * <p>The old resolver performed one SELECT for every billing link of every booking. A week
     * containing many sessions could therefore spend most of its time doing repeated
     * session_type_location_prices lookups. This method loads every relevant override in one
     * query and then resolves prices from a map while serializing the response.</p>
     */
    @Transactional(readOnly = true)
    public SessionBillingSupport.PriceResolver bulkResolver(Long companyId, Collection<SessionBooking> bookings) {
        if (companyId == null || bookings == null || bookings.isEmpty()) {
            return SessionTypeLocationPriceService::baseNet;
        }
        Set<Long> locationIds = new LinkedHashSet<>();
        Set<Long> typeIds = new LinkedHashSet<>();
        for (SessionBooking booking : bookings) {
            if (booking == null) continue;
            if (booking.getLocation() != null && booking.getLocation().getId() != null) {
                locationIds.add(booking.getLocation().getId());
            }
            if (booking.getType() != null && booking.getType().getId() != null) {
                typeIds.add(booking.getType().getId());
            }
            if (booking.getServices() != null) {
                for (SessionService service : booking.getServices()) {
                    if (service != null && service.getSessionType() != null && service.getSessionType().getId() != null) {
                        typeIds.add(service.getSessionType().getId());
                    }
                }
            }
        }
        if (locationIds.isEmpty() || typeIds.isEmpty()) {
            return SessionTypeLocationPriceService::baseNet;
        }

        Map<PriceKey, BigDecimal> overrides = new HashMap<>();
        for (SessionTypeLocationPrice row : prices.findAllByCompanyIdAndLocationIdInAndSessionTypeIdIn(
                companyId, locationIds, typeIds)) {
            if (row.getSessionType() == null || row.getTransactionService() == null || row.getLocation() == null) continue;
            overrides.put(
                    new PriceKey(row.getSessionType().getId(), row.getTransactionService().getId(), row.getLocation().getId()),
                    normalize(row.getPrice())
            );
        }
        return (link, locationId) -> {
            BigDecimal base = baseNet(link, locationId);
            if (link == null || link.getSessionType() == null || link.getTransactionService() == null || locationId == null) {
                return base;
            }
            return overrides.getOrDefault(
                    new PriceKey(link.getSessionType().getId(), link.getTransactionService().getId(), locationId),
                    base
            );
        };
    }

    public Map<Long, BigDecimal> overridesForType(Long companyId, Long typeId, Long locationId) {
        Map<Long, BigDecimal> out = new HashMap<>();
        if (companyId == null || typeId == null || locationId == null) return out;
        requireLocation(companyId, locationId);
        for (SessionTypeLocationPrice row : prices.findAllByCompanyIdAndSessionTypeIdAndLocationId(companyId, typeId, locationId)) {
            if (row.getTransactionService() != null && row.getTransactionService().getId() != null) {
                out.put(row.getTransactionService().getId(), row.getPrice());
            }
        }
        return out;
    }

    @Transactional
    public void setOverride(
            Long companyId,
            SessionType type,
            TransactionService tx,
            Long locationId,
            BigDecimal price
    ) {
        if (companyId == null || type == null || tx == null || locationId == null || price == null) return;
        Location location = requireLocation(companyId, locationId);
        SessionTypeLocationPrice row = prices.findByCompanyIdAndSessionTypeIdAndTransactionServiceIdAndLocationId(
                        companyId, type.getId(), tx.getId(), locationId)
                .orElseGet(() -> {
                    SessionTypeLocationPrice created = new SessionTypeLocationPrice();
                    created.setCompany(companies.getReferenceById(companyId));
                    created.setSessionType(type);
                    created.setTransactionService(tx);
                    created.setLocation(location);
                    return created;
                });
        row.setPrice(normalize(price));
        prices.save(row);
    }

    @Transactional
    public void clearOverride(Long companyId, Long typeId, Long transactionServiceId, Long locationId) {
        if (companyId == null || typeId == null || transactionServiceId == null || locationId == null) return;
        prices.deleteByCompanyIdAndSessionTypeIdAndTransactionServiceIdAndLocationId(companyId, typeId, transactionServiceId, locationId);
    }

    @Transactional
    public void purgeUnlinked(Long companyId, Long typeId, Collection<Long> linkedTransactionServiceIds) {
        if (companyId == null || typeId == null) return;
        if (linkedTransactionServiceIds == null || linkedTransactionServiceIds.isEmpty()) {
            prices.deleteByCompanyIdAndSessionTypeId(companyId, typeId);
        } else {
            prices.deleteByCompanyIdAndSessionTypeIdAndTransactionServiceIdNotIn(companyId, typeId, linkedTransactionServiceIds);
        }
    }

    private record PriceKey(Long sessionTypeId, Long transactionServiceId, Long locationId) {}

    private static BigDecimal baseNet(TypeTransactionService link, Long locationId) {
        if (link == null || link.getTransactionService() == null) return BigDecimal.ZERO.setScale(4);
        return normalize(link.getPrice() != null ? link.getPrice() : link.getTransactionService().getNetPrice());
    }

    private Location requireLocation(Long companyId, Long locationId) {
        return locations.findByIdAndCompanyId(locationId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid location."));
    }

    private static BigDecimal normalize(BigDecimal value) {
        return value == null ? BigDecimal.ZERO.setScale(4) : value.max(BigDecimal.ZERO).setScale(4, RoundingMode.HALF_UP);
    }
}
