package com.example.app.billingissuer;

import com.example.app.billing.Bill;
import com.example.app.billing.BillPaymentSplitSupport;
import com.example.app.billing.BillRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.location.Location;
import com.example.app.location.LocationRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.settings.SettingsCryptoService;
import com.example.app.user.User;
import com.example.app.workspaceclient.WorkspaceClientAccessService;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/billing")
public class BillingIssuerController {
    private final LegalEntityRepository legalEntities;
    private final CompanyLegalEntityRepository assignments;
    private final InvoiceSeriesRepository series;
    private final InvoiceIssuanceService issuance;
    private final CompanyRepository companies;
    private final LocationRepository locations;
    private final BillRepository bills;
    private final WorkspaceClientAccessService accessService;
    private final SettingsCryptoService crypto;

    public BillingIssuerController(
            LegalEntityRepository legalEntities,
            CompanyLegalEntityRepository assignments,
            InvoiceSeriesRepository series,
            InvoiceIssuanceService issuance,
            CompanyRepository companies,
            LocationRepository locations,
            BillRepository bills,
            WorkspaceClientAccessService accessService,
            SettingsCryptoService crypto
    ) {
        this.legalEntities = legalEntities;
        this.assignments = assignments;
        this.series = series;
        this.issuance = issuance;
        this.companies = companies;
        this.locations = locations;
        this.bills = bills;
        this.accessService = accessService;
        this.crypto = crypto;
    }

    public record LegalEntityInput(
            String name,
            String address,
            String postalCode,
            String city,
            String country,
            String taxNumber,
            String vatId,
            String iban,
            String bic,
            String email,
            String telephone,
            String currency,
            String fiscalEnvironment,
            String softwareSupplierTaxNumber,
            String certificatePassword,
            Boolean active
    ) {}

    public record UnitAssignmentResponse(
            Long companyId,
            String companyName,
            boolean defaultIssuer,
            boolean active,
            Long defaultInvoiceSeriesId
    ) {}

    public record LegalEntityResponse(
            Long id,
            String name,
            String address,
            String postalCode,
            String city,
            String country,
            String taxNumber,
            String vatId,
            String iban,
            String bic,
            String email,
            String telephone,
            String currency,
            String fiscalEnvironment,
            String softwareSupplierTaxNumber,
            boolean certificatePasswordConfigured,
            boolean active,
            boolean assignedToCurrentUnit,
            boolean defaultForCurrentUnit,
            Long defaultInvoiceSeriesId,
            List<UnitAssignmentResponse> assignments
    ) {}

    public record AssignmentInput(Long companyId, Boolean defaultIssuer, Boolean active) {}

    public record InvoiceSeriesInput(
            Long legalEntityId,
            Long companyId,
            Long locationId,
            String name,
            String nextNumber,
            String initialNumber,
            String resetPolicy,
            String businessPremiseCode,
            String electronicDeviceId,
            Boolean active,
            Boolean defaultForCurrentUnit
    ) {}

    public record InvoiceSeriesResponse(
            Long id,
            Long legalEntityId,
            String legalEntityName,
            Long companyId,
            String companyName,
            Long locationId,
            String locationName,
            String name,
            String nextNumber,
            String initialNumber,
            String resetPolicy,
            Integer lastResetYear,
            String businessPremiseCode,
            String electronicDeviceId,
            boolean active,
            boolean sharedAcrossUnits,
            boolean defaultForCurrentUnit
    ) {}

    public record DefaultSeriesInput(Long invoiceSeriesId) {}

    public record WorkspaceBillResponse(
            Long id,
            String billNumber,
            String billType,
            LocalDate issueDate,
            String paymentStatus,
            String fiscalStatus,
            java.math.BigDecimal totalNet,
            java.math.BigDecimal totalGross,
            java.math.BigDecimal pendingPaymentGross,
            Long companyId,
            String companyName,
            Long locationId,
            String locationName,
            Long legalEntityId,
            String issuerName,
            Long invoiceSeriesId,
            String invoiceSeriesName,
            Long clientId,
            String clientName
    ) {}

