package com.example.app.user;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

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

    public UserController(UserRepository userRepository, PasswordEncoder passwordEncoder, ObjectMapper objectMapper) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<UserResponse> findAll(@AuthenticationPrincipal User me) {
        return userRepository.findAllByCompanyId(me.getCompany().getId())
                .stream().map(this::toResponse).collect(Collectors.toList());
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

    public record CreateUserRequest(
            @NotBlank String firstName,
            @NotBlank String lastName,
            @NotBlank @Email String email,
            @NotBlank String password,
            @NotNull Role role,
            @NotNull Boolean consultant,
            String vatId,
            String phone,
            JsonNode workingHours
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
            Instant createdAt,
            Instant updatedAt
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
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
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
}
