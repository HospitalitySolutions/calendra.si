package com.example.app.session;

import com.example.app.billing.PriceMath;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.user.User;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/types")
public class SessionTypeController {
    private static final int SESSION_TYPE_CODE_MAX_LENGTH = 12;
    private static final String DEFAULT_SESSION_TYPE_COLOR = "#D7DFF0";
    private static final java.util.regex.Pattern HEX_COLOR_PATTERN = java.util.regex.Pattern.compile("^#[0-9A-Fa-f]{6}$");
    private final SessionTypeRepository repo;
    private final TransactionServiceRepository txRepo;
    private final SessionBookingRepository bookingRepo;

    public SessionTypeController(
            SessionTypeRepository repo,
            TransactionServiceRepository txRepo,
            SessionBookingRepository bookingRepo
    ) {
        this.repo = repo;
        this.txRepo = txRepo;
        this.bookingRepo = bookingRepo;
    }

    public record TypeServiceItem(Long transactionServiceId, BigDecimal price) {}
    public record TypeRequest(
            @JsonProperty("name") @JsonAlias("code") String code,
            String description,
            String color,
            Integer durationMinutes,
            Integer breakMinutes,
            Integer maxParticipantsPerSession,
            Boolean groupBookingEnabled,
            Boolean widgetGroupBookingEnabled,
            Boolean guestBookingEnabled,
            SessionPriceCalculationMode priceCalculationMode,
            Boolean active,
            List<String> guestLimitUserEmails,
            List<TypeServiceItem> services
    ) {}
    /** {@code price} is net override on the type–service link (null = use transaction service net). {@code unitGross} is derived for guest-card pricing UI. */
    public record ServiceLinkDto(
            Long id,
            Long transactionServiceId,
            String code,
            String description,
            BigDecimal price,
            BigDecimal unitGross
    ) {}
    public record TypeResponse(
            Long id,
            @JsonProperty("name") String name,
            String description,
            String color,
            Integer durationMinutes,
            Integer breakMinutes,
            Integer maxParticipantsPerSession,
            boolean groupBookingEnabled,
            boolean widgetGroupBookingEnabled,
            boolean guestBookingEnabled,
            SessionPriceCalculationMode priceCalculationMode,
            boolean active,
            List<String> guestLimitUserEmails,
            List<ServiceLinkDto> linkedServices
    ) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<TypeResponse> list(@AuthenticationPrincipal User me) {
        return repo.findAllWithLinkedServicesByCompanyId(me.getCompany().getId())
                .stream().map(this::toResponse).toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    @Transactional
    public TypeResponse create(@RequestBody TypeRequest req, @AuthenticationPrincipal User me) {
        var type = new SessionType();
        Long companyId = me.getCompany().getId();
        String normalizedCode = requireValidSessionTypeCode(req.code());
        ensureSessionTypeCodeUnique(companyId, normalizedCode, null);
        type.setCompany(me.getCompany());
        type.setName(normalizedCode);
        type.setDescription(req.description());
        type.setColor(normalizeSessionTypeColor(req.color()));
        type.setDurationMinutes(req.durationMinutes() != null ? req.durationMinutes() : 60);
        type.setBreakMinutes(req.breakMinutes() != null ? req.breakMinutes() : 0);
        type.setMaxParticipantsPerSession(normalizeMaxParticipantsPerSession(req.maxParticipantsPerSession()));
        type.setGroupBookingEnabled(Boolean.TRUE.equals(req.groupBookingEnabled()));
        type.setWidgetGroupBookingEnabled(Boolean.TRUE.equals(req.widgetGroupBookingEnabled()));
        type.setGuestBookingEnabled(req.guestBookingEnabled() == null || Boolean.TRUE.equals(req.guestBookingEnabled()));
        type.setPriceCalculationMode(normalizePriceCalculationMode(req.priceCalculationMode()));
        type.setGuestLimitUserEmails(serializeGuestLimitUserEmails(req.guestLimitUserEmails()));
        type.setActive(req.active() == null || Boolean.TRUE.equals(req.active()));
        type = repo.save(type);
        saveLinkedServices(type, req.services(), companyId);
        final Long createdId = type.getId();
        return toResponse(repo.findAllWithLinkedServicesByCompanyId(companyId).stream()
                .filter(x -> x.getId().equals(createdId))
                .findFirst()
                .orElseThrow());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    @Transactional
    public TypeResponse update(@PathVariable Long id, @RequestBody TypeRequest req, @AuthenticationPrincipal User me) {
        var type = repo.findById(id).orElseThrow();
        Long companyId = me.getCompany().getId();
        if (!type.getCompany().getId().equals(companyId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        String normalizedCode = requireValidSessionTypeCode(req.code());
        ensureSessionTypeCodeUnique(companyId, normalizedCode, id);
        type.setName(normalizedCode);
        type.setDescription(req.description());
        type.setColor(normalizeSessionTypeColor(req.color()));
        type.setDurationMinutes(req.durationMinutes() != null ? req.durationMinutes() : 60);
        type.setBreakMinutes(req.breakMinutes() != null ? req.breakMinutes() : 0);
        type.setMaxParticipantsPerSession(normalizeMaxParticipantsPerSession(req.maxParticipantsPerSession()));
        type.setGroupBookingEnabled(Boolean.TRUE.equals(req.groupBookingEnabled()));
        type.setWidgetGroupBookingEnabled(Boolean.TRUE.equals(req.widgetGroupBookingEnabled()));
        type.setGuestBookingEnabled(req.guestBookingEnabled() == null || Boolean.TRUE.equals(req.guestBookingEnabled()));
        type.setPriceCalculationMode(normalizePriceCalculationMode(req.priceCalculationMode()));
        type.setGuestLimitUserEmails(serializeGuestLimitUserEmails(req.guestLimitUserEmails()));
        boolean nextActive = req.active() == null || Boolean.TRUE.equals(req.active());
        if (type.isActive() && !nextActive && bookingRepo.existsUpcomingOrOngoingForType(companyId, id, LocalDateTime.now())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This service code has upcoming or ongoing bookings and cannot be inactivated."
            );
        }
        type.setActive(nextActive);
        type.getLinkedServices().clear();
        repo.saveAndFlush(type);
        saveLinkedServices(type, req.services() != null ? req.services() : List.of(), companyId);
        return toResponse(repo.findAllWithLinkedServicesByCompanyId(companyId).stream()
                .filter(t -> t.getId().equals(id))
                .findFirst()
                .orElseThrow());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var type = repo.findById(id).orElseThrow();
        if (!type.getCompany().getId().equals(me.getCompany().getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        if (bookingRepo.existsUpcomingOrOngoingForType(me.getCompany().getId(), id, LocalDateTime.now())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This service code has upcoming or ongoing bookings and cannot be deleted. Set it inactive instead."
            );
        }
        repo.delete(type);
    }

    private void saveLinkedServices(SessionType type, List<TypeServiceItem> items, Long companyId) {
        if (items == null) return;
        List<TransactionService> resolvedServices = new ArrayList<>();
        for (var item : items) {
            var tx = txRepo.findByIdAndCompanyId(item.transactionServiceId(), companyId).orElseThrow();
            if (!tx.isActive()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Inactive transaction services cannot be linked to service codes."
                );
            }
            resolvedServices.add(tx);
        }

        validateSingleVatRate(type.getName(), resolvedServices);

        for (int i = 0; i < items.size(); i++) {
            var item = items.get(i);
            var tx = resolvedServices.get(i);
            var link = new TypeTransactionService();
            link.setSessionType(type);
            link.setTransactionService(tx);
            link.setPrice(item.price());
            type.getLinkedServices().add(link);
        }
        repo.save(type);
    }

    private void validateSingleVatRate(String serviceCode, List<TransactionService> services) {
        if (services == null || services.size() <= 1) return;
        Set<String> vatRates = new HashSet<>();
        for (TransactionService service : services) {
            if (service == null || service.getTaxRate() == null) continue;
            vatRates.add(service.getTaxRate().name());
        }
        if (vatRates.size() > 1) {
            String label = serviceCode == null || serviceCode.isBlank()
                    ? "service code"
                    : "'" + serviceCode.trim() + "'";
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "All linked transaction services for " + label + " must use the same DDV rate."
            );
        }
    }

    private String normalizeSessionTypeCode(String raw) {
        if (raw == null) return null;
        String upper = raw.trim().toUpperCase(Locale.ROOT);
        if (upper.isEmpty()) return null;
        String alnum = upper.replaceAll("[^A-Z0-9]", "");
        if (alnum.isEmpty()) return null;
        if (alnum.length() > SESSION_TYPE_CODE_MAX_LENGTH) {
            return alnum.substring(0, SESSION_TYPE_CODE_MAX_LENGTH);
        }
        return alnum;
    }

    private String requireValidSessionTypeCode(String raw) {
        String normalized = normalizeSessionTypeCode(raw);
        if (normalized == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service code is required.");
        }
        return normalized;
    }

    private void ensureSessionTypeCodeUnique(Long companyId, String code, Long currentId) {
        var existing = repo.findByCompanyIdAndNameIgnoreCase(companyId, code);
        if (existing.isPresent() && !existing.get().getId().equals(currentId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Service code already exists for this tenant.");
        }
    }

    private TypeResponse toResponse(SessionType t) {
        var services = t.getLinkedServices().stream()
                .map(link -> {
                    var tx = link.getTransactionService();
                    BigDecimal effectiveNet = link.getPrice() != null ? link.getPrice() : tx.getNetPrice();
                    BigDecimal unitGross = PriceMath.unitGrossFromNet(effectiveNet, tx.getTaxRate());
                    return new ServiceLinkDto(
                            link.getId(),
                            tx.getId(),
                            tx.getCode(),
                            tx.getDescription(),
                            link.getPrice(),
                            unitGross
                    );
                })
                .collect(Collectors.toList());
        Integer duration = t.getDurationMinutes() != null ? t.getDurationMinutes() : 60;
        Integer breakMinutes = t.getBreakMinutes() != null ? t.getBreakMinutes() : 0;
        return new TypeResponse(
                t.getId(),
                t.getName(),
                t.getDescription(),
                normalizeSessionTypeColor(t.getColor()),
                duration,
                breakMinutes,
                t.getMaxParticipantsPerSession(),
                t.isGroupBookingEnabled(),
                t.isWidgetGroupBookingEnabled(),
                t.isGuestBookingEnabled(),
                t.getPriceCalculationMode() != null ? t.getPriceCalculationMode() : SessionPriceCalculationMode.PER_CLIENT,
                t.isActive(),
                parseGuestLimitUserEmails(t.getGuestLimitUserEmails()),
                services
        );
    }

    private SessionPriceCalculationMode normalizePriceCalculationMode(SessionPriceCalculationMode mode) {
        return mode == null ? SessionPriceCalculationMode.PER_CLIENT : mode;
    }

    private String serializeGuestLimitUserEmails(List<String> emails) {
        if (emails == null || emails.isEmpty()) return null;
        List<String> normalized = emails.stream()
                .filter(email -> email != null && !email.isBlank())
                .map(email -> email.trim().toLowerCase(Locale.ROOT))
                .distinct()
                .toList();
        return normalized.isEmpty() ? null : String.join("\n", normalized);
    }

    private List<String> parseGuestLimitUserEmails(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return raw.lines()
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .map(line -> line.toLowerCase(Locale.ROOT))
                .distinct()
                .toList();
    }

    private Integer normalizeMaxParticipantsPerSession(Integer value) {
        if (value == null) return null;
        if (value < 1 || value > 999) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Max participants per session must be between 1 and 999.");
        }
        return value;
    }

    private String normalizeSessionTypeColor(String raw) {
        if (raw == null || raw.isBlank()) return DEFAULT_SESSION_TYPE_COLOR;
        String value = raw.trim().toUpperCase(Locale.ROOT);
        if (!HEX_COLOR_PATTERN.matcher(value).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service color must be a HEX value like #D7DFF0.");
        }
        return value;
    }
}