    @GetMapping("/issuers")
    @Transactional(readOnly = true)
    public List<LegalEntityResponse> issuers(@AuthenticationPrincipal User me) {
        WorkspaceClientAccessService.AccessSnapshot access = accessService.snapshot(me);
        Set<Long> visibleCompanies = access.companyIds();
        Map<Long, List<CompanyLegalEntity>> assignmentsByLegal = new HashMap<>();
        assignments.findAllByCompanyIdInOrderByCompanyIdAscDefaultIssuerDescIdAsc(visibleCompanies).forEach(assignment ->
                assignmentsByLegal.computeIfAbsent(assignment.getLegalEntity().getId(), ignored -> new ArrayList<>()).add(assignment));
        Long currentCompanyId = me.getCompany().getId();
        return legalEntities.findAllByWorkspaceIdOrderByActiveDescNameAscIdAsc(access.workspaceId()).stream()
                .filter(entity -> assignmentsByLegal.containsKey(entity.getId()))
                .map(entity -> response(entity, assignmentsByLegal.get(entity.getId()), currentCompanyId))
                .toList();
    }

    @PostMapping("/issuers")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public LegalEntityResponse createIssuer(@RequestBody LegalEntityInput input, @AuthenticationPrincipal User me) {
        requireInput(input);
        Long workspaceId = me.getCompany().getWorkspace().getId();
        String name = required(input.name(), "Issuer name is required.");
        if (legalEntities.existsByWorkspaceIdAndNameIgnoreCase(workspaceId, name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An issuer with this name already exists in the workspace.");
        }
        LegalEntity entity = new LegalEntity();
        entity.setWorkspace(me.getCompany().getWorkspace());
        apply(entity, input);
        entity = legalEntities.save(entity);

        CompanyLegalEntity assignment = new CompanyLegalEntity();
        assignment.setCompany(me.getCompany());
        assignment.setLegalEntity(entity);
        assignment.setActive(entity.isActive());
        assignment.setDefaultIssuer(entity.isActive()
                && assignments.findFirstByCompanyIdAndActiveTrueOrderByDefaultIssuerDescIdAsc(me.getCompany().getId()).isEmpty());
        assignments.save(assignment);
        return response(entity, List.of(assignment), me.getCompany().getId());
    }

    @PutMapping("/issuers/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public LegalEntityResponse updateIssuer(@PathVariable Long id, @RequestBody LegalEntityInput input, @AuthenticationPrincipal User me) {
        requireInput(input);
        WorkspaceClientAccessService.AccessSnapshot access = accessService.snapshot(me);
        LegalEntity entity = legalEntities.findByIdAndWorkspaceId(id, access.workspaceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<CompanyLegalEntity> linked = assignments.findAllByLegalEntityId(id);
        if (linked.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        accessService.requireAdminForCompanies(me, linked.stream().map(row -> row.getCompany().getId()).toList());
        String name = required(input.name(), "Issuer name is required.");
        boolean duplicate = legalEntities.findAllByWorkspaceIdOrderByActiveDescNameAscIdAsc(access.workspaceId()).stream()
                .anyMatch(other -> !Objects.equals(other.getId(), id) && other.getName().equalsIgnoreCase(name));
        if (duplicate) throw new ResponseStatusException(HttpStatus.CONFLICT, "An issuer with this name already exists in the workspace.");
        if (Boolean.FALSE.equals(input.active()) && linked.stream().anyMatch(row -> row.isActive())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Deactivate the issuer in every operating unit before deactivating the legal entity.");
        }
        apply(entity, input);
        entity = legalEntities.save(entity);
        return response(entity, visibleAssignments(linked, access.companyIds()), me.getCompany().getId());
    }

    @DeleteMapping("/issuers/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public void deleteIssuer(@PathVariable Long id, @AuthenticationPrincipal User me) {
        WorkspaceClientAccessService.AccessSnapshot access = accessService.snapshot(me);
        LegalEntity entity = legalEntities.findByIdAndWorkspaceId(id, access.workspaceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        List<CompanyLegalEntity> linked = assignments.findAllByLegalEntityId(id);
        if (linked.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        accessService.requireAdminForCompanies(me, linked.stream().map(row -> row.getCompany().getId()).toList());
        if (bills.countByLegalEntityId(id) > 0 || series.countByLegalEntityId(id) > 0
                || locations.countByDefaultLegalEntityId(id) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Issuer is in use. Change location defaults and deactivate it instead of deleting it.");
        }
        assignments.deleteAll(linked);
        legalEntities.delete(entity);
    }

    @PostMapping("/issuers/{id}/assignments")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public LegalEntityResponse assignIssuer(@PathVariable Long id, @RequestBody AssignmentInput input, @AuthenticationPrincipal User me) {
        if (input == null || input.companyId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Operating unit is required.");
        WorkspaceClientAccessService.AccessSnapshot access = accessService.snapshot(me);
        accessService.requireAdminForCompanies(me, List.of(input.companyId()));
        LegalEntity entity = legalEntities.findByIdAndWorkspaceId(id, access.workspaceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Company company = companies.findById(input.companyId())
                .filter(candidate -> Objects.equals(candidate.getWorkspace().getId(), access.workspaceId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Operating unit belongs to another workspace."));
        CompanyLegalEntity assignment = assignments.findByCompanyIdAndLegalEntityId(company.getId(), entity.getId())
                .orElseGet(CompanyLegalEntity::new);
        boolean requestedActive = input.active() == null || input.active();
        if (requestedActive && !entity.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An inactive legal entity cannot be assigned as an active issuer.");
        }
        if (Boolean.TRUE.equals(input.defaultIssuer()) && !requestedActive) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The default issuer must remain active.");
        }
        if (assignment.getId() != null && assignment.isDefaultIssuer() && !requestedActive) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Choose another default issuer before deactivating this assignment.");
        }
        if (!requestedActive && locations.countByCompanyIdAndDefaultLegalEntityId(company.getId(), entity.getId()) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Choose another default issuer for the unit's locations before deactivating this assignment.");
        }
        assignment.setCompany(company);
        assignment.setLegalEntity(entity);
        assignment.setActive(requestedActive);
        if (Boolean.TRUE.equals(input.defaultIssuer())) {
            clearDefaultIssuer(company.getId(), assignment.getId());
            assignment.setDefaultIssuer(true);
        } else if (assignment.getId() == null) {
            assignment.setDefaultIssuer(assignments.findFirstByCompanyIdAndActiveTrueOrderByDefaultIssuerDescIdAsc(company.getId()).isEmpty());
        }
        assignments.save(assignment);
        return response(entity, visibleAssignments(assignments.findAllByLegalEntityId(id), access.companyIds()), me.getCompany().getId());
    }

    @DeleteMapping("/issuers/{id}/assignments/{companyId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public void removeAssignment(@PathVariable Long id, @PathVariable Long companyId, @AuthenticationPrincipal User me) {
        accessService.requireAdminForCompanies(me, List.of(companyId));
        CompanyLegalEntity assignment = assignments.findByCompanyIdAndLegalEntityId(companyId, id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (assignment.isDefaultIssuer()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Choose another default issuer before removing this assignment.");
        }
        if (assignments.findAllByLegalEntityId(id).size() <= 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An issuer must remain assigned to at least one operating unit. Delete the issuer instead.");
        }
        if (locations.countByCompanyIdAndDefaultLegalEntityId(companyId, id) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Choose another default issuer for this unit's locations before removing the assignment.");
        }
        boolean seriesInUse = series.findAllByLegalEntityIdOrderByActiveDescNameAscIdAsc(id).stream()
                .anyMatch(candidate -> candidate.getCompany() != null && Objects.equals(candidate.getCompany().getId(), companyId));
        if (seriesInUse) throw new ResponseStatusException(HttpStatus.CONFLICT, "Remove or deactivate unit-specific invoice series first.");
        assignments.delete(assignment);
    }

    @GetMapping("/invoice-series")
    @Transactional(readOnly = true)
    public List<InvoiceSeriesResponse> invoiceSeries(
            @RequestParam(name = "legalEntityId", required = false) Long legalEntityId,
            @RequestParam(name = "locationId", required = false) Long locationId,
            @AuthenticationPrincipal User me
    ) {
        Long companyId = me.getCompany().getId();
        Map<Long, Long> defaults = defaultSeriesByLegalEntity(companyId);
        return issuance.availableSeries(companyId, legalEntityId, locationId).stream()
                .map(value -> seriesResponse(value, Objects.equals(defaults.get(value.getLegalEntity().getId()), value.getId())))
                .toList();
    }

    @PostMapping("/invoice-series")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public InvoiceSeriesResponse createSeries(@RequestBody InvoiceSeriesInput input, @AuthenticationPrincipal User me) {
        if (input == null || input.legalEntityId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Issuer is required.");
        WorkspaceClientAccessService.AccessSnapshot access = accessService.snapshot(me);
        Long companyId = input.companyId() == null ? null : input.companyId();
        if (companyId != null) accessService.requireAdminForCompanies(me, List.of(companyId));
        LegalEntity issuer = legalEntities.findByIdAndWorkspaceId(input.legalEntityId(), access.workspaceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Issuer not found."));
        Long currentCompanyId = me.getCompany().getId();
        assignments.findByCompanyIdAndLegalEntityId(currentCompanyId, issuer.getId())
                .filter(CompanyLegalEntity::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Issuer is not assigned to the current operating unit."));
        if (companyId == null) {
            Set<Long> affectedCompanies = assignments.findAllByLegalEntityId(issuer.getId()).stream()
                    .filter(CompanyLegalEntity::isActive)
                    .map(row -> row.getCompany().getId())
                    .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
            accessService.requireAdminForCompanies(me, affectedCompanies);
        }
        String name = required(input.name(), "Series name is required.");
        if (series.existsByLegalEntityIdAndNameIgnoreCase(issuer.getId(), name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A series with this name already exists for the issuer.");
        }
        InvoiceSeries value = new InvoiceSeries();
        value.setWorkspace(issuer.getWorkspace());
        value.setLegalEntity(issuer);
        applySeries(value, input, access, me);
        value = series.save(value);
        if (Boolean.TRUE.equals(input.defaultForCurrentUnit())) setDefaultSeriesInternal(currentCompanyId, issuer.getId(), value);
        return seriesResponse(value, Boolean.TRUE.equals(input.defaultForCurrentUnit()));
    }

    @PutMapping("/invoice-series/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public InvoiceSeriesResponse updateSeries(@PathVariable Long id, @RequestBody InvoiceSeriesInput input, @AuthenticationPrincipal User me) {
        WorkspaceClientAccessService.AccessSnapshot access = accessService.snapshot(me);
        InvoiceSeries value = series.findByIdAndWorkspaceId(id, access.workspaceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Set<Long> affected = new LinkedHashSet<>();
        boolean sharedBefore = value.getCompany() == null;
        boolean sharedAfter = input.companyId() == null;
        if (sharedBefore || sharedAfter) {
            assignments.findAllByLegalEntityId(value.getLegalEntity().getId()).stream()
                    .filter(CompanyLegalEntity::isActive)
                    .map(row -> row.getCompany().getId())
                    .forEach(affected::add);
        } else {
            affected.add(value.getCompany().getId());
            affected.add(input.companyId());
        }
        assignments.findAllByLegalEntityId(value.getLegalEntity().getId()).stream()
                .filter(row -> row.getDefaultInvoiceSeries() != null
                        && Objects.equals(row.getDefaultInvoiceSeries().getId(), value.getId()))
                .map(row -> row.getCompany().getId())
                .forEach(affected::add);
        accessService.requireAdminForCompanies(me, affected);
        String name = required(input.name(), "Series name is required.");
        boolean duplicate = series.findAllByLegalEntityIdOrderByActiveDescNameAscIdAsc(value.getLegalEntity().getId()).stream()
                .anyMatch(other -> !Objects.equals(other.getId(), id) && other.getName().equalsIgnoreCase(name));
        if (duplicate) throw new ResponseStatusException(HttpStatus.CONFLICT, "A series with this name already exists for the issuer.");
        applySeries(value, input, access, me);
        validateExistingDefaultAssignments(value);
        value = series.save(value);
        if (Boolean.TRUE.equals(input.defaultForCurrentUnit())) setDefaultSeriesInternal(me.getCompany().getId(), value.getLegalEntity().getId(), value);
        Long currentDefault = defaultSeriesByLegalEntity(me.getCompany().getId()).get(value.getLegalEntity().getId());
        return seriesResponse(value, Objects.equals(currentDefault, value.getId()));
    }

    @DeleteMapping("/invoice-series/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public void deleteSeries(@PathVariable Long id, @AuthenticationPrincipal User me) {
        WorkspaceClientAccessService.AccessSnapshot access = accessService.snapshot(me);
        InvoiceSeries value = series.findByIdAndWorkspaceId(id, access.workspaceId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        Set<Long> affected = new LinkedHashSet<>();
        if (value.getCompany() != null) affected.add(value.getCompany().getId());
        if (value.getCompany() == null) {
            assignments.findAllByLegalEntityId(value.getLegalEntity().getId()).stream()
                    .filter(CompanyLegalEntity::isActive)
                    .map(row -> row.getCompany().getId())
                    .forEach(affected::add);
        }
        assignments.findAllByLegalEntityId(value.getLegalEntity().getId()).stream()
                .filter(row -> row.getDefaultInvoiceSeries() != null && Objects.equals(row.getDefaultInvoiceSeries().getId(), id))
                .map(row -> row.getCompany().getId()).forEach(affected::add);
        accessService.requireAdminForCompanies(me, affected.isEmpty() ? List.of(me.getCompany().getId()) : affected);
        if (bills.countByInvoiceSeriesId(id) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Series is already used by invoices. Deactivate it instead.");
        }
        assignments.findAllByLegalEntityId(value.getLegalEntity().getId()).stream()
                .filter(row -> row.getDefaultInvoiceSeries() != null && Objects.equals(row.getDefaultInvoiceSeries().getId(), id))
                .forEach(row -> { row.setDefaultInvoiceSeries(null); assignments.save(row); });
        series.delete(value);
    }

    @PostMapping("/issuers/{legalEntityId}/default-series")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public InvoiceSeriesResponse setDefaultSeries(
            @PathVariable Long legalEntityId,
            @RequestBody DefaultSeriesInput input,
            @AuthenticationPrincipal User me
    ) {
        if (input == null || input.invoiceSeriesId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice series is required.");
        Long companyId = me.getCompany().getId();
        InvoiceSeries value = series.findByIdAndWorkspaceId(input.invoiceSeriesId(), me.getCompany().getWorkspace().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!Objects.equals(value.getLegalEntity().getId(), legalEntityId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Series belongs to another issuer.");
        }
        setDefaultSeriesInternal(companyId, legalEntityId, value);
        return seriesResponse(value, true);
    }

    @GetMapping("/workspace-bills")
    @Transactional(readOnly = true)
    public List<WorkspaceBillResponse> workspaceBills(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "100") int size,
            @AuthenticationPrincipal User me
    ) {
        WorkspaceClientAccessService.AccessSnapshot access = accessService.snapshot(me);
        List<Long> ids = bills.findWorkspacePageIdsByCompanyIds(access.companyIds(), PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 500))));
        if (ids.isEmpty()) return List.of();
        Map<Long, Integer> order = new HashMap<>();
        for (int index = 0; index < ids.size(); index++) order.put(ids.get(index), index);
        return bills.findAllByCompanyIdInAndIdIn(access.companyIds(), ids).stream()
                .sorted(Comparator.comparingInt(bill -> order.getOrDefault(bill.getId(), Integer.MAX_VALUE)))
                .map(BillingIssuerController::workspaceBillResponse)
                .toList();
    }

    private void apply(LegalEntity entity, LegalEntityInput input) {
        entity.setName(required(input.name(), "Issuer name is required."));
        entity.setAddress(trim(input.address()));
        entity.setPostalCode(trim(input.postalCode()));
        entity.setCity(trim(input.city()));
        entity.setCountry(normalizeCode(input.country(), "SI", 2));
        entity.setTaxNumber(trim(input.taxNumber()));
        entity.setVatId(trim(input.vatId()));
        entity.setIban(trim(input.iban()));
        entity.setBic(trim(input.bic()));
        entity.setEmail(trim(input.email()));
        entity.setTelephone(trim(input.telephone()));
        entity.setCurrency(normalizeCode(input.currency(), "EUR", 3));
        entity.setFiscalEnvironment("PROD".equalsIgnoreCase(trim(input.fiscalEnvironment())) ? "PROD" : "TEST");
        entity.setSoftwareSupplierTaxNumber(trim(input.softwareSupplierTaxNumber()));
        if (input.certificatePassword() != null) {
            entity.setCertificatePasswordEncrypted(input.certificatePassword().isBlank() ? null : crypto.encrypt(input.certificatePassword().trim()));
        }
        if (input.active() != null) entity.setActive(input.active());
    }

    private void applySeries(InvoiceSeries value, InvoiceSeriesInput input, WorkspaceClientAccessService.AccessSnapshot access, User me) {
        value.setName(required(input.name(), "Series name is required."));
        value.setNextNumber(required(input.nextNumber(), "Next invoice number is required."));
        value.setInitialNumber(input.initialNumber() == null || input.initialNumber().isBlank() ? value.getNextNumber() : input.initialNumber().trim());
        value.setResetPolicy(parseResetPolicy(input.resetPolicy()));
        value.setBusinessPremiseCode(trim(input.businessPremiseCode()));
        value.setElectronicDeviceId(trim(input.electronicDeviceId()));
        if (input.active() != null) value.setActive(input.active());

        Long requestedCompanyId = input.companyId();
        if (requestedCompanyId != null) {
            accessService.requireAdminForCompanies(me, List.of(requestedCompanyId));
            Company company = companies.findById(requestedCompanyId)
                    .filter(candidate -> Objects.equals(candidate.getWorkspace().getId(), access.workspaceId()))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Operating unit belongs to another workspace."));
            assignments.findByCompanyIdAndLegalEntityId(company.getId(), value.getLegalEntity().getId())
                    .filter(CompanyLegalEntity::isActive)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Issuer is not assigned to the selected operating unit."));
            value.setCompany(company);
        } else {
            value.setCompany(null);
        }

        if (input.locationId() != null) {
            if (value.getCompany() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A location-specific series must be unit-specific.");
            Location location = locations.findByIdAndCompanyId(input.locationId(), value.getCompany().getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Location belongs to another operating unit."));
            value.setLocation(location);
        } else {
            value.setLocation(null);
        }
        value.setLastResetYear(value.getLastResetYear() == null ? LocalDate.now().getYear() : value.getLastResetYear());
    }

    private void validateExistingDefaultAssignments(InvoiceSeries value) {
        List<CompanyLegalEntity> defaultAssignments = assignments.findAllByLegalEntityId(value.getLegalEntity().getId()).stream()
                .filter(row -> row.getDefaultInvoiceSeries() != null
                        && Objects.equals(row.getDefaultInvoiceSeries().getId(), value.getId()))
                .toList();
        if (defaultAssignments.isEmpty()) return;
        if (!value.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A default invoice series cannot be deactivated.");
        }
        if (value.getLocation() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A unit-wide default series cannot be restricted to one location.");
        }
        if (value.getCompany() != null && defaultAssignments.stream()
                .anyMatch(row -> !Objects.equals(row.getCompany().getId(), value.getCompany().getId()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This shared default series is used by another operating unit.");
        }
    }

    private void setDefaultSeriesInternal(Long companyId, Long legalEntityId, InvoiceSeries value) {
        CompanyLegalEntity assignment = assignments.findByCompanyIdAndLegalEntityId(companyId, legalEntityId)
                .filter(CompanyLegalEntity::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Issuer is not assigned to this operating unit."));
        if (!value.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Inactive series cannot be selected as default.");
        }
        if (value.getCompany() != null && !Objects.equals(value.getCompany().getId(), companyId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Series belongs to another operating unit.");
        }
        if (value.getLocation() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A location-specific series cannot be the unit-wide default.");
        }
        assignment.setDefaultInvoiceSeries(value);
        assignments.save(assignment);
    }

    private void clearDefaultIssuer(Long companyId, Long exceptAssignmentId) {
        assignments.findAllByCompanyIdOrderByDefaultIssuerDescIdAsc(companyId).forEach(row -> {
            if (row.isDefaultIssuer() && !Objects.equals(row.getId(), exceptAssignmentId)) {
                row.setDefaultIssuer(false);
                assignments.save(row);
            }
        });
    }

    private Map<Long, Long> defaultSeriesByLegalEntity(Long companyId) {
        Map<Long, Long> out = new HashMap<>();
        assignments.findAllByCompanyIdOrderByDefaultIssuerDescIdAsc(companyId).forEach(row -> {
            if (row.getDefaultInvoiceSeries() != null) out.put(row.getLegalEntity().getId(), row.getDefaultInvoiceSeries().getId());
        });
        return out;
    }

    private LegalEntityResponse response(LegalEntity entity, List<CompanyLegalEntity> visibleAssignments, Long currentCompanyId) {
        CompanyLegalEntity current = visibleAssignments.stream()
                .filter(row -> Objects.equals(row.getCompany().getId(), currentCompanyId)).findFirst().orElse(null);
        return new LegalEntityResponse(
                entity.getId(), entity.getName(), entity.getAddress(), entity.getPostalCode(), entity.getCity(),
                entity.getCountry(), entity.getTaxNumber(), entity.getVatId(), entity.getIban(), entity.getBic(),
                entity.getEmail(), entity.getTelephone(), entity.getCurrency(), entity.getFiscalEnvironment(),
                entity.getSoftwareSupplierTaxNumber(), entity.getCertificatePasswordEncrypted() != null && !entity.getCertificatePasswordEncrypted().isBlank(),
                entity.isActive(), current != null && current.isActive(), current != null && current.isDefaultIssuer(),
                current == null || current.getDefaultInvoiceSeries() == null ? null : current.getDefaultInvoiceSeries().getId(),
                visibleAssignments.stream().map(row -> new UnitAssignmentResponse(
                        row.getCompany().getId(), row.getCompany().getName(), row.isDefaultIssuer(), row.isActive(),
                        row.getDefaultInvoiceSeries() == null ? null : row.getDefaultInvoiceSeries().getId())).toList()
        );
    }

    private static InvoiceSeriesResponse seriesResponse(InvoiceSeries value, boolean defaultForCurrentUnit) {
        return new InvoiceSeriesResponse(
                value.getId(), value.getLegalEntity().getId(), value.getLegalEntity().getName(),
                value.getCompany() == null ? null : value.getCompany().getId(),
                value.getCompany() == null ? null : value.getCompany().getName(),
                value.getLocation() == null ? null : value.getLocation().getId(),
                value.getLocation() == null ? null : value.getLocation().getName(),
                value.getName(), value.getNextNumber(), value.getInitialNumber(), value.getResetPolicy().name(),
                value.getLastResetYear(), value.getBusinessPremiseCode(), value.getElectronicDeviceId(), value.isActive(),
                value.getCompany() == null, defaultForCurrentUnit
        );
    }

    private static WorkspaceBillResponse workspaceBillResponse(Bill bill) {
        String clientName = bill.getClient() == null
                ? ((bill.getClientFirstNameSnapshot() == null ? "" : bill.getClientFirstNameSnapshot()) + " "
                    + (bill.getClientLastNameSnapshot() == null ? "" : bill.getClientLastNameSnapshot())).trim()
                : ((bill.getClient().getFirstName() == null ? "" : bill.getClient().getFirstName()) + " "
                    + (bill.getClient().getLastName() == null ? "" : bill.getClient().getLastName())).trim();
        return new WorkspaceBillResponse(
                bill.getId(), bill.getBillNumber(), bill.getBillType() == null ? "INVOICE" : bill.getBillType().name(),
                bill.getIssueDate(), bill.getPaymentStatus(), bill.getFiscalStatus() == null ? "NOT_SENT" : bill.getFiscalStatus().name(),
                bill.getTotalNet(), bill.getTotalGross(), BillPaymentSplitSupport.resolvePendingPaymentGross(bill),
                bill.getCompany().getId(), bill.getCompany().getName(), bill.getLocation().getId(), bill.getLocation().getName(),
                bill.getLegalEntity().getId(), bill.getIssuerNameSnapshot(), bill.getInvoiceSeries().getId(), bill.getInvoiceSeriesNameSnapshot(),
                bill.getClient() == null ? null : bill.getClient().getId(), clientName
        );
    }

    private static List<CompanyLegalEntity> visibleAssignments(List<CompanyLegalEntity> rows, Collection<Long> companyIds) {
        return rows.stream().filter(row -> companyIds.contains(row.getCompany().getId())).toList();
    }

    private static InvoiceSeriesResetPolicy parseResetPolicy(String value) {
        try {
            return value == null || value.isBlank() ? InvoiceSeriesResetPolicy.NONE : InvoiceSeriesResetPolicy.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reset policy must be NONE or YEARLY.");
        }
    }

    private static String normalizeCode(String value, String fallback, int length) {
        String normalized = value == null || value.isBlank() ? fallback : value.trim().toUpperCase();
        if (normalized.length() != length) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid code length.");
        return normalized;
    }

    private static void requireInput(Object input) {
        if (input == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body is required.");
    }

    private static String required(String value, String message) {
        String result = trim(value);
        if (result == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        return result;
    }

    private static String trim(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }
}
