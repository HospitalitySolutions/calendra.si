package com.example.app.client;

import com.example.app.company.ClientCompanyRepository;
import com.example.app.customfield.CustomFieldAppliesTo;
import com.example.app.customfield.CustomFieldService;
import com.example.app.files.ClientFileRepository;
import com.example.app.files.ClientFileUploadPolicy;
import com.example.app.files.StoredFileResponse;
import com.example.app.files.TenantFileS3Service;
import com.example.app.guest.model.EntitlementStatus;
import com.example.app.guest.model.GuestEntitlement;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsage;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.guest.order.GuestOrderService;
import com.example.app.guest.notifications.GuestNotificationService;
import com.example.app.security.SecurityUtils;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/clients")
public class ClientController {
    private final ClientRepository repository;
    private final UserRepository users;
    private final SessionBookingRepository bookings;
    private final ClientAnonymizationService anonymizationService;
    private final ClientCompanyRepository clientCompanies;
    private final ClientFileRepository clientFiles;
    private final TenantFileS3Service fileStorage;
    private final GuestEntitlementRepository guestEntitlements;
    private final GuestEntitlementUsageRepository guestEntitlementUsages;
    private final GuestEntitlementService guestEntitlementService;
    private final GuestTenantLinkRepository guestTenantLinks;
    private final GuestOrderService guestOrderService;
    private final ClientRemovalGuard clientRemovalGuard;
    private final CustomFieldService customFieldService;

    @Autowired(required = false)
    private GuestNotificationService guestNotifications;

    public ClientController(
            ClientRepository repository,
            UserRepository users,
            SessionBookingRepository bookings,
            ClientAnonymizationService anonymizationService,
            ClientCompanyRepository clientCompanies,
            ClientFileRepository clientFiles,
            TenantFileS3Service fileStorage,
            GuestEntitlementRepository guestEntitlements,
            GuestEntitlementUsageRepository guestEntitlementUsages,
            GuestEntitlementService guestEntitlementService,
            GuestTenantLinkRepository guestTenantLinks,
            GuestOrderService guestOrderService,
            ClientRemovalGuard clientRemovalGuard
    ) {
        this(repository, users, bookings, anonymizationService, clientCompanies, clientFiles, fileStorage,
                guestEntitlements, guestEntitlementUsages, guestEntitlementService, guestTenantLinks,
                guestOrderService, clientRemovalGuard, null);
    }

    @Autowired
    public ClientController(
            ClientRepository repository,
            UserRepository users,
            SessionBookingRepository bookings,
            ClientAnonymizationService anonymizationService,
            ClientCompanyRepository clientCompanies,
            ClientFileRepository clientFiles,
            TenantFileS3Service fileStorage,
            GuestEntitlementRepository guestEntitlements,
            GuestEntitlementUsageRepository guestEntitlementUsages,
            GuestEntitlementService guestEntitlementService,
            GuestTenantLinkRepository guestTenantLinks,
            GuestOrderService guestOrderService,
            ClientRemovalGuard clientRemovalGuard,
            CustomFieldService customFieldService
    ) {
        this.repository = repository;
        this.users = users;
        this.bookings = bookings;
        this.anonymizationService = anonymizationService;
        this.clientCompanies = clientCompanies;
        this.clientFiles = clientFiles;
        this.fileStorage = fileStorage;
        this.guestEntitlements = guestEntitlements;
        this.guestEntitlementUsages = guestEntitlementUsages;
        this.guestEntitlementService = guestEntitlementService;
        this.guestTenantLinks = guestTenantLinks;
        this.guestOrderService = guestOrderService;
        this.clientRemovalGuard = clientRemovalGuard;
        this.customFieldService = customFieldService;
    }

