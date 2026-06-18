package com.example.app.user;

import com.example.app.entitlement.PackageAccessService;
import com.example.app.files.TenantFileS3Service;
import com.example.app.security.SecurityUtils;
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
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final ObjectMapper objectMapper;
    private final PackageAccessService packageAccessService;
    private final TenantFileS3Service fileStorage;

    public UserController(UserRepository userRepository, PasswordEncoder passwordEncoder, ObjectMapper objectMapper, PackageAccessService packageAccessService, TenantFileS3Service fileStorage) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
        this.packageAccessService = packageAccessService;
        this.fileStorage = fileStorage;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<UserResponse> findAll(@AuthenticationPrincipal User me) {
        return userRepository.findAllByCompanyId(me.getCompany().getId())
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    /** Current user's full row (for consultant self-service profile editor). */
    @GetMapping("/profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getProfile(@AuthenticationPrincipal User me) {
        return ResponseEntity.ok(toResponse(me));
    }

    /** Consultant-only: update own name, contact, working hours, optional password (role unchanged). */
    @PutMapping("/profile")
    @PreAuthorize("hasRole('CONSULTANT')")
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
                    if (request.password() != null && !request.password().isBlank()) {
                        existing.setPasswordHash(passwordEncoder.encode(request.password()));
                    }
                    try {
                        User saved = userRepository.save(existing);
                        return ResponseEntity.ok(toResponse(saved));
                    } catch (DataIntegrityViolationException ex) {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("message", "A consultant with this email already exists."));
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
        return userRepository.findByIdAndCompanyId(id, me.getCompany().getId())
                .<ResponseEntity<?>>map(user -> ResponseEntity.ok(toResponse(user)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Consultant not found.")));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
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
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(request.role());
        user.setActive(true);
        user.setConsultant(request.consultant() || request.role() == Role.CONSULTANT);
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
        user.setPermissionsJson(writePermissionsJson(request.permissions() == null ? SecurityUtils.defaultEmployeePermissions() : request.permissions()));

        try {
            User saved = userRepository.save(user);
            return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(saved));
        } catch (DataIntegrityViolationException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "A consultant with this email already exists."));
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody UpdateUserRequest request, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        return userRepository.findByIdAndCompanyId(id, companyId)
                .<ResponseEntity<?>>map(existing -> {
                    String normalizedEmail = request.email().trim().toLowerCase();

                    boolean emailBelongsToAnotherUser = userRepository.findByEmailIgnoreCaseAndCompanyId(normalizedEmail, companyId)
                            .map(user -> !user.getId().equals(id))
                            .orElse(false);

                    if (emailBelongsToAnotherUser) {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("message", "A consultant with this email already exists."));
                    }

                    existing.setFirstName(request.firstName().trim());
                    existing.setLastName(request.lastName().trim());
                    existing.setEmail(normalizedEmail);
                    existing.setRole(request.role());
                    existing.setConsultant(request.consultant() || request.role() == Role.CONSULTANT);
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

                    if (request.permissions() != null) {
                        existing.setPermissionsJson(writePermissionsJson(request.permissions()));
                    }

                    if (request.password() != null && !request.password().isBlank()) {
                        existing.setPasswordHash(passwordEncoder.encode(request.password()));
                    }

                    try {
                        User saved = userRepository.save(existing);
                        return ResponseEntity.ok(toResponse(saved));
                    } catch (DataIntegrityViolationException ex) {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("message", "A consultant with this email already exists."));
                    }
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Consultant not found.")));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        if (userRepository.findByIdAndCompanyId(id, me.getCompany().getId()).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Consultant not found."));
        }

        userRepository.deleteById(id);
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
                    return ResponseEntity.ok(toResponse(userRepository.save(target)));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Consultant not found.")));
    }

    @PatchMapping("/{id}/activate")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public ResponseEntity<?> activateUser(@PathVariable Long id, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        return userRepository.findByIdAndCompanyId(id, companyId)
                .<ResponseEntity<?>>map(target -> {
                    if (!target.isActive()) {
                        packageAccessService.requireCanCreateUser(me);
                    }
                    target.setActive(true);
                    target.setUpdatedAt(Instant.now());
                    return ResponseEntity.ok(toResponse(userRepository.save(target)));
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
                    return ResponseEntity.ok(toResponse(saved));
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

    public record CreateUserRequest(
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            @NotBlank String password,
            @NotNull Role role,
            @NotNull Boolean consultant,
            String vatId,
            String phone,
            JsonNode workingHours,
            List<String> permissions
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
            List<String> permissions
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
            String avatarPath,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record UserQuotaResponse(
            long activeUsers,
            Integer maxUsers,
            boolean reached
    ) {
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole(),
                user.isConsultant() || user.getRole() == Role.CONSULTANT,
                user.isActive(),
                user.getVatId(),
                user.getPhone(),
                user.getWhatsappSenderNumber(),
                user.getWhatsappPhoneNumberId(),
                parseWorkingHoursJson(user.getWorkingHoursJson()),
                SecurityUtils.permissionsForClientResponse(user.getPermissionsJson()),
                user.getAvatarS3Key() == null || user.getAvatarS3Key().isBlank()
                        ? null
                        : "/api/users/" + user.getId() + "/avatar?v=" + (user.getUpdatedAt() == null ? 0 : user.getUpdatedAt().toEpochMilli()),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
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
