package com.example.app.client;

import com.example.app.company.ClientCompanyRepository;
import com.example.app.security.SecurityUtils;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/clients")
public class ClientController {
    private final ClientRepository repository;
    private final UserRepository users;
    private final SessionBookingRepository bookings;
    private final ClientAnonymizationService anonymizationService;
    private final ClientCompanyRepository clientCompanies;

    public ClientController(
            ClientRepository repository,
            UserRepository users,
            SessionBookingRepository bookings,
            ClientAnonymizationService anonymizationService,
            ClientCompanyRepository clientCompanies
    ) {
        this.repository = repository;
        this.users = users;
        this.bookings = bookings;
        this.anonymizationService = anonymizationService;
        this.clientCompanies = clientCompanies;
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
            Long billingCompanyId,
            Boolean batchPaymentEnabled,
            List<PreferredSlotRequest> preferredSlots
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
            boolean anonymized,
            Instant anonymizedAt,
            boolean active,
            boolean batchPaymentEnabled,
            UserSummary assignedTo,
            CompanySummary billingCompany,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record ClientSessionResponse(
            Long id,
            LocalDateTime startTime,
            LocalDateTime endTime,
            String consultantFirstName,
            String consultantLastName,
            boolean paid
    ) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<ClientResponse> list(@AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        List<Client> rows = SecurityUtils.isAdmin(me)
                ? repository.findAllByCompanyId(companyId)
                : repository.findByAssignedToIdAndCompanyId(me.getId(), companyId);
        return rows.stream().map(ClientController::toResponse).toList();
    }

    @PostMapping
    @Transactional
    public ClientResponse create(@RequestBody ClientRequest req, @AuthenticationPrincipal User me) {
        var c = new Client();
        apply(c, req, me);
        return toResponse(repository.save(c));
    }

    @PutMapping("/{id}")
    @Transactional
    public ClientResponse update(@PathVariable Long id, @RequestBody ClientRequest req, @AuthenticationPrincipal User me) {
        var c = repository.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !c.getAssignedTo().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        apply(c, req, me);
        return toResponse(repository.save(c));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var c = repository.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !c.getAssignedTo().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
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
        if (!SecurityUtils.isAdmin(me) && !c.getAssignedTo().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        c.setActive(false);
        return toResponse(repository.save(c));
    }

    @PatchMapping("/{id}/activate")
    @Transactional
    public ClientResponse activate(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var c = repository.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && !c.getAssignedTo().getId().equals(me.getId())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        c.setActive(true);
        return toResponse(repository.save(c));
    }

    @GetMapping("/{id}/bookings")
    @Transactional(readOnly = true)
    public List<ClientSessionResponse> clientBookings(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var c = repository.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!SecurityUtils.isAdmin(me) && (c.getAssignedTo() == null || !c.getAssignedTo().getId().equals(me.getId()))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        var list = bookings.findByClientIdAndCompanyId(id, companyId);
        if (!SecurityUtils.isAdmin(me)) {
            list = list.stream()
                    .filter(b -> b.getConsultant() != null && b.getConsultant().getId().equals(me.getId()))
                    .toList();
        }
        return list.stream().map(ClientController::toClientSessionResponse).toList();
    }

    private static ClientSessionResponse toClientSessionResponse(SessionBooking b) {
        var u = b.getConsultant();
        return new ClientSessionResponse(
                b.getId(),
                b.getStartTime(),
                b.getEndTime(),
                u == null ? "Unassigned" : u.getFirstName(),
                u == null ? "" : u.getLastName(),
                b.getBilledAt() != null
        );
    }

    private void apply(Client c, ClientRequest req, User me) {
        c.setCompany(me.getCompany());
        c.setFirstName(req.firstName());
        c.setLastName(req.lastName());
        c.setEmail(req.email());
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
        User assigned;
        if (SecurityUtils.isAdmin(me)) {
            if (req.assignedToId() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "assignedToId is required for admin");
            }
            assigned = users.findByIdAndCompanyId(req.assignedToId(), me.getCompany().getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consultant"));
            if (!assigned.isConsultant() && assigned.getRole() != Role.CONSULTANT) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected user is not marked as consultant");
            }
        } else {
            assigned = me;
        }
        c.setAssignedTo(assigned);
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

    private static ClientResponse toResponse(Client c) {
        var assigned = c.getAssignedTo();
        var assignedSummary = new UserSummary(
                assigned.getId(),
                assigned.getFirstName(),
                assigned.getLastName(),
                assigned.getEmail(),
                assigned.getRole()
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
                c.isAnonymized(),
                c.getAnonymizedAt(),
                c.isActive(),
                c.isBatchPaymentEnabled(),
                assignedSummary,
                toCompanySummary(c),
                c.getCreatedAt(),
                c.getUpdatedAt()
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


    private static String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