    public record PreferredSlotRequest(DayOfWeek dayOfWeek, LocalTime startTime, LocalTime endTime) {}
    public record ClientRequest(
            String firstName,
            String lastName,
            String email,
            String phone,
            String whatsappPhone,
            Boolean whatsappOptIn,
            String viberUserId,
            Boolean viberConnected,
            Long assignedToId,
            List<Long> assignedToIds,
            Long billingCompanyId,
            Boolean batchPaymentEnabled,
            Boolean suppressInvoiceEmails,
            List<PreferredSlotRequest> preferredSlots,
            Map<Long, String> customFieldValues
    ) {}
    public record UserSummary(Long id, String firstName, String lastName, String email, Role role) {}
    public record CompanySummary(
            Long id,
            String name,
            String address,
            String postalCode,
            String city,
            String vatId,
            String iban,
            String email,
            String telephone
    ) {}
    public record ClientResponse(
            Long id,
            String firstName,
            String lastName,
            String email,
            String phone,
            String whatsappPhone,
            boolean whatsappOptIn,
            String viberUserId,
            boolean viberConnected,
            boolean guestAppLinked,
            boolean anonymized,
            Instant anonymizedAt,
            boolean active,
            boolean batchPaymentEnabled,
            boolean suppressInvoiceEmails,
            UserSummary assignedTo,
            List<UserSummary> assignedUsers,
            CompanySummary billingCompany,
            Instant createdAt,
            Instant updatedAt,
            boolean removalBlocked,
            Map<Long, String> customFieldValues
    ) {}

    public record ClientSessionResponse(
            Long id,
            LocalDateTime startTime,
            LocalDateTime endTime,
            String consultantFirstName,
            String consultantLastName,
            boolean paid,
            String bookingStatus
    ) {}


    public record ClientWalletEntitlementResponse(
            Long id,
            String productName,
            String entitlementType,
            String entitlementCode,
            Integer remainingUses,
            Integer visitCount,
            Instant validFrom,
            Instant validUntil,
            String status,
            Long sourceOrderId,
            String sessionTypeName,
            boolean autoRenews,
            Instant createdAt
    ) {}

    public record ClientWalletUsageResponse(
            Long id,
            Long entitlementId,
            String productName,
            Instant usedAt,
            Integer unitsUsed,
            String reason,
            Long bookingId,
            String source,
            String scannedByName,
            Integer unitsBefore,
            Integer unitsAfter
    ) {}

