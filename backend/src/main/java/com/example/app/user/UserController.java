package com.example.app.user;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.auth.LoginAccountService;
import com.example.app.auth.PasswordResetService;
import com.example.app.entitlement.PackageAccessService;
import com.example.app.files.TenantFileS3Service;
import com.example.app.security.SecurityUtils;
import com.example.app.company.Company;
import com.example.app.session.SessionBookingRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private static final String DEFAULT_EMPLOYEE_ACCESS_ROLE_NAME = "Calendar access";
    private static final String DEFAULT_EMPLOYEE_ACCESS_ROLE_DESCRIPTION = "Default employee role with calendar visibility.";

    private final UserRepository userRepository;
    private final EmployeeAccessRoleRepository accessRoleRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final PackageAccessService packageAccessService;
    private final TenantFileS3Service fileStorage;
    private final TenantOwnerAccessService tenantOwnerAccessService;
    private final PasswordResetService passwordResetService;
    private final SessionBookingRepository sessionBookingRepository;
    private final LoginAccountService loginAccountService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private ActivityLogService activityLogs;

    public UserController(UserRepository userRepository, EmployeeAccessRoleRepository accessRoleRepository, PasswordEncoder passwordEncoder, ObjectMapper objectMapper, PackageAccessService packageAccessService, TenantFileS3Service fileStorage, TenantOwnerAccessService tenantOwnerAccessService, PasswordResetService passwordResetService, SessionBookingRepository sessionBookingRepository, LoginAccountService loginAccountService) {
        this.userRepository = userRepository;
        this.accessRoleRepository = accessRoleRepository;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
        this.packageAccessService = packageAccessService;
        this.fileStorage = fileStorage;
        this.tenantOwnerAccessService = tenantOwnerAccessService;
        this.passwordResetService = passwordResetService;
        this.sessionBookingRepository = sessionBookingRepository;
        this.loginAccountService = loginAccountService;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public List<UserResponse> findAll(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Long tenantOwnerId = tenantOwnerAccessService.ensureTenantOwnerAdministrator(companyId);
        return userRepository.findAllByCompanyId(companyId)
                .stream().map(user -> toResponse(user, tenantOwnerId)).collect(Collectors.toList());
    }

    /** Tenant-scoped consultant lookup used by calendar and waitlist selectors. */
    @GetMapping("/consultants")
    @PreAuthorize("isAuthenticated()")
    @Transactional(readOnly = true)
    public List<ConsultantLookupResponse> consultants(@AuthenticationPrincipal User me) {
        if (me == null || me.getCompany() == null || me.getCompany().getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return userRepository.findActiveBookableByCompanyId(me.getCompany().getId()).stream()
                .map(user -> new ConsultantLookupResponse(
                        user.getId(),
                        user.getFirstName(),
                        user.getLastName(),
                        user.getEmail()
                ))
                .toList();
    }

    /** Current user's full row (for consultant self-service profile editor). */
    @GetMapping("/profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getProfile(@AuthenticationPrincipal User me) {
        Long tenantOwnerId = me.getCompany() == null ? null : tenantOwnerAccessService.tenantOwnerId(me.getCompany().getId());
        return ResponseEntity.ok(toResponse(me, tenantOwnerId));
    }

    /** Consultant-only: update own name, contact, working hours, optional password (role unchanged). */
    @PutMapping("/profile")
    @PreAuthorize("hasRole('CONSULTANT')")
    @Transactional
    public ResponseEntity<?> updateProfile(@RequestBody ConsultantProfileUpdateRequest request, @AuthenticationPrincipal User me) {
        String normalizedEmail = request.email().trim().toLowerCase();
        var companyId = me.getCompany().getId();
        boolean emailBelongsToAnotherUser = userRepository.findByEmailIgnoreCaseAndCompanyId(normalizedEmail, companyId)
                .map(user -> !user.getId().equals(me.getId()))
                .orElse(false);
        if (emailBelongsToAnotherUser) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "A consultant with this email already exists."));
        }
        return userRepository.findByIdAndCompanyId(me.getId(), companyId)
                .<ResponseEntity<?>>map(existing -> {
                    var beforeAudit = employeeSnapshot(existing);
                    var account = loginAccountService.ensureForUser(existing);
                    boolean emailChanged = !normalizedEmail.equalsIgnoreCase(account.getEmail());
                    boolean passwordChanged = request.password() != null && !request.password().isBlank();
                    if (emailChanged && !loginAccountService.canUseEmailAcrossMemberships(existing, normalizedEmail)) {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("message", "This email is already used by another employee in one of your linked units."));
                    }

                    existing.setFirstName(request.firstName().trim());
                    existing.setLastName(request.lastName().trim());
                    existing.setEmail(normalizedEmail);
                    existing.setUpdatedAt(Instant.now());
                    existing.setVatId(request.vatId() == null || request.vatId().isBlank() ? null : request.vatId().trim());
                    String consultantPhone = trimToNull(request.phone());
                    existing.setPhone(consultantPhone);
                    existing.setWhatsappSenderNumber(consultantPhone);
                    existing.setWhatsappPhoneNumberId(consultantPhone);
                    if (request.workingHours() != null) {
                        try {
                            if (request.workingHours().isNull()) {
                                existing.setWorkingHoursJson(null);
                            } else {
                                existing.setWorkingHoursJson(objectMapper.writeValueAsString(request.workingHours()));
                            }
                        } catch (JsonProcessingException e) {
                            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                    .body(Map.of("message", "Invalid working hours."));
                        }
                    }
                    if (passwordChanged) {
                        existing.setPasswordHash(passwordEncoder.encode(request.password()));
                    }
                    try {
                        User saved = userRepository.save(existing);
                        loginAccountService.synchronizeCredentials(saved, emailChanged, passwordChanged);
                        Long tenantOwnerId = tenantOwnerAccessService.tenantOwnerId(companyId);
                        recordEmployee(me, ActivityAction.EMPLOYEE_UPDATED, saved, "Updated own employee profile", beforeAudit);
                        return ResponseEntity.ok(toResponse(saved, tenantOwnerId));
                    } catch (DataIntegrityViolationException | IllegalArgumentException ex) {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("message", ex.getMessage() == null
                                        ? "A consultant with this email already exists."
                                        : ex.getMessage()));
                    }
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "User not found.")));
    }

    @GetMapping("/quota")
    @PreAuthorize("hasRole('ADMIN')")
    public UserQuotaResponse quota(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        int quota = packageAccessService.userQuota(companyId);
        long activeUsers = userRepository.countByCompanyIdAndActiveTrue(companyId);
        Integer maxUsers = quota == Integer.MAX_VALUE ? null : quota;
        boolean reached = maxUsers != null && activeUsers >= maxUsers;
        return new UserQuotaResponse(activeUsers, maxUsers, reached);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> findById(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Long tenantOwnerId = tenantOwnerAccessService.tenantOwnerId(companyId);
        return userRepository.findByIdAndCompanyId(id, companyId)
                .<ResponseEntity<?>>map(user -> ResponseEntity.ok(toResponse(user, tenantOwnerId)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Consultant not found.")));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public ResponseEntity<?> create(@RequestBody CreateUserRequest request, @AuthenticationPrincipal User me) {
        packageAccessService.requireCanCreateUser(me);
        String normalizedEmail = request.email().trim().toLowerCase();

        if (userRepository.existsByCompanyIdAndEmailIgnoreCase(me.getCompany().getId(), normalizedEmail)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "A consultant with this email already exists."));
        }

        User user = new User();
        user.setCompany(me.getCompany());
        user.setFirstName(request.firstName().trim());
        user.setLastName(request.lastName().trim());
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(temporaryPassword()));
        user.setRole(request.role());
        user.setActive(true);
        user.setConsultant(Boolean.TRUE.equals(request.consultant()));
        EmployeeAccessRole accessRole = resolveEmployeeAccessRole(request.role(), request.accessRoleId(), me.getCompany());
        user.setEmployeeAccessRole(accessRole);
        user.setCreatedAt(Instant.now());
        user.setUpdatedAt(Instant.now());

        if (request.vatId() != null && !request.vatId().isBlank()) {
            user.setVatId(request.vatId().trim());
        }
        String consultantPhone = trimToNull(request.phone());
        user.setPhone(consultantPhone);
        // Keep legacy fields in sync with the consultant phone so older UI/API consumers still receive values.
        user.setWhatsappSenderNumber(consultantPhone);
        user.setWhatsappPhoneNumberId(consultantPhone);
        try {
            if (request.workingHours() != null && !request.workingHours().isNull()) {
                user.setWorkingHoursJson(objectMapper.writeValueAsString(request.workingHours()));
            }
        } catch (JsonProcessingException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "Invalid working hours."));
        }
        user.setPermissionsJson(accessRole != null
                ? accessRole.getPermissionsJson()
                : writePermissionsJson(request.permissions() == null ? SecurityUtils.defaultEmployeePermissions() : request.permissions()));

        try {
            User saved = userRepository.save(user);
            passwordResetService.sendEmployeeAccountCreatedEmail(saved, request.locale());
            Long tenantOwnerId = tenantOwnerAccessService.tenantOwnerId(me.getCompany().getId());
            recordEmployee(me, ActivityAction.EMPLOYEE_CREATED, saved, "Created employee", null);
            return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(saved, tenantOwnerId));
        } catch (DataIntegrityViolationException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "A consultant with this email already exists."));
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody UpdateUserRequest request, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        return userRepository.findByIdAndCompanyId(id, companyId)
                .<ResponseEntity<?>>map(existing -> {
                    var beforeAudit = employeeSnapshot(existing);
                    String normalizedEmail = request.email().trim().toLowerCase();
                    var account = loginAccountService.ensureForUser(existing);
                    boolean emailChanged = !normalizedEmail.equalsIgnoreCase(account.getEmail());
                    boolean passwordChanged = request.password() != null && !request.password().isBlank();
                    boolean editingOwnMembership = existing.getId().equals(me.getId());

                    if (!editingOwnMembership
                            && loginAccountService.hasMultipleMemberships(existing)
                            && (emailChanged || passwordChanged)) {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("message", "This employee uses one login across multiple units. Only the employee can change global login credentials."));
                    }
                    if (emailChanged && !loginAccountService.canUseEmailAcrossMemberships(existing, normalizedEmail)) {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("message", "This email is already used by another employee in one of the linked units."));
                    }

                    boolean emailBelongsToAnotherUser = userRepository.findByEmailIgnoreCaseAndCompanyId(normalizedEmail, companyId)
                            .map(user -> !user.getId().equals(id))
                            .orElse(false);

                    if (emailBelongsToAnotherUser) {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("message", "A consultant with this email already exists."));
                    }

                    Long tenantOwnerId = tenantOwnerAccessService.tenantOwnerId(companyId);
                    boolean tenantOwner = tenantOwnerAccessService.isTenantOwner(existing, tenantOwnerId);

                    existing.setFirstName(request.firstName().trim());
                    existing.setLastName(request.lastName().trim());
                    existing.setEmail(normalizedEmail);
                    EmployeeAccessRole accessRole = null;
                    boolean requestedConsultant = Boolean.TRUE.equals(request.consultant());
                    if (existing.isConsultant() && !requestedConsultant) {
                        long activeBookingCount = sessionBookingRepository.countActiveCurrentOrUpcomingByConsultantIdAndCompanyId(
                                existing.getId(), companyId, LocalDateTime.now());
                        if (activeBookingCount > 0) {
                            return ResponseEntity.status(HttpStatus.CONFLICT)
                                    .body(Map.of(
                                            "message", "Remove or reassign this employee's active or upcoming bookings before switching off Zaposleni.",
                                            "activeBookingCount", activeBookingCount
                                    ));
                        }
                    }

                    if (tenantOwner) {
                        existing.setRole(Role.ADMIN);
                        existing.setConsultant(requestedConsultant);
                        existing.setEmployeeAccessRole(null);
                    } else {
                        existing.setRole(request.role());
                        existing.setConsultant(requestedConsultant);
                        accessRole = resolveEmployeeAccessRole(request.role(), request.accessRoleId(), me.getCompany());
                        existing.setEmployeeAccessRole(accessRole);
                    }
                    existing.setUpdatedAt(Instant.now());

                    existing.setVatId(request.vatId() == null || request.vatId().isBlank() ? null : request.vatId().trim());
                    String consultantPhone = trimToNull(request.phone());
                    existing.setPhone(consultantPhone);
                    existing.setWhatsappSenderNumber(consultantPhone);
                    existing.setWhatsappPhoneNumberId(consultantPhone);

                    if (request.workingHours() != null) {
                        try {
                            if (request.workingHours().isNull()) {
                                existing.setWorkingHoursJson(null);
                            } else {
                                existing.setWorkingHoursJson(objectMapper.writeValueAsString(request.workingHours()));
                            }
                        } catch (JsonProcessingException e) {
                            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                    .body(Map.of("message", "Invalid working hours."));
                        }
                    }

                    if (accessRole != null) {
                        existing.setPermissionsJson(accessRole.getPermissionsJson());
                    } else if (request.permissions() != null) {
                        existing.setPermissionsJson(writePermissionsJson(request.permissions()));
                    }

                    if (passwordChanged) {
                        existing.setPasswordHash(passwordEncoder.encode(request.password()));
                    }

                    try {
                        User saved = userRepository.save(existing);
                        loginAccountService.synchronizeCredentials(saved, emailChanged, passwordChanged);
                        recordEmployee(me, ActivityAction.EMPLOYEE_UPDATED, saved, "Updated employee", beforeAudit);
                        return ResponseEntity.ok(toResponse(saved, tenantOwnerId));
                    } catch (DataIntegrityViolationException | IllegalArgumentException ex) {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("message", ex.getMessage() == null
                                        ? "A consultant with this email already exists."
                                        : ex.getMessage()));
                    }
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Consultant not found.")));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Long tenantOwnerId = tenantOwnerAccessService.tenantOwnerId(companyId);
        if (tenantOwnerId != null && tenantOwnerId.equals(id)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "The tenant owner must remain an active administrator."));
        }
        User target = userRepository.findByIdAndCompanyId(id, companyId).orElse(null);
        if (target == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Consultant not found."));
        }

        String deletedName = employeeName(target);
        userRepository.deleteById(id);
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.EMPLOYEES, ActivityAction.EMPLOYEE_DELETED,
                    "EMPLOYEE", id, deletedName, "Deleted employee", null, null,
                    ActivityDetails.of("targetPath", "/consultants"));
        }
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/deactivate")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public ResponseEntity<?> deactivateUser(@PathVariable Long id, @AuthenticationPrincipal User me) {
        if (id.equals(me.getId())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "You cannot deactivate your own account."));
        }
        Long companyId = me.getCompany().getId();
        Long tenantOwnerId = tenantOwnerAccessService.tenantOwnerId(companyId);
        if (tenantOwnerId != null && tenantOwnerId.equals(id)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "The tenant owner must remain an active administrator."));
        }
        return userRepository.findByIdAndCompanyId(id, companyId)
                .<ResponseEntity<?>>map(target -> {
                    if (target.getRole() == Role.ADMIN && target.isActive()) {
                        long activeAdmins = userRepository.countByCompanyIdAndActiveTrueAndRole(companyId, Role.ADMIN);
                        if (activeAdmins <= 1) {
                            return ResponseEntity.status(HttpStatus.CONFLICT)
                                    .body(Map.of("message", "Cannot deactivate the last active administrator."));
                        }
                    }
                    target.setActive(false);
                    target.setUpdatedAt(Instant.now());
                    User saved = userRepository.save(target);
                    recordEmployee(me, ActivityAction.EMPLOYEE_DEACTIVATED, saved, "Deactivated employee", null);
                    return ResponseEntity.ok(toResponse(saved, tenantOwnerId));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Consultant not found.")));
    }

    @PatchMapping("/{id}/activate")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public ResponseEntity<?> activateUser(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Long tenantOwnerId = tenantOwnerAccessService.tenantOwnerId(companyId);
        return userRepository.findByIdAndCompanyId(id, companyId)
                .<ResponseEntity<?>>map(target -> {
                    if (!target.isActive()) {
                        packageAccessService.requireCanCreateUser(me);
                    }
                    target.setActive(true);
                    if (tenantOwnerAccessService.isTenantOwner(target, tenantOwnerId)) {
                        target.setRole(Role.ADMIN);
                        target.setEmployeeAccessRole(null);
                    }
                    target.setUpdatedAt(Instant.now());
                    User saved = userRepository.save(target);
                    recordEmployee(me, ActivityAction.EMPLOYEE_ACTIVATED, saved, "Activated employee", null);
                    return ResponseEntity.ok(toResponse(saved, tenantOwnerId));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Consultant not found.")));
    }

    @PostMapping(value = "/profile/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> uploadProfileAvatar(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User me
    ) {
        validateAvatar(file);
        return userRepository.findByIdAndCompanyId(me.getId(), me.getCompany().getId())
                .<ResponseEntity<?>>map(existing -> {
                    String previousKey = existing.getAvatarS3Key();
                    var stored = fileStorage.uploadUserAvatar(me.getCompany(), existing.getId(), file);
                    existing.setAvatarS3Key(stored.objectKey());
                    existing.setAvatarContentType(stored.contentType());
                    existing.setUpdatedAt(Instant.now());
                    User saved = userRepository.save(existing);
                    if (previousKey != null && !previousKey.isBlank() && !previousKey.equals(stored.objectKey())) {
                        fileStorage.deleteQuietly(previousKey);
                    }
                    Long tenantOwnerId = tenantOwnerAccessService.tenantOwnerId(me.getCompany().getId());
                    return ResponseEntity.ok(toResponse(saved, tenantOwnerId));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "User not found.")));
    }

    @GetMapping("/{id}/avatar")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<byte[]> downloadUserAvatar(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var user = userRepository.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String key = user.getAvatarS3Key();
        if (key == null || key.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No avatar.");
        }
        var stored = fileStorage.downloadFile(key);
        String contentType = user.getAvatarContentType() == null || user.getAvatarContentType().isBlank()
                ? stored.contentType()
                : user.getAvatarContentType();
        String etag = "\"" + user.getId() + ":" + (user.getUpdatedAt() == null ? "0" : user.getUpdatedAt().toEpochMilli()) + "\"";
        return ResponseEntity.ok()
                .header(HttpHeaders.ETAG, etag)
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename("user-avatar-" + user.getId() + ".img").build().toString())
                .contentType(MediaType.parseMediaType(contentType == null || contentType.isBlank() ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType))
                .body(stored.bytes());
    }

    private void recordEmployee(User actor, ActivityAction action, User target, String summary, Map<String, Object> before) {
        if (activityLogs == null || target == null) return;
        var details = ActivityDetails.of("targetPath", "/consultants");
        if (before != null) {
            details.put("before", before);
            details.put("after", employeeSnapshot(target));
        } else {
            details.putAll(employeeSnapshot(target));
        }
        activityLogs.recordUser(actor, ActivityModule.EMPLOYEES, action,
                "EMPLOYEE", target.getId(), employeeName(target), summary, null, null, details);
    }

    private Map<String, Object> employeeSnapshot(User target) {
        Long tenantOwnerId = target.getCompany() == null ? null : tenantOwnerAccessService.tenantOwnerId(target.getCompany().getId());
        UserResponse response = toResponse(target, tenantOwnerId);
        return ActivityDetails.of(
                "role", response.role() == null ? null : response.role().name(),
                "consultant", response.consultant(),
                "active", response.active(),
                "accessRole", response.accessRoleName(),
                "permissions", response.permissions()
        );
    }

    private static String employeeName(User target) {
        String name = ((target.getFirstName() == null ? "" : target.getFirstName().trim()) + " "
                + (target.getLastName() == null ? "" : target.getLastName().trim())).trim();
        return name.isBlank() ? target.getEmail() : name;
    }

    public record CreateUserRequest(
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            String password,
            @NotNull Role role,
            @NotNull Boolean consultant,
            String vatId,
            String phone,
            JsonNode workingHours,
            List<String> permissions,
            Long accessRoleId,
            String locale
    ) {
    }

    public record UpdateUserRequest(
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            String password,
            @NotNull Role role,
            @NotNull Boolean consultant,
            String vatId,
            String phone,
            JsonNode workingHours,
            List<String> permissions,
            Long accessRoleId
    ) {
    }

    public record ConsultantProfileUpdateRequest(
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            String password,
            String vatId,
            String phone,
            JsonNode workingHours
    ) {
    }

    public record UserResponse(
            Long id,
            String firstName,
            String lastName,
            String email,
            Role role,
            boolean consultant,
            boolean active,
            String vatId,
            String phone,
            String whatsappSenderNumber,
            String whatsappPhoneNumberId,
            Object workingHours,
            List<String> permissions,
            Long accessRoleId,
            String accessRoleName,
            boolean tenantOwner,
            String avatarPath,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record ConsultantLookupResponse(
            Long id,
            String firstName,
            String lastName,
            String email
    ) {
    }

    public record UserQuotaResponse(
            long activeUsers,
            Integer maxUsers,
            boolean reached
    ) {
    }

    private UserResponse toResponse(User user) {
        Long tenantOwnerId = user.getCompany() == null ? null : tenantOwnerAccessService.tenantOwnerId(user.getCompany().getId());
        return toResponse(user, tenantOwnerId);
    }

    private UserResponse toResponse(User user, Long tenantOwnerId) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole(),
                user.isConsultant(),
                user.isActive(),
                user.getVatId(),
                user.getPhone(),
                user.getWhatsappSenderNumber(),
                user.getWhatsappPhoneNumberId(),
                parseWorkingHoursJson(user.getWorkingHoursJson()),
                SecurityUtils.permissionsForClientResponse(user.getPermissionsJson()),
                user.getEmployeeAccessRole() == null ? null : user.getEmployeeAccessRole().getId(),
                user.getEmployeeAccessRole() == null ? null : user.getEmployeeAccessRole().getName(),
                tenantOwnerAccessService.isTenantOwner(user, tenantOwnerId),
                user.getAvatarS3Key() == null || user.getAvatarS3Key().isBlank()
                        ? null
                        : "/api/users/" + user.getId() + "/avatar?v=" + (user.getUpdatedAt() == null ? 0 : user.getUpdatedAt().toEpochMilli()),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }

    private EmployeeAccessRole resolveAccessRole(Long accessRoleId, Long companyId) {
        if (accessRoleId == null) return null;
        return accessRoleRepository.findByIdAndCompanyIdAndArchivedFalse(accessRoleId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected access role was not found."));
    }

    private EmployeeAccessRole resolveEmployeeAccessRole(Role requestedRole, Long accessRoleId, Company company) {
        if (requestedRole != Role.CONSULTANT) {
            return null;
        }
        EmployeeAccessRole selectedRole = resolveAccessRole(accessRoleId, company.getId());
        return selectedRole != null ? selectedRole : ensureDefaultEmployeeAccessRole(company);
    }

    private EmployeeAccessRole ensureDefaultEmployeeAccessRole(Company company) {
        Long companyId = company.getId();
        return accessRoleRepository.findFirstByCompanyIdAndArchivedFalseAndNameIgnoreCase(companyId, DEFAULT_EMPLOYEE_ACCESS_ROLE_NAME)
                .map(existing -> {
                    List<String> existingPermissions = SecurityUtils.permissionsForClientResponse(existing.getPermissionsJson());
                    if (!existingPermissions.contains(SecurityUtils.PERMISSION_CALENDAR_BOOKINGS_VIEW)) {
                        var merged = new java.util.ArrayList<>(existingPermissions);
                        merged.addAll(SecurityUtils.defaultEmployeePermissions());
                        existing.setPermissionsJson(writePermissionsJson(merged));
                        existing.setDescription(existing.getDescription() == null || existing.getDescription().isBlank()
                                ? DEFAULT_EMPLOYEE_ACCESS_ROLE_DESCRIPTION
                                : existing.getDescription());
                        existing.setUpdatedAt(Instant.now());
                        return accessRoleRepository.save(existing);
                    }
                    return existing;
                })
                .orElseGet(() -> {
                    var role = new EmployeeAccessRole();
                    role.setCompany(company);
                    role.setName(DEFAULT_EMPLOYEE_ACCESS_ROLE_NAME);
                    role.setDescription(DEFAULT_EMPLOYEE_ACCESS_ROLE_DESCRIPTION);
                    role.setArchived(false);
                    role.setPermissionsJson(writePermissionsJson(SecurityUtils.defaultEmployeePermissions()));
                    role.setCreatedAt(Instant.now());
                    role.setUpdatedAt(Instant.now());
                    try {
                        return accessRoleRepository.save(role);
                    } catch (DataIntegrityViolationException ex) {
                        return accessRoleRepository.findFirstByCompanyIdAndArchivedFalseAndNameIgnoreCase(companyId, DEFAULT_EMPLOYEE_ACCESS_ROLE_NAME)
                                .orElseThrow(() -> ex);
                    }
                });
    }

    private String writePermissionsJson(List<String> permissions) {
        try {
            return objectMapper.writeValueAsString(SecurityUtils.normalizePermissionsForStorage(permissions));
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private Object parseWorkingHoursJson(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String temporaryPassword() {
        return "Temp#" + UUID.randomUUID().toString().replace("-", "");
    }

    private String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void validateAvatar(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Avatar image file is required.");
        }
        if (file.getSize() > 5L * 1024L * 1024L) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Avatar image must be 5 MB or smaller.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().trim().toLowerCase();
        if (!contentType.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only image files are allowed.");
        }
    }
}
