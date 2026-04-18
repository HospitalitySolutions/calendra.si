package com.example.app.group;

import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.User;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/groups")
public class ClientGroupController {
    private final ClientGroupRepository groups;
    private final ClientRepository clients;
    private final ClientCompanyRepository clientCompanies;
    private final SessionBookingRepository bookings;

    public ClientGroupController(
            ClientGroupRepository groups,
            ClientRepository clients,
            ClientCompanyRepository clientCompanies,
            SessionBookingRepository bookings
    ) {
        this.groups = groups;
        this.clients = clients;
        this.clientCompanies = clientCompanies;
        this.bookings = bookings;
    }

    public record GroupRequest(
            String name,
            String email,
            Long billingCompanyId,
            Boolean batchPaymentEnabled,
            Boolean individualPaymentEnabled
    ) {}

    public record ClientSummary(Long id, String firstName, String lastName, String email, String phone) {}

    public record CompanySummary(Long id, String name, boolean active) {}

    public record GroupResponse(
            Long id,
            String name,
            String email,
            boolean active,
            boolean batchPaymentEnabled,
            boolean individualPaymentEnabled,
            CompanySummary billingCompany,
            List<ClientSummary> members,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record GroupSessionResponse(
            Long id,
            LocalDateTime startTime,
            LocalDateTime endTime,
            String consultantFirstName,
            String consultantLastName,
            boolean paid
    ) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<GroupResponse> list(
            @RequestParam(required = false) String search,
            @AuthenticationPrincipal User me
    ) {
        var companyId = me.getCompany().getId();
        var rows = (search == null || search.isBlank())
                ? groups.findAllByCompanyIdOrderByNameAsc(companyId)
                : groups.searchByCompanyId(companyId, search.trim());
        return rows.stream().map(ClientGroupController::toResponse).toList();
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public GroupResponse get(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var row = groups.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return toResponse(row);
    }

    @PostMapping
    @Transactional
    public GroupResponse create(@RequestBody GroupRequest req, @AuthenticationPrincipal User me) {
        if (req.name() == null || req.name().trim().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group name is required.");
        }
        var row = new ClientGroup();
        row.setCompany(me.getCompany());
        apply(row, req, me);
        return toResponse(groups.save(row));
    }

    @PutMapping("/{id}")
    @Transactional
    public GroupResponse update(@PathVariable Long id, @RequestBody GroupRequest req, @AuthenticationPrincipal User me) {
        var row = groups.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        apply(row, req, me);
        return toResponse(groups.save(row));
    }

    @PatchMapping("/{id}/deactivate")
    @Transactional
    public GroupResponse deactivate(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var row = groups.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        row.setActive(false);
        return toResponse(groups.save(row));
    }

    @PatchMapping("/{id}/activate")
    @Transactional
    public GroupResponse activate(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var row = groups.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        row.setActive(true);
        return toResponse(groups.save(row));
    }

    @PostMapping("/{id}/members/{clientId}")
    @Transactional
    public GroupResponse addMember(@PathVariable Long id, @PathVariable Long clientId, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var group = groups.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        var client = clients.findByIdAndCompanyId(clientId, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Client not found."));
        if (group.getMembers().stream().anyMatch(m -> m.getId().equals(clientId))) {
            return toResponse(group);
        }
        group.getMembers().add(client);
        return toResponse(groups.save(group));
    }

    @DeleteMapping("/{id}/members/{clientId}")
    @Transactional
    public GroupResponse removeMember(@PathVariable Long id, @PathVariable Long clientId, @AuthenticationPrincipal User me) {
        var group = groups.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        group.getMembers().removeIf(m -> m.getId().equals(clientId));
        return toResponse(groups.save(group));
    }

    @GetMapping("/{id}/bookings")
    @Transactional(readOnly = true)
    public List<GroupSessionResponse> groupBookings(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var companyId = me.getCompany().getId();
        var group = groups.findByIdAndCompanyId(id, companyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (group.getMembers().isEmpty()) return List.of();
        List<SessionBooking> rows = bookings.findAllByCompanyId(companyId).stream()
                .filter(b -> b.getClientGroup() != null && b.getClientGroup().getId().equals(id))
                .toList();
        // One logical group session = one row per bookingGroupKey (multiple DB rows share the same key, one per member).
        Map<String, SessionBooking> onePerSession = new LinkedHashMap<>();
        for (SessionBooking b : rows) {
            String key = sessionDedupeKey(b);
            onePerSession.merge(key, b, (a, c) -> a.getId() < c.getId() ? a : c);
        }
        return onePerSession.values().stream()
                .sorted(Comparator.comparing(SessionBooking::getStartTime))
                .map(ClientGroupController::toSessionResponse)
                .toList();
    }

    /** Same idea as SessionBookingController.groupKey: one key per multi-client session. */
    private static String sessionDedupeKey(SessionBooking b) {
        String k = b.getBookingGroupKey();
        if (k != null && !k.isBlank()) {
            return k;
        }
        return "legacy-" + b.getId();
    }

    private void apply(ClientGroup row, GroupRequest req, User me) {
        if (req.name() != null && !req.name().trim().isBlank()) {
            row.setName(req.name().trim());
        }
        row.setEmail(normalize(req.email()));
        if (req.billingCompanyId() != null) {
            var bc = clientCompanies.findByIdAndOwnerCompanyId(req.billingCompanyId(), me.getCompany().getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Billing company not found."));
            row.setBillingCompany(bc);
        } else {
            row.setBillingCompany(null);
        }
        if (req.batchPaymentEnabled() != null) {
            row.setBatchPaymentEnabled(req.batchPaymentEnabled());
        }
        if (req.individualPaymentEnabled() != null) {
            row.setIndividualPaymentEnabled(req.individualPaymentEnabled());
        }
    }

    static GroupResponse toResponse(ClientGroup g) {
        CompanySummary bc = null;
        if (g.getBillingCompany() != null) {
            bc = new CompanySummary(g.getBillingCompany().getId(), g.getBillingCompany().getName(), g.getBillingCompany().isActive());
        }
        var members = g.getMembers().stream()
                .map(c -> new ClientSummary(c.getId(), c.getFirstName(), c.getLastName(), c.getEmail(), c.getPhone()))
                .toList();
        return new GroupResponse(
                g.getId(),
                g.getName(),
                g.getEmail(),
                g.isActive(),
                g.isBatchPaymentEnabled(),
                g.isIndividualPaymentEnabled(),
                bc,
                members,
                g.getCreatedAt(),
                g.getUpdatedAt()
        );
    }

    private static GroupSessionResponse toSessionResponse(SessionBooking b) {
        return new GroupSessionResponse(
                b.getId(),
                b.getStartTime(),
                b.getEndTime(),
                b.getConsultant() != null ? b.getConsultant().getFirstName() : null,
                b.getConsultant() != null ? b.getConsultant().getLastName() : null,
                b.getBilledAt() != null
        );
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
