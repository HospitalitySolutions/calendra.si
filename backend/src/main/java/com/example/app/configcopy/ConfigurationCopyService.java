package com.example.app.configcopy;

import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.customfield.CustomFieldDefinition;
import com.example.app.customfield.CustomFieldDefinitionRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.Space;
import com.example.app.session.SpaceRepository;
import com.example.app.session.TypeTransactionService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.workspaceservice.WorkspaceServiceTemplate;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ConfigurationCopyService {
    private static final Set<String> WORKING_HOURS_KEYS = Set.of(
            "WORKING_HOURS_START", "WORKING_HOURS_END", "DEFAULT_SERVICE_BREAK_MINUTES");
    private static final Set<String> BOOKING_RULE_KEYS = Set.of(
            "SESSION_LENGTH_MINUTES", "CALENDAR_TIME_SCALE_MINUTES", "TENANT_RESERVATION_RULES_JSON",
            "WAITLIST_SETTINGS_JSON", "PERSONAL_TASK_PRESETS_JSON");
    private static final Set<String> NOTIFICATION_KEYS = Set.of("NOTIFICATION_SETTINGS_JSON");
    private static final Set<String> INVOICE_KEYS = Set.of(
            "PAYMENT_DEADLINE_DAYS", "INVOICE_DELIVERY_EMAIL_ENABLED", "INVOICE_DELIVERY_EMAIL_SUBJECT",
            "INVOICE_DELIVERY_EMAIL_BODY", "DEFAULT_INVOICE_PRINT_FORMAT", "FOLIO_TEMPLATE_LAYOUT_JSON",
            "FOLIO_POS58_LAYOUT_JSON", "BANK_QR_PURPOSE_CODE", "BANK_QR_PURPOSE_TEXT");

    private final CompanyRepository companies;
    private final UserRepository users;
    private final SessionTypeRepository sessionTypes;
    private final TransactionServiceRepository transactionServices;
    private final AppSettingRepository settings;
    private final LocationRepository locations;
    private final SpaceRepository spaces;
    private final PaymentMethodRepository paymentMethods;
    private final CustomFieldDefinitionRepository customFields;
    private final ConfigurationCopyAuditLogRepository auditLogs;
    private final ObjectMapper objectMapper;

    public ConfigurationCopyService(
            CompanyRepository companies,
            UserRepository users,
            SessionTypeRepository sessionTypes,
            TransactionServiceRepository transactionServices,
            AppSettingRepository settings,
            LocationRepository locations,
            SpaceRepository spaces,
            PaymentMethodRepository paymentMethods,
            CustomFieldDefinitionRepository customFields,
            ConfigurationCopyAuditLogRepository auditLogs,
            ObjectMapper objectMapper
    ) {
        this.companies = companies;
        this.users = users;
        this.sessionTypes = sessionTypes;
        this.transactionServices = transactionServices;
        this.settings = settings;
        this.locations = locations;
        this.spaces = spaces;
        this.paymentMethods = paymentMethods;
        this.customFields = customFields;
        this.auditLogs = auditLogs;
        this.objectMapper = objectMapper;
    }

    public record CopyItem(ConfigurationCopyCategory category, String action, String key, String label, String reason) {}
    public record CopySummary(int createCount, int updateCount, int skipCount, int incompatibleCount) {}
    public record CopyPreview(Long sourceCompanyId, String sourceCompanyName, Long targetCompanyId,
                              String targetCompanyName, boolean overwriteExisting, List<CopyItem> items,
                              CopySummary summary) {}
    public record CopyRequest(Long sourceCompanyId, Long targetCompanyId,
                              Set<ConfigurationCopyCategory> categories, Boolean overwriteExisting) {}
    public record CopyResult(CopyPreview preview, int appliedCount, Long auditLogId) {}

    @Transactional(readOnly = true)
    public CopyPreview preview(CopyRequest request, User actor) {
        Context context = requireContext(request, actor);
        return buildPreview(context);
    }

    @Transactional
    public CopyResult execute(CopyRequest request, User actor) {
        Context context = requireContext(request, actor);
        CopyPreview preview = buildPreview(context);
        if (preview.summary().incompatibleCount() > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Resolve incompatible configuration items before copying.");
        }
        int applied = 0;
        List<ConfigurationCopyCategory> executionOrder = new ArrayList<>(context.categories());
        if (executionOrder.remove(ConfigurationCopyCategory.LOCATIONS_AND_SPACES)) {
            executionOrder.add(0, ConfigurationCopyCategory.LOCATIONS_AND_SPACES);
        }
        for (ConfigurationCopyCategory category : executionOrder) {
            applied += switch (category) {
                case SERVICES -> copyServices(context);
                case WORKING_HOURS -> copySettings(context, WORKING_HOURS_KEYS);
                case BOOKING_RULES -> copySettings(context, BOOKING_RULE_KEYS);
                case NOTIFICATION_TEMPLATES -> copySettings(context, NOTIFICATION_KEYS);
                case CUSTOM_FIELDS -> copyCustomFields(context);
                case LOCATIONS_AND_SPACES -> copyLocationsAndSpaces(context);
                case PAYMENT_METHODS -> copyPaymentMethods(context);
                case INVOICE_SETTINGS -> copySettings(context, INVOICE_KEYS);
            };
        }
        ConfigurationCopyAuditLog audit = new ConfigurationCopyAuditLog();
        audit.setWorkspace(context.source().getWorkspace());
        audit.setSourceCompany(context.source());
        audit.setTargetCompany(context.target());
        audit.setActor(actor);
        audit.setCategoriesJson(toJson(context.categories()));
        audit.setResultJson(toJson(Map.of("appliedCount", applied, "preview", preview)));
        audit = auditLogs.save(audit);
        return new CopyResult(preview, applied, audit.getId());
    }

    private CopyPreview buildPreview(Context context) {
        List<CopyItem> items = new ArrayList<>();
        for (ConfigurationCopyCategory category : context.categories()) {
            switch (category) {
                case SERVICES -> previewServices(context, items);
                case WORKING_HOURS -> previewSettings(context, WORKING_HOURS_KEYS, category, items);
                case BOOKING_RULES -> previewSettings(context, BOOKING_RULE_KEYS, category, items);
                case NOTIFICATION_TEMPLATES -> previewSettings(context, NOTIFICATION_KEYS, category, items);
                case CUSTOM_FIELDS -> previewCustomFields(context, items);
                case LOCATIONS_AND_SPACES -> previewLocationsAndSpaces(context, items);
                case PAYMENT_METHODS -> previewPaymentMethods(context, items);
                case INVOICE_SETTINGS -> previewSettings(context, INVOICE_KEYS, category, items);
            }
        }
        int creates = (int) items.stream().filter(i -> i.action().equals("CREATE")).count();
        int updates = (int) items.stream().filter(i -> i.action().equals("UPDATE")).count();
        int skips = (int) items.stream().filter(i -> i.action().equals("SKIP")).count();
        int incompatible = (int) items.stream().filter(i -> i.action().equals("INCOMPATIBLE")).count();
        return new CopyPreview(context.source().getId(), context.source().getName(), context.target().getId(),
                context.target().getName(), context.overwrite(), List.copyOf(items),
                new CopySummary(creates, updates, skips, incompatible));
    }

    private void previewServices(Context c, List<CopyItem> items) {
        List<SessionType> source = sessionTypes.findAllWithLinkedServicesByCompanyId(c.source().getId());
        Map<Long, SessionType> targetByTemplate = sessionTypes.findAllWithLinkedServicesByCompanyId(c.target().getId()).stream()
                .filter(t -> t.getWorkspaceServiceTemplate() != null)
                .collect(Collectors.toMap(t -> t.getWorkspaceServiceTemplate().getId(), Function.identity(), (a, b) -> a));
        Map<String, TransactionService> targetTx = transactionServices.findAllByCompanyId(c.target().getId()).stream()
                .collect(Collectors.toMap(t -> t.getCode().toLowerCase(Locale.ROOT), Function.identity(), (a, b) -> a));
        Set<String> targetLocationNames = locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(c.target().getId()).stream()
                .map(location -> location.getName().toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet());
        for (SessionType type : source) {
            WorkspaceServiceTemplate template = type.getWorkspaceServiceTemplate();
            if (template == null) {
                items.add(new CopyItem(ConfigurationCopyCategory.SERVICES, "INCOMPATIBLE", "sessionType:" + type.getId(),
                        displayName(type), "Source service is not linked to a workspace service template."));
                continue;
            }
            SessionType existing = targetByTemplate.get(template.getId());
            boolean willCopy = existing == null || c.overwrite();
            items.add(new CopyItem(ConfigurationCopyCategory.SERVICES,
                    existing == null ? "CREATE" : c.overwrite() ? "UPDATE" : "SKIP",
                    "template:" + template.getId(), displayName(type),
                    existing == null ? "Create a unit offering linked to the same workspace service."
                            : c.overwrite() ? "Update the existing linked unit offering."
                            : "A linked unit offering already exists."));
            if (!willCopy) continue;
            if (!type.isAvailableAllLocations()) {
                List<String> missingLocations = type.getLocations().stream()
                        .map(Location::getName)
                        .filter(name -> !targetLocationNames.contains(name.toLowerCase(Locale.ROOT)))
                        .sorted(String.CASE_INSENSITIVE_ORDER)
                        .toList();
                if (!missingLocations.isEmpty()
                        && !c.categories().contains(ConfigurationCopyCategory.LOCATIONS_AND_SPACES)) {
                    items.add(new CopyItem(ConfigurationCopyCategory.SERVICES, "INCOMPATIBLE",
                            "templateLocations:" + template.getId(), displayName(type),
                            "Target is missing service locations: " + String.join(", ", missingLocations)
                                    + ". Include Locations and rooms in this copy."));
                }
            }
            for (TypeTransactionService link : type.getLinkedServices()) {
                TransactionService sourceTx = link.getTransactionService();
                TransactionService targetMatch = targetTx.get(sourceTx.getCode().toLowerCase(Locale.ROOT));
                if (targetMatch != null && targetMatch.getTaxRate() != sourceTx.getTaxRate()) {
                    items.add(new CopyItem(ConfigurationCopyCategory.SERVICES, "INCOMPATIBLE",
                            "transactionService:" + sourceTx.getId(), sourceTx.getCode(),
                            "The target has the same billing-service code with a different tax rate."));
                }
            }
        }
    }

    private void previewSettings(Context c, Set<String> keys, ConfigurationCopyCategory category, List<CopyItem> items) {
        Map<String, AppSetting> target = settings.findAllByCompanyId(c.target().getId()).stream()
                .collect(Collectors.toMap(AppSetting::getKey, Function.identity(), (a, b) -> a));
        settings.findAllByCompanyId(c.source().getId()).stream().filter(s -> keys.contains(s.getKey())).forEach(source -> {
            boolean exists = target.containsKey(source.getKey());
            items.add(new CopyItem(category, exists ? c.overwrite() ? "UPDATE" : "SKIP" : "CREATE",
                    source.getKey(), source.getKey(), exists ? "Target already has this setting." : "Copy setting."));
        });
    }

    private void previewCustomFields(Context c, List<CopyItem> items) {
        List<CustomFieldDefinition> target = customFields.findAllByCompanyIdOrderByAppliesToAscSortOrderAscNameAscIdAsc(c.target().getId());
        for (CustomFieldDefinition source : customFields.findAllByCompanyIdOrderByAppliesToAscSortOrderAscNameAscIdAsc(c.source().getId())) {
            CustomFieldDefinition existing = target.stream().filter(t -> t.getAppliesTo() == source.getAppliesTo()
                    && t.getName().equalsIgnoreCase(source.getName())).findFirst().orElse(null);
            boolean exists = existing != null;
            boolean incompatible = exists && c.overwrite() && existing.getFieldType() != source.getFieldType();
            items.add(new CopyItem(ConfigurationCopyCategory.CUSTOM_FIELDS,
                    incompatible ? "INCOMPATIBLE" : exists ? c.overwrite() ? "UPDATE" : "SKIP" : "CREATE",
                    source.getAppliesTo() + ":" + source.getName(), source.getName(),
                    incompatible ? "The target field uses a different field type; changing it could invalidate existing values."
                            : exists ? "A target field with the same name and scope exists." : "Create custom field definition."));
        }
    }

    private void previewPaymentMethods(Context c, List<CopyItem> items) {
        List<PaymentMethod> target = paymentMethods.findAllByCompanyIdOrderByNameAsc(c.target().getId());
        for (PaymentMethod source : paymentMethods.findAllByCompanyIdOrderByNameAsc(c.source().getId())) {
            PaymentMethod existing = target.stream().filter(t -> t.getName().equalsIgnoreCase(source.getName())).findFirst().orElse(null);
            boolean exists = existing != null;
            boolean incompatible = exists && c.overwrite() && existing.getPaymentType() != source.getPaymentType();
            items.add(new CopyItem(ConfigurationCopyCategory.PAYMENT_METHODS,
                    incompatible ? "INCOMPATIBLE" : exists ? c.overwrite() ? "UPDATE" : "SKIP" : "CREATE",
                    source.getName(), source.getName(), incompatible
                            ? "The target payment method has a different accounting type."
                            : exists ? "A target payment method with the same name exists."
                            : source.isAvailableAllLocations()
                                ? "Create payment method for all target locations."
                                : "Create payment method and map its selected-location scope by matching location names; unmatched branches stay unavailable."));
        }
    }

    private void previewLocationsAndSpaces(Context c, List<CopyItem> items) {
        List<Location> targetLocations = locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(c.target().getId());
        List<Space> targetSpaces = spaces.findAllByCompanyId(c.target().getId());
        for (Location source : locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(c.source().getId())) {
            Location existing = targetLocations.stream().filter(t -> t.getName().equalsIgnoreCase(source.getName())).findFirst().orElse(null);
            items.add(new CopyItem(ConfigurationCopyCategory.LOCATIONS_AND_SPACES,
                    existing == null ? "CREATE" : c.overwrite() ? "UPDATE" : "SKIP", "location:" + source.getId(),
                    source.getName(), existing == null
                            ? "Create location with its public presentation, without fiscal-premise, issuer, logo-object or Google Place identifiers."
                            : "Target location already exists; public presentation may be updated, while legal, fiscal, logo-object and Google Place identifiers are never overwritten."));
        }
        Map<Long, Location> sourceLocations = locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(c.source().getId())
                .stream().collect(Collectors.toMap(Location::getId, Function.identity()));
        for (Space source : spaces.findAllByCompanyId(c.source().getId())) {
            Location sourceLocation = sourceLocations.get(source.getLocation().getId());
            String key = sourceLocation.getName() + "/" + source.getName();
            Location targetLocation = targetLocations.stream()
                    .filter(location -> location.getName().equalsIgnoreCase(sourceLocation.getName()))
                    .findFirst().orElse(null);
            boolean exists = targetLocation != null && targetSpaces.stream().anyMatch(space ->
                    space.getLocation().getId().equals(targetLocation.getId())
                            && space.getName().equalsIgnoreCase(source.getName()));
            items.add(new CopyItem(ConfigurationCopyCategory.LOCATIONS_AND_SPACES,
                    exists ? c.overwrite() ? "UPDATE" : "SKIP" : "CREATE", key, key,
                    exists ? "A room with this name already exists in the target location." : "Create room."));
        }
    }

    private int copyServices(Context c) {
        int changed = 0;
        List<SessionType> sourceTypes = sessionTypes.findAllWithLinkedServicesByCompanyId(c.source().getId());
        Map<Long, SessionType> targetByTemplate = sessionTypes.findAllWithLinkedServicesByCompanyId(c.target().getId()).stream()
                .filter(t -> t.getWorkspaceServiceTemplate() != null)
                .collect(Collectors.toMap(t -> t.getWorkspaceServiceTemplate().getId(), Function.identity(), (a, b) -> a));
        Map<String, TransactionService> targetTx = transactionServices.findAllByCompanyId(c.target().getId()).stream()
                .collect(Collectors.toMap(t -> t.getCode().toLowerCase(Locale.ROOT), Function.identity(), (a, b) -> a));
        for (SessionType source : sourceTypes) {
            if (source.getWorkspaceServiceTemplate() == null) continue;
            SessionType target = targetByTemplate.get(source.getWorkspaceServiceTemplate().getId());
            if (target != null && !c.overwrite()) continue;
            if (target == null) {
                target = new SessionType();
                target.setCompany(c.target());
                target.setWorkspaceServiceTemplate(source.getWorkspaceServiceTemplate());
                target.setName(uniqueSessionCode(c.target().getId(), source.getName()));
            }
            copySessionTypeFields(source, target);
            copySessionTypeLocations(source, target, c.target().getId());
            target.getLinkedServices().clear();
            for (TypeTransactionService sourceLink : source.getLinkedServices()) {
                TransactionService sourceTx = sourceLink.getTransactionService();
                TransactionService targetService = targetTx.get(sourceTx.getCode().toLowerCase(Locale.ROOT));
                if (targetService == null) {
                    targetService = new TransactionService();
                    targetService.setCompany(c.target());
                    targetService.setCode(uniqueTransactionCode(c.target().getId(), sourceTx.getCode()));
                    copyTransactionServiceFields(sourceTx, targetService);
                    targetService = transactionServices.save(targetService);
                    targetTx.put(targetService.getCode().toLowerCase(Locale.ROOT), targetService);
                } else if (c.overwrite()) {
                    copyTransactionServiceFields(sourceTx, targetService);
                    targetService = transactionServices.save(targetService);
                }
                TypeTransactionService link = new TypeTransactionService();
                link.setSessionType(target);
                link.setTransactionService(targetService);
                link.setPrice(sourceLink.getPrice());
                target.getLinkedServices().add(link);
            }
            sessionTypes.save(target);
            changed++;
        }
        return changed;
    }

    private int copySettings(Context c, Set<String> keys) {
        int changed = 0;
        Map<String, AppSetting> target = settings.findAllByCompanyId(c.target().getId()).stream()
                .collect(Collectors.toMap(AppSetting::getKey, Function.identity(), (a, b) -> a));
        for (AppSetting source : settings.findAllByCompanyId(c.source().getId())) {
            if (!keys.contains(source.getKey())) continue;
            AppSetting row = target.get(source.getKey());
            if (row != null && !c.overwrite()) continue;
            if (row == null) {
                row = new AppSetting();
                row.setCompany(c.target());
                row.setKey(source.getKey());
            }
            row.setValue(source.getValue());
            settings.save(row);
            changed++;
        }
        return changed;
    }

    private int copyCustomFields(Context c) {
        int changed = 0;
        List<CustomFieldDefinition> targetRows = customFields.findAllByCompanyIdOrderByAppliesToAscSortOrderAscNameAscIdAsc(c.target().getId());
        for (CustomFieldDefinition source : customFields.findAllByCompanyIdOrderByAppliesToAscSortOrderAscNameAscIdAsc(c.source().getId())) {
            CustomFieldDefinition target = targetRows.stream().filter(t -> t.getAppliesTo() == source.getAppliesTo()
                    && t.getName().equalsIgnoreCase(source.getName())).findFirst().orElse(null);
            if (target != null && !c.overwrite()) continue;
            if (target == null) {
                target = new CustomFieldDefinition();
                target.setCompany(c.target());
                target.setAppliesTo(source.getAppliesTo());
                target.setName(source.getName());
                targetRows.add(target);
            }
            target.setFieldType(source.getFieldType());
            target.setRequired(source.isRequired());
            target.setShowInList(source.isShowInList());
            target.setSortOrder(source.getSortOrder());
            target.setActive(source.isActive());
            target.setOptionsJson(source.getOptionsJson());
            customFields.save(target);
            changed++;
        }
        return changed;
    }

    private int copyPaymentMethods(Context c) {
        int changed = 0;
        List<PaymentMethod> targetRows = paymentMethods.findAllByCompanyIdOrderByNameAsc(c.target().getId());
        for (PaymentMethod source : paymentMethods.findAllByCompanyIdOrderByNameAsc(c.source().getId())) {
            PaymentMethod target = targetRows.stream().filter(t -> t.getName().equalsIgnoreCase(source.getName())).findFirst().orElse(null);
            if (target != null && !c.overwrite()) continue;
            boolean created = target == null;
            if (target == null) {
                target = new PaymentMethod();
                target.setCompany(c.target());
                target.setName(source.getName());
                targetRows.add(target);
            }
            target.setPaymentType(source.getPaymentType());
            target.setFiscalized(source.isFiscalized());
            if (created) target.setStripeEnabled(false); // provider onboarding is unit/legal-entity specific
            target.setGuestEnabled(source.isGuestEnabled());
            target.setWidgetEnabled(source.isWidgetEnabled());
            target.setGuestDisplayOrder(source.getGuestDisplayOrder());
            target.setAllowedGuestProductTypesJson(source.getAllowedGuestProductTypesJson());
            copyPaymentMethodLocationScope(source, target, c.target().getId());
            paymentMethods.save(target);
            changed++;
        }
        return changed;
    }

    private void copyPaymentMethodLocationScope(PaymentMethod source, PaymentMethod target, Long targetCompanyId) {
        target.setAvailableAllLocations(source.isAvailableAllLocations());
        target.getLocations().clear();
        if (source.isAvailableAllLocations() || source.getLocations() == null || source.getLocations().isEmpty()) {
            return;
        }
        List<Location> targetLocations = locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(targetCompanyId);
        for (Location sourceLocation : source.getLocations()) {
            if (sourceLocation == null || sourceLocation.getName() == null) continue;
            targetLocations.stream()
                    .filter(candidate -> candidate.getName() != null && candidate.getName().equalsIgnoreCase(sourceLocation.getName()))
                    .findFirst()
                    .ifPresent(target.getLocations()::add);
        }
        // Never broaden a restricted source method when no matching branch exists in the target.
        // An empty selected-location allowlist intentionally keeps the copied method unavailable
        // until an administrator maps it to target locations.
    }

    private int copyLocationsAndSpaces(Context c) {
        int changed = 0;
        List<Location> sourceLocations = locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(c.source().getId());
        List<Location> targetLocations = locations.findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(c.target().getId());
        Map<Long, Location> targetBySourceId = new HashMap<>();
        for (Location source : sourceLocations) {
            Location target = targetLocations.stream().filter(t -> t.getName().equalsIgnoreCase(source.getName())).findFirst().orElse(null);
            if (target == null) {
                target = new Location();
                target.setCompany(c.target());
                target.setName(source.getName());
                target.setDefaultLocation(targetLocations.isEmpty());
                target.setDefaultLegalEntity(targetLocations.stream().filter(Location::isDefaultLocation).findFirst()
                        .map(Location::getDefaultLegalEntity).orElse(null));
                targetLocations.add(target);
            } else if (!c.overwrite()) {
                targetBySourceId.put(source.getId(), target);
                continue;
            }
            target.setAddress(source.getAddress());
            target.setPostalCode(source.getPostalCode());
            target.setCity(source.getCity());
            target.setCountry(source.getCountry());
            target.setTimezone(source.getTimezone());
            target.setPhone(source.getPhone());
            target.setEmail(source.getEmail());
            target.setOpeningHoursJson(source.getOpeningHoursJson());
            target.setPublicName(source.getPublicName());
            target.setPublicAddress(source.getPublicAddress());
            target.setPublicDescription(source.getPublicDescription());
            target.setPublicDirectoryEnabled(source.isPublicDirectoryEnabled());
            target.setGuestAppDiscoverable(source.isGuestAppDiscoverable());
            target.setWebsitePresentationEnabled(source.isWebsitePresentationEnabled());
            target.setPublicBookingEnabled(source.isPublicBookingEnabled());
            target.setActive(source.isActive());
            // Public logo object keys, Google Place IDs, fiscal-premise and issuer fields are
            // branch/tenant-specific and intentionally stay target-specific.
            target = locations.save(target);
            targetBySourceId.put(source.getId(), target);
            changed++;
        }
        for (Space source : spaces.findAllByCompanyId(c.source().getId())) {
            Location targetLocation = targetBySourceId.get(source.getLocation().getId());
            if (targetLocation == null) continue;
            Space existing = spaces.findAllByCompanyId(c.target().getId()).stream()
                    .filter(s -> s.getLocation().getId().equals(targetLocation.getId())
                            && s.getName().equalsIgnoreCase(source.getName())).findFirst().orElse(null);
            if (existing != null && !c.overwrite()) continue;
            Space target = existing == null ? new Space() : existing;
            target.setCompany(c.target());
            target.setLocation(targetLocation);
            target.setName(source.getName());
            target.setDescription(source.getDescription());
            spaces.save(target);
            changed++;
        }
        return changed;
    }

    private void copySessionTypeLocations(SessionType source, SessionType target, Long targetCompanyId) {
        target.setAvailableAllLocations(source.isAvailableAllLocations());
        target.getLocations().clear();
        if (source.isAvailableAllLocations()) return;

        Map<String, Location> targetByName = locations
                .findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(targetCompanyId).stream()
                .collect(Collectors.toMap(
                        location -> location.getName().toLowerCase(Locale.ROOT),
                        Function.identity(),
                        (a, b) -> a));
        for (Location sourceLocation : source.getLocations()) {
            Location targetLocation = targetByName.get(sourceLocation.getName().toLowerCase(Locale.ROOT));
            if (targetLocation == null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Target location is missing for service visibility: " + sourceLocation.getName());
            }
            target.getLocations().add(targetLocation);
        }
        if (target.getLocations().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A location-restricted service must have at least one target location.");
        }
    }

    private void copySessionTypeFields(SessionType source, SessionType target) {
        target.setDescription(source.getDescription());
        target.setInternalDescription(source.getInternalDescription());
        target.setServiceGroup(null); // groups are unit-specific and are never silently cross-linked
        target.setColor(source.getColor());
        target.setDurationMinutes(source.getDurationMinutes());
        target.setBreakMinutes(source.getBreakMinutes());
        target.setBreakMinutesOverridden(source.isBreakMinutesOverridden());
        target.setMaxParticipantsPerSession(source.getMaxParticipantsPerSession());
        target.setWidgetGroupBookingEnabled(source.isWidgetGroupBookingEnabled());
        target.setGuestBookingEnabled(source.isGuestBookingEnabled());
        target.setGroupBookingEnabled(source.isGroupBookingEnabled());
        target.setGuestLimitUserEmails(null); // client/user allowlists are not portable between units
        target.setPriceCalculationMode(source.getPriceCalculationMode());
        target.setGuestBookingDescription(source.getGuestBookingDescription());
        target.setGuestSortOrder(source.getGuestSortOrder());
        target.setActive(source.isActive());
    }

    private void copyTransactionServiceFields(TransactionService source, TransactionService target) {
        target.setDescription(source.getDescription());
        target.setTaxRate(source.getTaxRate());
        target.setNetPrice(source.getNetPrice());
        target.setActive(source.isActive());
    }

    private String uniqueSessionCode(Long companyId, String preferred) {
        String base = normalizeCode(preferred, "SERVICE");
        if (sessionTypes.findByCompanyIdAndNameIgnoreCase(companyId, base).isEmpty()) return base;
        for (int i = 2; i < 1000; i++) {
            String suffix = "-" + i;
            String candidate = base.substring(0, Math.min(base.length(), 12 - suffix.length())) + suffix;
            if (sessionTypes.findByCompanyIdAndNameIgnoreCase(companyId, candidate).isEmpty()) return candidate;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Unable to create a unique service code.");
    }

    private String uniqueTransactionCode(Long companyId, String preferred) {
        String base = normalizeCode(preferred, "ITEM");
        if (transactionServices.findByCompanyIdAndCodeIgnoreCase(companyId, base).isEmpty()) return base;
        for (int i = 2; i < 1000; i++) {
            String suffix = "-" + i;
            String candidate = base.substring(0, Math.min(base.length(), 12 - suffix.length())) + suffix;
            if (transactionServices.findByCompanyIdAndCodeIgnoreCase(companyId, candidate).isEmpty()) return candidate;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Unable to create a unique billing-service code.");
    }

    private String normalizeCode(String raw, String fallback) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_-]", "-");
        value = value.replaceAll("-+", "-").replaceAll("^-|-$", "");
        if (value.isBlank()) value = fallback;
        return value.substring(0, Math.min(12, value.length()));
    }

    private String displayName(SessionType type) {
        return type.getDescription() == null || type.getDescription().isBlank() ? type.getName() : type.getDescription();
    }

    private Context requireContext(CopyRequest request, User actor) {
        if (request == null || request.sourceCompanyId() == null || request.targetCompanyId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Source and target units are required.");
        }
        if (Objects.equals(request.sourceCompanyId(), request.targetCompanyId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Source and target units must be different.");
        }
        Company source = companies.findById(request.sourceCompanyId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Company target = companies.findById(request.targetCompanyId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Long workspaceId = actor.getCompany().getWorkspace().getId();
        if (!workspaceId.equals(source.getWorkspace().getId()) || !workspaceId.equals(target.getWorkspace().getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        Map<Long, User> memberships = users.findActiveWorkspaceMemberships(actor.getLoginAccount().getId(), workspaceId).stream()
                .collect(Collectors.toMap(u -> u.getCompany().getId(), Function.identity(), (a, b) -> a));
        User sourceMembership = memberships.get(source.getId());
        User targetMembership = memberships.get(target.getId());
        if (!isAdmin(sourceMembership) || !isAdmin(targetMembership)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Administrator access is required in both the source and target units.");
        }
        Set<ConfigurationCopyCategory> categories = request.categories() == null || request.categories().isEmpty()
                ? EnumSet.of(ConfigurationCopyCategory.SERVICES)
                : EnumSet.copyOf(request.categories());
        return new Context(source, target, categories, Boolean.TRUE.equals(request.overwriteExisting()));
    }

    private boolean isAdmin(User membership) {
        return membership != null && (membership.getRole().name().equals("ADMIN") || membership.getRole().name().equals("SUPER_ADMIN"));
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            return "{}";
        }
    }

    private record Context(Company source, Company target, Set<ConfigurationCopyCategory> categories, boolean overwrite) {}
}
