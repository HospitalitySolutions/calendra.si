package com.example.app.session;

import com.example.app.billing.PriceMath;
import com.example.app.billing.TransactionService;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/types/{typeId}/location-prices")
public class SessionTypeLocationPriceController {
    private final SessionTypeRepository types;
    private final SessionTypeLocationPriceService prices;

    public SessionTypeLocationPriceController(SessionTypeRepository types, SessionTypeLocationPriceService prices) {
        this.types = types;
        this.prices = prices;
    }

    public record LocationPriceRow(
            Long transactionServiceId,
            BigDecimal baseNetPrice,
            BigDecimal baseGrossPrice,
            BigDecimal overrideNetPrice,
            BigDecimal overrideGrossPrice,
            BigDecimal effectiveNetPrice,
            BigDecimal effectiveGrossPrice,
            boolean overridden
    ) {}

    public record PriceItem(Long transactionServiceId, BigDecimal price) {}
    public record SaveRequest(List<PriceItem> items) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<LocationPriceRow> get(
            @AuthenticationPrincipal User me,
            @PathVariable Long typeId,
            @RequestParam Long locationId
    ) {
        Long companyId = companyId(me);
        SessionType type = requireType(companyId, typeId);
        Map<Long, BigDecimal> overrides = prices.overridesForType(companyId, typeId, locationId);
        List<LocationPriceRow> out = new ArrayList<>();
        for (TypeTransactionService link : type.getLinkedServices()) {
            if (link == null || link.getTransactionService() == null) continue;
            TransactionService tx = link.getTransactionService();
            BigDecimal base = link.getPrice() != null ? link.getPrice() : tx.getNetPrice();
            BigDecimal override = overrides.get(tx.getId());
            BigDecimal effective = override != null ? override : base;
            out.add(new LocationPriceRow(
                    tx.getId(),
                    base,
                    PriceMath.unitGrossFromNet(base, tx.getTaxRate()),
                    override,
                    override == null ? null : PriceMath.unitGrossFromNet(override, tx.getTaxRate()),
                    effective,
                    PriceMath.unitGrossFromNet(effective, tx.getTaxRate()),
                    override != null
            ));
        }
        return out;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    @Transactional
    public List<LocationPriceRow> save(
            @AuthenticationPrincipal User me,
            @PathVariable Long typeId,
            @RequestParam Long locationId,
            @RequestBody(required = false) SaveRequest request
    ) {
        Long companyId = companyId(me);
        SessionType type = requireType(companyId, typeId);
        Map<Long, TransactionService> linked = type.getLinkedServices().stream()
                .filter(link -> link != null && link.getTransactionService() != null && link.getTransactionService().getId() != null)
                .collect(java.util.stream.Collectors.toMap(
                        link -> link.getTransactionService().getId(),
                        TypeTransactionService::getTransactionService,
                        (a, b) -> a
                ));
        List<PriceItem> items = request == null || request.items() == null ? List.of() : request.items();
        Set<Long> supplied = new HashSet<>();
        for (PriceItem item : items) {
            if (item == null || item.transactionServiceId() == null) continue;
            TransactionService tx = linked.get(item.transactionServiceId());
            if (tx == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location price can only be set for a linked billing service.");
            }
            supplied.add(tx.getId());
            if (item.price() == null) prices.clearOverride(companyId, typeId, tx.getId(), locationId);
            else prices.setOverride(companyId, type, tx, locationId, item.price());
        }
        for (Long txId : linked.keySet()) {
            if (!supplied.contains(txId)) prices.clearOverride(companyId, typeId, txId, locationId);
        }
        return get(me, typeId, locationId);
    }

    private SessionType requireType(Long companyId, Long typeId) {
        return types.findByIdAndCompanyIdWithLinkedServices(typeId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Service not found."));
    }

    private static Long companyId(User me) {
        if (me == null || me.getCompany() == null || me.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        return me.getCompany().getId();
    }
}
