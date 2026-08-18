package com.example.app.session;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.billing.PriceMath;
import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.settings.TenantFeatureAccessService;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.user.User;
import com.example.app.workspaceservice.WorkspaceServiceTemplate;
import com.example.app.workspaceservice.WorkspaceServiceTemplateRepository;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/types")
public class SessionTypeController {
    private static final int SESSION_TYPE_CODE_MAX_LENGTH = 12;
    private static final String SESSION_TYPE_BILLING_SOURCE = "SESSION_TYPE";
    private static final String DEFAULT_SESSION_TYPE_COLOR = "#D7DFF0";
    private static final java.util.regex.Pattern HEX_COLOR_PATTERN = java.util.regex.Pattern.compile("^#[0-9A-Fa-f]{6}$");
    private final SessionTypeRepository repo;
    private final TransactionServiceRepository txRepo;
    private final SessionBookingRepository bookingRepo;
    private final ServiceGroupRepository groupRepo;
    private final TenantFeatureAccessService featureAccess;
    private final SessionTypeBreakSettingsService breakSettings;
    private final WorkspaceServiceTemplateRepository workspaceServiceTemplates;
    private final LocationRepository locations;
    private final SessionTypeLocationPriceService locationPrices;

    @Autowired(required = false)
    private ActivityLogService activityLogs;

    @Autowired
    public SessionTypeController(
            SessionTypeRepository repo,
            TransactionServiceRepository txRepo,
            SessionBookingRepository bookingRepo,
            ServiceGroupRepository groupRepo,
            TenantFeatureAccessService featureAccess,
            SessionTypeBreakSettingsService breakSettings,
            WorkspaceServiceTemplateRepository workspaceServiceTemplates,
            LocationRepository locations,
            SessionTypeLocationPriceService locationPrices
    ) {
        this.repo = repo;
        this.txRepo = txRepo;
        this.bookingRepo = bookingRepo;
        this.groupRepo = groupRepo;
        this.featureAccess = featureAccess;
        this.breakSettings = breakSettings;
        this.workspaceServiceTemplates = workspaceServiceTemplates;
        this.locations = locations;
        this.locationPrices = locationPrices;
    }

    /** Backwards-compatible constructor used by existing controller unit tests. */
    SessionTypeController(
            SessionTypeRepository repo,
            TransactionServiceRepository txRepo,
            SessionBookingRepository bookingRepo,
            ServiceGroupRepository groupRepo
    ) {
        this(repo, txRepo, bookingRepo, groupRepo, null, null, null, null, null);
    }