    public record ClientWalletResponse(
            List<ClientWalletEntitlementResponse> activeEntitlements,
            List<ClientWalletEntitlementResponse> inactiveEntitlements,
            List<ClientWalletUsageResponse> usageHistory
    ) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<ClientResponse> list(
            @AuthenticationPrincipal User me,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "100") int size,
            @RequestParam(name = "search", required = false) String search
    ) {
        var companyId = me.getCompany().getId();
        var pageable = PageRequest.of(safePage(page), safeSize(size, 100, 500));
        String normalizedSearch = blankToNull(search);
        List<Client> rows = SecurityUtils.isAdmin(me)
                ? repository.findPageByCompanyId(companyId, normalizedSearch, pageable)
                : repository.findPageByAssignedToIdAndCompanyId(me.getId(), companyId, normalizedSearch, pageable);
        Set<Long> blockedIds = clientRemovalGuard.clientIdsWithRemovalBlock(
                companyId,
                rows.stream().map(Client::getId).toList());
        Map<Long, Map<Long, String>> customValues = customFieldService == null
                ? Map.of()
                : customFieldService.valuesForEntities(
                        companyId,
                        CustomFieldAppliesTo.CLIENT,
                        rows.stream().map(Client::getId).toList());
        return rows.stream().map(c -> toResponse(c, blockedIds.contains(c.getId()), customValues.get(c.getId()))).toList();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public ClientResponse findById(@PathVariable Long id, @AuthenticationPrincipal User me) {
        return toResponse(loadClientForWalletAccess(id, me));
    }

    @PostMapping
    @Transactional
    public ClientResponse create(@RequestBody ClientRequest req, @AuthenticationPrincipal User me) {
        var c = new Client();
        apply(c, req, me);
        Client saved = repository.save(c);
        if (customFieldService != null) {
            customFieldService.saveValues(me.getCompany(), CustomFieldAppliesTo.CLIENT, saved.getId(), req.customFieldValues());
        }
        return toResponse(saved);
    }

    @PutMapping("/{id}")
    @Transactional
    public ClientResponse update(@PathVariable Long id, @RequestBody ClientRequest req, @AuthenticationPrincipal User me) {
        var c = repository.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (c.getAssignedTo() == null || !c.getAssignedTo().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        apply(c, req, me);
        Client saved = repository.save(c);
        if (customFieldService != null) {
            customFieldService.saveValues(me.getCompany(), CustomFieldAppliesTo.CLIENT, saved.getId(), req.customFieldValues());
        }
        return toResponse(saved);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var c = loadClientForDetailAccess(id, me);
        if (clientRemovalGuard.isRemovalBlocked(c.getId(), me.getCompany().getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This client has upcoming sessions or active wallet entitlements. Resolve those before deleting.");
        }
        clientFiles.findAllByClientId(c.getId()).forEach(file -> fileStorage.deleteQuietly(file.getS3ObjectKey()));
        if (customFieldService != null) {
            customFieldService.deleteValuesForEntity(me.getCompany().getId(), CustomFieldAppliesTo.CLIENT, c.getId());
        }
        repository.delete(c);
    }

    @PostMapping("/{id}/anonymize")
    @Transactional
    public ClientResponse anonymize(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var updated = anonymizationService.anonymize(id, me);
        return toResponse(updated);
    }

    @PatchMapping("/{id}/deactivate")
    @Transactional
    public ClientResponse deactivate(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var c = repository.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (c.getAssignedTo() == null || !c.getAssignedTo().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (clientRemovalGuard.isRemovalBlocked(c.getId(), me.getCompany().getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "This client has upcoming sessions or active wallet entitlements. Resolve those before deactivating.");
        }
        c.setActive(false);
        return toResponse(repository.save(c));
    }

    @PatchMapping("/{id}/activate")
    @Transactional
    public ClientResponse activate(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var c = repository.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (c.getAssignedTo() == null || !c.getAssignedTo().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        c.setActive(true);
        return toResponse(repository.save(c));
    }

    @GetMapping("/{id}/bookings")
    @Transactional(readOnly = true)
    public List<ClientSessionResponse> clientBookings(
            @PathVariable Long id,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "100") int size,
            @AuthenticationPrincipal User me
    ) {
        var companyId = me.getCompany().getId();
        var c = repository.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (c.getAssignedTo() == null || !c.getAssignedTo().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var pageRequest = PageRequest.of(safePage(page), safeSize(size, 100, 200));
        var list = SecurityUtils.isAdmin(me)
                ? bookings.findByClientIdAndCompanyIdOrderByStartTimeDesc(id, companyId, pageRequest)
                : bookings.findByClientIdAndCompanyIdAndConsultantIdOrderByStartTimeDesc(id, companyId, me.getId(), pageRequest);
        return list.stream().map(ClientController::toClientSessionResponse).toList();
    }


    @GetMapping("/{id}/wallet")
    @Transactional
    public ClientWalletResponse clientWallet(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var client = loadClientForWalletAccess(id, me);
        guestOrderService.ensurePaidWalletEntitlementsForClient(client.getId(), me.getCompany().getId());
        var allEntitlements = guestEntitlements.findAllByClientIdAndCompanyIdOrderByCreatedAtDesc(
                client.getId(), me.getCompany().getId(), PageRequest.of(0, 500));
        var activeEntitlements = allEntitlements.stream()
                .filter(entitlement -> entitlement.getStatus() == EntitlementStatus.ACTIVE || entitlement.getStatus() == EntitlementStatus.PENDING)
                .sorted(Comparator.comparing(GuestEntitlement::getCreatedAt).reversed())
                .map(this::toWalletEntitlementResponse)
                .toList();
        var inactiveEntitlements = allEntitlements.stream()
                .filter(entitlement -> entitlement.getStatus() != EntitlementStatus.ACTIVE && entitlement.getStatus() != EntitlementStatus.PENDING)
                .sorted(Comparator.comparing(GuestEntitlement::getCreatedAt).reversed())
                .map(this::toWalletEntitlementResponse)
                .toList();
        var entitlementIds = allEntitlements.stream()
                .map(GuestEntitlement::getId)
                .filter(Objects::nonNull)
                .toList();
        var usageHistory = entitlementIds.isEmpty()
                ? List.<ClientWalletUsageResponse>of()
                : guestEntitlementUsages.findAllByEntitlementIdInOrderByUsedAtDesc(entitlementIds, PageRequest.of(0, 500)).stream()
                .map(this::toWalletUsageResponse)
                .toList();
        return new ClientWalletResponse(activeEntitlements, inactiveEntitlements, usageHistory);
    }

    @DeleteMapping("/{id}/wallet/entitlements/{entitlementId}")
    @Transactional
    public void deleteWalletEntitlement(
            @PathVariable Long id,
            @PathVariable Long entitlementId,
            @AuthenticationPrincipal User me
    ) {
        var client = loadClientForDetailAccess(id, me);
        var entitlement = guestEntitlements.findById(entitlementId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!entitlement.getCompany().getId().equals(me.getCompany().getId())
                || !entitlement.getClient().getId().equals(client.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        entitlement.setStatus(EntitlementStatus.CANCELLED);
        guestEntitlements.save(entitlement);
        if (guestNotifications != null) {
            guestNotifications.webEntitlementRemoved(entitlement);
        }
    }

    @GetMapping("/{id}/files")
    @Transactional(readOnly = true)
    public List<StoredFileResponse> listFiles(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var client = loadClientForDetailAccess(id, me);
        return clientFiles.findAllByClientIdAndOwnerCompanyIdOrderByCreatedAtDescIdDesc(client.getId(), me.getCompany().getId())
                .stream()
                .map(StoredFileResponse::from)
                .toList();
    }

    @PostMapping("/{id}/files")
    @Transactional
    public StoredFileResponse uploadFile(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User me
    ) {
        var client = loadClientForDetailAccess(id, me);
        ClientFileUploadPolicy.validateClientFile(file);
        var stored = fileStorage.uploadClientFile(me.getCompany(), client, file);

        var row = new com.example.app.files.ClientFile();
        row.setClient(client);
        row.setOwnerCompany(me.getCompany());
        row.setOriginalFileName(file.getOriginalFilename() == null || file.getOriginalFilename().isBlank() ? "file" : file.getOriginalFilename().trim());
        row.setContentType(stored.contentType());
        row.setSizeBytes(stored.sizeBytes());
        row.setS3ObjectKey(stored.objectKey());
        row.setUploadedByUserId(me.getId());
        return StoredFileResponse.from(clientFiles.save(row));
    }

    @GetMapping("/{id}/files/{fileId}")
    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> downloadFile(
            @PathVariable Long id,
            @PathVariable Long fileId,
            @AuthenticationPrincipal User me
    ) {
        loadClientForDetailAccess(id, me);
        var file = clientFiles.findByIdAndClientIdAndOwnerCompanyId(fileId, id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        byte[] bytes = fileStorage.download(file.getS3ObjectKey());
        String contentType = file.getContentType() == null || file.getContentType().isBlank()
                ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                : file.getContentType();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.getOriginalFileName()).build().toString())
                .contentType(MediaType.parseMediaType(contentType))
                .body(bytes);
    }

    @DeleteMapping("/{id}/files/{fileId}")
    @Transactional
    public void deleteFile(
            @PathVariable Long id,
            @PathVariable Long fileId,
            @AuthenticationPrincipal User me
    ) {
        loadClientForDetailAccess(id, me);
        var file = clientFiles.findByIdAndClientIdAndOwnerCompanyId(fileId, id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        fileStorage.deleteQuietly(file.getS3ObjectKey());
        clientFiles.delete(file);
    }

    private Client loadClientForDetailAccess(Long id, User me) {
        var client = repository.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (client.getAssignedTo() == null || !client.getAssignedTo().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return client;
    }

    private Client loadClientForWalletAccess(Long id, User me) {
        var client = repository.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me)
                && !SecurityUtils.canScanWalletEntitlements(me)
                && (client.getAssignedTo() == null || !client.getAssignedTo().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return client;
    }

    private static ClientSessionResponse toClientSessionResponse(SessionBooking b) {
        var u = b.getConsultant();
        return new ClientSessionResponse(
                b.getId(),
                b.getStartTime(),
                b.getEndTime(),
                u == null ? "Unassigned" : u.getFirstName(),
                u == null ? "" : u.getLastName(),
                b.getBilledAt() != null,
                com.example.app.session.SessionBookingStatus.normalizeStored(b.getBookingStatus())
        );
    }


    private ClientWalletEntitlementResponse toWalletEntitlementResponse(GuestEntitlement entitlement) {
        var product = entitlement.getProduct();
        var sessionType = product == null ? null : product.getSessionType();
        return new ClientWalletEntitlementResponse(
                entitlement.getId(),
                product == null ? null : product.getName(),
                entitlement.getEntitlementType() == null ? null : entitlement.getEntitlementType().name(),
                entitlement.getEntitlementCode(),
                entitlement.getRemainingUses(),
                entitlement.getVisitCount(),
                entitlement.getValidFrom(),
                entitlement.getValidUntil(),
                entitlement.getStatus() == null ? null : entitlement.getStatus().name(),
                entitlement.getSourceOrder() == null ? null : entitlement.getSourceOrder().getId(),
                sessionType == null ? null : sessionType.getName(),
                guestEntitlementService.autoRenews(entitlement),
                entitlement.getCreatedAt()
        );
    }

    private ClientWalletUsageResponse toWalletUsageResponse(GuestEntitlementUsage usage) {
        var entitlement = usage.getEntitlement();
        var product = entitlement == null ? null : entitlement.getProduct();
        var booking = usage.getSessionBooking();
        var scannedBy = usage.getScannedBy();
        String scannedByName = scannedBy == null ? null : (scannedBy.getFirstName() + " " + scannedBy.getLastName()).trim();
        return new ClientWalletUsageResponse(
                usage.getId(),
                entitlement == null ? null : entitlement.getId(),
                product == null ? null : product.getName(),
                usage.getUsedAt(),
                usage.getUnitsUsed(),
                usage.getReason() == null ? null : usage.getReason().name(),
                booking == null ? null : booking.getId(),
                usage.getScanSource(),
                scannedByName == null || scannedByName.isBlank() ? null : scannedByName,
                usage.getUnitsBefore(),
                usage.getUnitsAfter()
        );
    }

    private void apply(Client c, ClientRequest req, User me) {
        c.setCompany(me.getCompany());
        c.setFirstName(req.firstName());
        c.setLastName(req.lastName());
        String normalizedEmail = Client.normalizeEmailStorage(req.email());
        if (normalizedEmail != null
                && repository.existsOtherWithNormalizedEmail(
                        me.getCompany().getId(), normalizedEmail, c.getId())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "A client with this email already exists for this company.");
        }
        c.setEmail(normalizedEmail);
        String normalizedPhone = blankToNull(req.phone());
        c.setPhone(normalizedPhone);
        c.setWhatsappPhone(normalizedPhone);
        if (req.whatsappOptIn() != null) c.setWhatsappOptIn(Boolean.TRUE.equals(req.whatsappOptIn()));
        else if (c.getId() == null) c.setWhatsappOptIn(false);
        if (req.viberUserId() != null) c.setViberUserId(blankToNull(req.viberUserId()));
        if (req.viberConnected() != null) c.setViberConnected(Boolean.TRUE.equals(req.viberConnected()) && c.getViberUserId() != null && !c.getViberUserId().isBlank());
        else if (c.getId() == null) c.setViberConnected(false);
        if (c.getViberUserId() == null || c.getViberUserId().isBlank()) c.setViberConnected(false);
        if (req.billingCompanyId() == null) {
            c.setBillingCompany(null);
        } else {
            var linked = clientCompanies.findByIdAndOwnerCompanyId(req.billingCompanyId(), me.getCompany().getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid billing company"));
            c.setBillingCompany(linked);
        }
        if (req.batchPaymentEnabled() != null) {
            c.setBatchPaymentEnabled(req.batchPaymentEnabled());
        } else if (c.getId() == null) {
            c.setBatchPaymentEnabled(false);
        }
        if (req.suppressInvoiceEmails() != null) {
            c.setSuppressInvoiceEmails(req.suppressInvoiceEmails());
        } else if (c.getId() == null) {
            c.setSuppressInvoiceEmails(false);
        }
        if (SecurityUtils.isAdmin(me)) {
            List<Long> requestedAssignedIds = normalizedAssignedToIds(req);
            c.getAssignedUsers().clear();
            List<User> assignedUsers = new ArrayList<>();
            for (Long assignedToId : requestedAssignedIds) {
                User assigned = users.findByIdAndCompanyId(assignedToId, me.getCompany().getId())
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant"));
                if (!assigned.isConsultant() && assigned.getRole() != Role.CONSULTANT) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected user is not marked as consultant");
                }
                assignedUsers.add(assigned);
            }
            c.getAssignedUsers().addAll(assignedUsers);
            c.setAssignedTo(assignedUsers.isEmpty() ? null : assignedUsers.get(0));
        } else {
            c.getAssignedUsers().clear();
            c.getAssignedUsers().add(me);
            c.setAssignedTo(me);
        }
        c.getPreferredSlots().clear();
        if (req.preferredSlots() != null) {
            req.preferredSlots().forEach(ps -> {
                var slot = new PreferredSlot();
                slot.setClient(c);
                slot.setDayOfWeek(ps.dayOfWeek());
                slot.setStartTime(ps.startTime());
                slot.setEndTime(ps.endTime());
                c.getPreferredSlots().add(slot);
            });
        }
    }

    private List<Long> normalizedAssignedToIds(ClientRequest req) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        if (req.assignedToIds() != null) {
            req.assignedToIds().stream()
                    .filter(Objects::nonNull)
                    .filter(id -> id > 0)
                    .forEach(ids::add);
        } else if (req.assignedToId() != null && req.assignedToId() > 0) {
            ids.add(req.assignedToId());
        }
        return new ArrayList<>(ids);
    }

    private List<User> assignedUsersForResponse(Client c) {
        LinkedHashSet<User> assigned = new LinkedHashSet<>();
        if (c.getAssignedUsers() != null) {
            c.getAssignedUsers().stream()
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparing(User::getLastName, Comparator.nullsLast(String::compareToIgnoreCase))
                            .thenComparing(User::getFirstName, Comparator.nullsLast(String::compareToIgnoreCase))
                            .thenComparing(User::getId))
                    .forEach(assigned::add);
        }
        if (assigned.isEmpty() && c.getAssignedTo() != null) {
            assigned.add(c.getAssignedTo());
        }
        return new ArrayList<>(assigned);
    }

    private UserSummary toUserSummary(User user) {
        return new UserSummary(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole()
        );
    }

    private ClientResponse toResponse(Client c) {
        boolean blocked = clientRemovalGuard.isRemovalBlocked(c.getId(), c.getCompany().getId());
        return toResponse(c, blocked, null);
    }

    private ClientResponse toResponse(Client c, boolean removalBlocked) {
        return toResponse(c, removalBlocked, null);
    }

    private ClientResponse toResponse(Client c, boolean removalBlocked, Map<Long, String> prefetchedCustomValues) {
        List<UserSummary> assignedUserSummaries = assignedUsersForResponse(c).stream()
                .map(this::toUserSummary)
                .toList();
        UserSummary assignedSummary = assignedUserSummaries.isEmpty() ? null : assignedUserSummaries.get(0);
        boolean guestAppLinked = guestTenantLinks.existsByCompanyIdAndClientIdAndStatus(
                c.getCompany().getId(),
                c.getId(),
                GuestTenantLinkStatus.ACTIVE
        );

        return new ClientResponse(
                c.getId(),
                c.getFirstName(),
                c.getLastName(),
                c.getEmail(),
                c.getPhone(),
                c.getWhatsappPhone(),
                c.isWhatsappOptIn(),
                c.getViberUserId(),
                c.isViberConnected(),
                guestAppLinked,
                c.isAnonymized(),
                c.getAnonymizedAt(),
                c.isActive(),
                c.isBatchPaymentEnabled(),
                c.isSuppressInvoiceEmails(),
                assignedSummary,
                assignedUserSummaries,
                toCompanySummary(c),
                c.getCreatedAt(),
                c.getUpdatedAt(),
                removalBlocked,
                prefetchedCustomValues != null
                        ? prefetchedCustomValues
                        : customFieldService == null
                                ? Map.of()
                                : customFieldService.valuesForEntity(c.getCompany().getId(), CustomFieldAppliesTo.CLIENT, c.getId())
        );
    }

    private static CompanySummary toCompanySummary(Client c) {
        var company = c.getBillingCompany();
        if (company == null) {
            return null;
        }
        return new CompanySummary(
                company.getId(),
                company.getName(),
                company.getAddress(),
                company.getPostalCode(),
                company.getCity(),
                company.getVatId(),
                company.getIban(),
                company.getEmail(),
                company.getTelephone()
        );
    }


    private static int safePage(int page) {
        return Math.max(0, page);
    }

    private static int safeSize(int size, int defaultSize, int maxSize) {
        if (size <= 0) return defaultSize;
        return Math.min(size, maxSize);
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