    public record TypeServiceItem(Long transactionServiceId, BigDecimal price) {}
    public record TypeRequest(
            @JsonProperty("name") @JsonAlias("code") String code,
            String description,
            String internalDescription,
            String color,
            Integer durationMinutes,
            Integer breakMinutes,
            Boolean breakMinutesOverridden,
            Integer maxParticipantsPerSession,
            Boolean groupBookingEnabled,
            Boolean widgetGroupBookingEnabled,
            Boolean guestBookingEnabled,
            SessionPriceCalculationMode priceCalculationMode,
            Boolean active,
            List<String> guestLimitUserEmails,
            Long serviceGroupId,
            Integer sortOrder,
            Boolean availableAllLocations,
            List<Long> locationIds,
            List<TypeServiceItem> services,
            BigDecimal billingGrossPrice,
            TaxRate billingTaxRate
    ) {
        public TypeRequest(
                String code,
                String description,
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
        ) {
            this(
                    code,
                    description,
                    null,
                    null,
                    durationMinutes,
                    breakMinutes,
                    breakMinutes != null,
                    maxParticipantsPerSession,
                    groupBookingEnabled,
                    widgetGroupBookingEnabled,
                    guestBookingEnabled,
                    priceCalculationMode,
                    active,
                    guestLimitUserEmails,
                    null,
                    null,
                    true,
                    List.of(),
                    services,
                    null,
                    null
            );
        }
    }
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
            String internalDescription,
            String color,
            Integer durationMinutes,
            Integer breakMinutes,
            boolean breakMinutesOverridden,
            Integer maxParticipantsPerSession,
            boolean groupBookingEnabled,
            boolean widgetGroupBookingEnabled,
            boolean guestBookingEnabled,
            SessionPriceCalculationMode priceCalculationMode,
            boolean active,
            Instant createdAt,
            List<String> guestLimitUserEmails,
            Long serviceGroupId,
            String serviceGroupName,
            boolean serviceGroupActive,
            Integer serviceGroupSortOrder,
            int sortOrder,
            boolean availableAllLocations,
            List<Long> locationIds,
            List<ServiceLinkDto> linkedServices
    ) {}

    public record TypeOrderItem(Long id, Long serviceGroupId, Integer sortOrder) {}
    public record TypeReorderRequest(List<TypeOrderItem> items) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<TypeResponse> list(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        boolean groupsEnabled = serviceGroupsEnabled(companyId);
        return repo.findAllWithLinkedServicesByCompanyId(companyId)
                .stream()
                .sorted(sessionTypeOrder(groupsEnabled))
                .map(type -> toResponse(type, groupsEnabled))
                .toList();
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    @Transactional
    public TypeResponse create(@RequestBody TypeRequest req, @AuthenticationPrincipal User me) {
        var type = new SessionType();
        Long companyId = me.getCompany().getId();
        String normalizedCode = normalizeSessionTypeCode(req.code());
        String description = normalizeServiceDescription(req.description());
        if (description == null) {
            if (normalizedCode == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service description is required.");
            }
            // Backwards compatibility for older API clients that still provide only a code.
            description = normalizedCode;
        }
        if (normalizedCode == null) {
            normalizedCode = generateUniqueSessionTypeCode(companyId, description);
        } else {
            ensureSessionTypeCodeUnique(companyId, normalizedCode, null);
        }
        type.setCompany(me.getCompany());
        if (workspaceServiceTemplates != null) {
            WorkspaceServiceTemplate template = new WorkspaceServiceTemplate();
            template.setWorkspace(me.getCompany().getWorkspace());
            template.setOwnerCompany(me.getCompany());
            template.setName(description);
            template.setDescription(description);
            template.setDefaultDurationMinutes(req.durationMinutes() != null ? req.durationMinutes() : 60);
            template.setColor(normalizeSessionTypeColor(req.color()));
            template.setActive(req.active() == null || Boolean.TRUE.equals(req.active()));
            type.setWorkspaceServiceTemplate(workspaceServiceTemplates.save(template));
        }
        type.setName(normalizedCode);
        type.setDescription(description);
        type.setInternalDescription(normalizeInternalDescription(req.internalDescription()));
        type.setColor(normalizeSessionTypeColor(req.color()));
        type.setDurationMinutes(req.durationMinutes() != null ? req.durationMinutes() : 60);
        applyBreakSettings(type, req, companyId);
        Integer maxParticipantsPerSession = normalizeMaxParticipantsPerSession(req.maxParticipantsPerSession());
        boolean groupBookingEnabled = Boolean.TRUE.equals(req.groupBookingEnabled());
        validateReservedGuestSpots(maxParticipantsPerSession, groupBookingEnabled, req.guestLimitUserEmails());
        type.setMaxParticipantsPerSession(maxParticipantsPerSession);
        type.setGroupBookingEnabled(groupBookingEnabled);
        type.setWidgetGroupBookingEnabled(Boolean.TRUE.equals(req.widgetGroupBookingEnabled()));
        type.setGuestBookingEnabled(req.guestBookingEnabled() == null || Boolean.TRUE.equals(req.guestBookingEnabled()));
        type.setPriceCalculationMode(normalizePriceCalculationMode(req.priceCalculationMode()));
        type.setGuestLimitUserEmails(serializeGuestLimitUserEmails(req.guestLimitUserEmails()));
        boolean groupsEnabled = serviceGroupsEnabled(companyId);
        ServiceGroup serviceGroup = groupsEnabled ? resolveServiceGroup(companyId, req.serviceGroupId()) : null;
        type.setServiceGroup(serviceGroup);
        type.setGuestSortOrder(req.sortOrder() == null
                ? nextSortOrder(companyId, serviceGroup == null ? null : serviceGroup.getId())
                : Math.max(0, req.sortOrder()));
        type.setActive(req.active() == null || Boolean.TRUE.equals(req.active()));
        applyLocationVisibility(type, req, companyId, true);
        type = repo.save(type);
        if (usesAutomaticBilling(req)) {
            saveAutomaticBillingService(type, req.billingGrossPrice(), req.billingTaxRate(), companyId);
        } else {
            saveLinkedServices(type, req.services(), companyId);
        }
        final Long createdId = type.getId();
        TypeResponse result = toResponse(repo.findAllWithLinkedServicesByCompanyId(companyId).stream()
                .filter(x -> x.getId().equals(createdId))
                .findFirst()
                .orElseThrow(), groupsEnabled);
        recordService(me, ActivityAction.SERVICE_CREATED, result, "Created service", null);
        return result;
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
        var beforeAudit = ActivityDetails.of(
                "description", type.getDescription(), "active", type.isActive(),
                "durationMinutes", type.getDurationMinutes(), "groupBookingEnabled", type.isGroupBookingEnabled(),
                "widgetGroupBookingEnabled", type.isWidgetGroupBookingEnabled());
        String normalizedCode = normalizeSessionTypeCode(req.code());
        String description = normalizeServiceDescription(req.description());
        if (description == null) {
            if (normalizedCode == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service description is required.");
            }
            // Preserve legacy rows when an older status-only client does not manage descriptions.
            description = type.getDescription();
        }
        if (normalizedCode == null) {
            // The code is intentionally hidden from the regular editor. Keep it stable
            // when the visible description is renamed.
            normalizedCode = type.getName();
        } else {
            ensureSessionTypeCodeUnique(companyId, normalizedCode, id);
        }
        type.setName(normalizedCode);
        type.setDescription(description);
        type.setInternalDescription(normalizeInternalDescription(req.internalDescription()));
        type.setColor(normalizeSessionTypeColor(req.color()));
        type.setDurationMinutes(req.durationMinutes() != null ? req.durationMinutes() : 60);
        applyBreakSettings(type, req, companyId);
        Integer maxParticipantsPerSession = normalizeMaxParticipantsPerSession(req.maxParticipantsPerSession());
        boolean groupBookingEnabled = Boolean.TRUE.equals(req.groupBookingEnabled());
        validateReservedGuestSpots(maxParticipantsPerSession, groupBookingEnabled, req.guestLimitUserEmails());
        type.setMaxParticipantsPerSession(maxParticipantsPerSession);
        type.setGroupBookingEnabled(groupBookingEnabled);
        type.setWidgetGroupBookingEnabled(Boolean.TRUE.equals(req.widgetGroupBookingEnabled()));
        type.setGuestBookingEnabled(req.guestBookingEnabled() == null || Boolean.TRUE.equals(req.guestBookingEnabled()));
        type.setPriceCalculationMode(normalizePriceCalculationMode(req.priceCalculationMode()));
        type.setGuestLimitUserEmails(serializeGuestLimitUserEmails(req.guestLimitUserEmails()));
        boolean groupsEnabled = serviceGroupsEnabled(companyId);
        Long previousGroupId = type.getServiceGroup() == null ? null : type.getServiceGroup().getId();
        ServiceGroup serviceGroup = groupsEnabled
                ? resolveServiceGroup(companyId, req.serviceGroupId())
                : type.getServiceGroup();
        Long nextGroupId = serviceGroup == null ? null : serviceGroup.getId();
        type.setServiceGroup(serviceGroup);
        if (req.sortOrder() != null) {
            type.setGuestSortOrder(Math.max(0, req.sortOrder()));
        } else if (!java.util.Objects.equals(previousGroupId, nextGroupId)) {
            type.setGuestSortOrder(nextSortOrder(companyId, nextGroupId));
        }
        boolean nextActive = req.active() == null || Boolean.TRUE.equals(req.active());
        if (type.isActive() && !nextActive && bookingRepo.existsUpcomingOrOngoingForType(companyId, id, LocalDateTime.now())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This service code has upcoming or ongoing bookings and cannot be inactivated."
            );
        }
        type.setActive(nextActive);
        applyLocationVisibility(type, req, companyId, false);
        type.getLinkedServices().clear();
        repo.saveAndFlush(type);
        if (usesAutomaticBilling(req)) {
            saveAutomaticBillingService(type, req.billingGrossPrice(), req.billingTaxRate(), companyId);
        } else {
            saveLinkedServices(type, req.services() != null ? req.services() : List.of(), companyId);
        }
        purgeLocationPrices(type, companyId);
        TypeResponse result = toResponse(repo.findAllWithLinkedServicesByCompanyId(companyId).stream()
                .filter(t -> t.getId().equals(id))
                .findFirst()
                .orElseThrow(), groupsEnabled);
        recordService(me, ActivityAction.SERVICE_UPDATED, result, "Updated service", beforeAudit);
        return result;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/reorder")
    @Transactional
    public List<TypeResponse> reorder(@RequestBody TypeReorderRequest request, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        boolean groupsEnabled = serviceGroupsEnabled(companyId);
        List<TypeOrderItem> items = request == null || request.items() == null ? List.of() : request.items();
        for (TypeOrderItem item : items) {
            if (item == null || item.id() == null) continue;
            SessionType type = repo.findById(item.id())
                    .filter(candidate -> candidate.getCompany().getId().equals(companyId))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            if (groupsEnabled) type.setServiceGroup(resolveServiceGroup(companyId, item.serviceGroupId()));
            type.setGuestSortOrder(Math.max(0, item.sortOrder() == null ? 0 : item.sortOrder()));
            repo.save(type);
        }
        List<TypeResponse> result = repo.findAllWithLinkedServicesByCompanyId(companyId).stream()
                .sorted(sessionTypeOrder(groupsEnabled))
                .map(type -> toResponse(type, groupsEnabled))
                .toList();
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.SERVICES, ActivityAction.SERVICES_REORDERED,
                    "SERVICES", companyId, "Services", "Reordered services", null, null,
                    ActivityDetails.of("count", result.size(), "targetPath", "/session-types"));
        }
        return result;
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
        Long deletedId = type.getId();
        String deletedLabel = type.getDescription() == null ? type.getName() : type.getDescription();
        repo.delete(type);
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.SERVICES, ActivityAction.SERVICE_DELETED,
                    "SERVICE", deletedId, deletedLabel, "Deleted service", null, null,
                    ActivityDetails.of("targetPath", "/session-types"));
        }
    }

    private void recordService(User me, ActivityAction action, TypeResponse row, String summary, java.util.Map<String, Object> before) {
        if (activityLogs == null || row == null) return;
        var details = ActivityDetails.of(
                "active", row.active(), "durationMinutes", row.durationMinutes(),
                "serviceGroup", row.serviceGroupName(), "targetPath", "/session-types"
        );
        if (before != null) {
            details.put("before", before);
            details.put("after", ActivityDetails.of(
                    "description", row.description(), "active", row.active(),
                    "durationMinutes", row.durationMinutes(), "groupBookingEnabled", row.groupBookingEnabled(),
                    "widgetGroupBookingEnabled", row.widgetGroupBookingEnabled()));
        }
        activityLogs.recordUser(me, ActivityModule.SERVICES, action,
                "SERVICE", row.id(), row.description() == null ? row.name() : row.description(), summary, null, null, details);
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

    /**
     * Simplified service editor mode: every calendar service owns one automatically managed
     * transaction service. The transaction service remains a normal (non-system-generated)
     * billing row so invoices and existing billing selectors continue to work unchanged.
     */
    private void saveAutomaticBillingService(
            SessionType type,
            BigDecimal grossPrice,
            TaxRate requestedTaxRate,
            Long companyId
    ) {
        if (type == null || type.getId() == null) {
            throw new IllegalStateException("The service must be saved before its billing service is created.");
        }

        BigDecimal normalizedGross = grossPrice == null ? BigDecimal.ZERO : grossPrice;
        if (normalizedGross.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service price cannot be negative.");
        }
        TaxRate taxRate = requestedTaxRate == null ? TaxRate.VAT_22 : requestedTaxRate;
        String sourceKey = String.valueOf(type.getId());
        String description = normalizeServiceDescription(type.getDescription());
        if (description == null) description = type.getName();

        TransactionService tx = txRepo
                .findByCompanyIdAndSystemSourceAndSystemSourceKey(
                        companyId,
                        SESSION_TYPE_BILLING_SOURCE,
                        sourceKey
                )
                .orElseGet(TransactionService::new);

        boolean creating = tx.getId() == null;
        if (creating) {
            tx.setCompany(type.getCompany());
            tx.setCode(generateUniqueTransactionServiceCode(companyId, description));
        }
        // Keep the source mapping explicit on every save. The code is generated only once,
        // while the visible billing-service name follows the service description.
        tx.setSystemGenerated(false);
        tx.setSystemSource(SESSION_TYPE_BILLING_SOURCE);
        tx.setSystemSourceKey(sourceKey);
        tx.setDescription(description);
        tx.setTaxRate(taxRate);
        tx.setNetPrice(PriceMath.netFromGross(normalizedGross, taxRate));
        tx.setActive(type.isActive());
        tx = txRepo.save(tx);

        TypeTransactionService link = new TypeTransactionService();
        link.setSessionType(type);
        link.setTransactionService(tx);
        // Null means the session type follows the billing service's current default price.
        link.setPrice(null);
        type.getLinkedServices().add(link);
        repo.save(type);
    }

    private boolean usesAutomaticBilling(TypeRequest req) {
        return req != null && (req.billingGrossPrice() != null || req.billingTaxRate() != null);
    }

    private String generateUniqueTransactionServiceCode(Long companyId, String description) {
        String ascii = Normalizer.normalize(description == null ? "SERVICE" : description, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        String base = normalizeTransactionServiceCode(ascii);
        if (base == null) base = "SERVICE";

        if (txRepo.findByCompanyIdAndCodeIgnoreCase(companyId, base).isEmpty()) {
            return base;
        }
        for (int suffix = 2; suffix < 1_000_000; suffix++) {
            String suffixText = String.valueOf(suffix);
            int prefixLength = Math.max(1, SESSION_TYPE_CODE_MAX_LENGTH - suffixText.length());
            String candidate = base.substring(0, Math.min(base.length(), prefixLength)) + suffixText;
            if (txRepo.findByCompanyIdAndCodeIgnoreCase(companyId, candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "A unique billing service code could not be generated."
        );
    }

    private String normalizeTransactionServiceCode(String raw) {
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


    private void purgeLocationPrices(SessionType type, Long companyId) {
        if (locationPrices == null || type == null || type.getId() == null) return;
        List<Long> linkedIds = type.getLinkedServices().stream()
                .filter(link -> link != null && link.getTransactionService() != null && link.getTransactionService().getId() != null)
                .map(link -> link.getTransactionService().getId())
                .distinct()
                .toList();
        locationPrices.purgeUnlinked(companyId, type.getId(), linkedIds);
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

    private String normalizeInternalDescription(String raw) {
        if (raw == null) return null;
        String normalized = raw.trim();
        if (normalized.isEmpty()) return null;
        return normalized.length() <= 512 ? normalized : normalized.substring(0, 512);
    }

    private String normalizeServiceDescription(String raw) {
        if (raw == null) return null;
        String description = raw.trim();
        return description.isEmpty() ? null : description;
    }

    private String generateUniqueSessionTypeCode(Long companyId, String description) {
        String ascii = Normalizer.normalize(description, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        String base = normalizeSessionTypeCode(ascii);
        if (base == null) base = "SERVICE";

        if (repo.findByCompanyIdAndNameIgnoreCase(companyId, base).isEmpty()) {
            return base;
        }

        for (int suffix = 2; suffix < 1_000_000; suffix++) {
            String suffixText = String.valueOf(suffix);
            int prefixLength = Math.max(1, SESSION_TYPE_CODE_MAX_LENGTH - suffixText.length());
            String candidate = base.substring(0, Math.min(base.length(), prefixLength)) + suffixText;
            if (repo.findByCompanyIdAndNameIgnoreCase(companyId, candidate).isEmpty()) {
                return candidate;
            }
        }

        throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "A unique internal service code could not be generated."
        );
    }

    private void applyBreakSettings(SessionType type, TypeRequest req, Long companyId) {
        boolean overridden = req.breakMinutesOverridden() != null
                ? Boolean.TRUE.equals(req.breakMinutesOverridden())
                : req.breakMinutes() != null;
        type.setBreakMinutesOverridden(overridden);
        if (overridden) {
            type.setBreakMinutes(SessionTypeBreakSettingsService.normalizeSpecific(req.breakMinutes()));
        } else {
            int tenantDefault = breakSettings == null ? 0 : breakSettings.defaultBreakMinutes(companyId);
            type.setBreakMinutes(tenantDefault);
        }
    }

    private void ensureSessionTypeCodeUnique(Long companyId, String code, Long currentId) {
        var existing = repo.findByCompanyIdAndNameIgnoreCase(companyId, code);
        if (existing.isPresent() && !existing.get().getId().equals(currentId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Service code already exists for this tenant.");
        }
    }

    private TypeResponse toResponse(SessionType t, boolean groupsEnabled) {
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
        // Inherited service rows are synchronized whenever the tenant default changes,
        // so the effective value can be returned without an extra settings query per row.
        Integer breakMinutes = t.getBreakMinutes() != null ? t.getBreakMinutes() : 0;
        return new TypeResponse(
                t.getId(),
                t.getName(),
                t.getDescription(),
                t.getInternalDescription(),
                normalizeSessionTypeColor(t.getColor()),
                duration,
                breakMinutes,
                t.isBreakMinutesOverridden(),
                t.getMaxParticipantsPerSession(),
                t.isGroupBookingEnabled(),
                t.isWidgetGroupBookingEnabled(),
                t.isGuestBookingEnabled(),
                t.getPriceCalculationMode() != null ? t.getPriceCalculationMode() : SessionPriceCalculationMode.PER_CLIENT,
                t.isActive(),
                t.getCreatedAt(),
                parseGuestLimitUserEmails(t.getGuestLimitUserEmails()),
                !groupsEnabled || t.getServiceGroup() == null ? null : t.getServiceGroup().getId(),
                !groupsEnabled || t.getServiceGroup() == null ? null : t.getServiceGroup().getName(),
                groupsEnabled && t.getServiceGroup() != null && t.getServiceGroup().isActive(),
                !groupsEnabled || t.getServiceGroup() == null ? null : t.getServiceGroup().getSortOrder(),
                t.getGuestSortOrder(),
                t.isAvailableAllLocations(),
                t.getLocations().stream().map(Location::getId).sorted().toList(),
                services
        );
    }

    private void applyLocationVisibility(SessionType type, TypeRequest request, Long companyId, boolean creating) {
        if (locations == null) {
            if (creating) type.setAvailableAllLocations(true);
            return;
        }
        boolean visibilityProvided = request.availableAllLocations() != null || request.locationIds() != null;
        if (!creating && !visibilityProvided) return;

        boolean allLocations = request.availableAllLocations() == null
                ? request.locationIds() == null || request.locationIds().isEmpty()
                : Boolean.TRUE.equals(request.availableAllLocations());
        type.setAvailableAllLocations(allLocations);
        type.getLocations().clear();
        if (allLocations) return;

        List<Long> requestedIds = request.locationIds() == null ? List.of() : request.locationIds().stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (requestedIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Select at least one location or enable all locations.");
        }
        List<Location> resolved = locations.findAllByCompanyIdAndIdIn(companyId, requestedIds);
        if (resolved.size() != requestedIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "One or more selected locations do not belong to this operating unit.");
        }
        type.getLocations().addAll(resolved);
    }

    private ServiceGroup resolveServiceGroup(Long companyId, Long serviceGroupId) {
        if (serviceGroupId == null) return null;
        return groupRepo.findById(serviceGroupId)
                .filter(group -> group.getCompany().getId().equals(companyId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Service group not found."));
    }

    private int nextSortOrder(Long companyId, Long serviceGroupId) {
        return repo.findMaxSortOrderByCompanyIdAndServiceGroupId(companyId, serviceGroupId) + 1;
    }

    private boolean serviceGroupsEnabled(Long companyId) {
        return featureAccess == null || featureAccess.areServiceGroupsEnabled(companyId);
    }

    private Comparator<SessionType> sessionTypeOrder(boolean groupsEnabled) {
        if (!groupsEnabled) {
            return Comparator
                    .comparingInt(SessionType::getGuestSortOrder)
                    .thenComparing(SessionType::getName, String.CASE_INSENSITIVE_ORDER);
        }
        return Comparator
                .comparing((SessionType type) -> type.getServiceGroup() == null ? Integer.MAX_VALUE : type.getServiceGroup().getSortOrder())
                .thenComparing(type -> type.getServiceGroup() == null ? "" : type.getServiceGroup().getName(), String.CASE_INSENSITIVE_ORDER)
                .thenComparingInt(SessionType::getGuestSortOrder)
                .thenComparing(SessionType::getName, String.CASE_INSENSITIVE_ORDER);
    }

    private SessionPriceCalculationMode normalizePriceCalculationMode(SessionPriceCalculationMode mode) {
        return mode == null ? SessionPriceCalculationMode.PER_CLIENT : mode;
    }

    private void validateReservedGuestSpots(
            Integer maxParticipantsPerSession,
            boolean groupBookingEnabled,
            List<String> emails
    ) {
        if (!groupBookingEnabled || maxParticipantsPerSession == null || emails == null || emails.isEmpty()) {
            return;
        }
        long reservedSpots = emails.stream()
                .filter(email -> email != null && !email.isBlank())
                .map(email -> email.trim().toLowerCase(Locale.ROOT))
                .distinct()
                .count();
        if (reservedSpots > maxParticipantsPerSession) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Reserved guest emails cannot exceed max participants per session."
            );
        }
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
