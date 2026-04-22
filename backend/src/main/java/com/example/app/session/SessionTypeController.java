package com.example.app.session;

import com.example.app.billing.PriceMath;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/types")
public class SessionTypeController {
    private final SessionTypeRepository repo;
    private final TransactionServiceRepository txRepo;

    public SessionTypeController(SessionTypeRepository repo, TransactionServiceRepository txRepo) {
        this.repo = repo;
        this.txRepo = txRepo;
    }

    public record TypeServiceItem(Long transactionServiceId, BigDecimal price) {}
    public record TypeRequest(
            String name,
            String description,
            Integer durationMinutes,
            Integer breakMinutes,
            Integer maxParticipantsPerSession,
            Boolean widgetGroupBookingEnabled,
            Boolean guestBookingEnabled,
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
            String name,
            String description,
            Integer durationMinutes,
            Integer breakMinutes,
            Integer maxParticipantsPerSession,
            boolean widgetGroupBookingEnabled,
            boolean guestBookingEnabled,
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
        type.setCompany(me.getCompany());
        type.setName(req.name());
        type.setDescription(req.description());
        type.setDurationMinutes(req.durationMinutes() != null ? req.durationMinutes() : 60);
        type.setBreakMinutes(req.breakMinutes() != null ? req.breakMinutes() : 0);
        type.setMaxParticipantsPerSession(normalizeMaxParticipantsPerSession(req.maxParticipantsPerSession()));
        type.setWidgetGroupBookingEnabled(Boolean.TRUE.equals(req.widgetGroupBookingEnabled()));
        type.setGuestBookingEnabled(req.guestBookingEnabled() == null || Boolean.TRUE.equals(req.guestBookingEnabled()));
        type = repo.save(type);
        saveLinkedServices(type, req.services(), me.getCompany().getId());
        final Long createdId = type.getId();
        return toResponse(repo.findAllWithLinkedServicesByCompanyId(me.getCompany().getId()).stream()
                .filter(x -> x.getId().equals(createdId))
                .findFirst()
                .orElseThrow());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    @Transactional
    public TypeResponse update(@PathVariable Long id, @RequestBody TypeRequest req, @AuthenticationPrincipal User me) {
        var type = repo.findById(id).orElseThrow();
        if (!type.getCompany().getId().equals(me.getCompany().getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        type.setName(req.name());
        type.setDescription(req.description());
        type.setDurationMinutes(req.durationMinutes() != null ? req.durationMinutes() : 60);
        type.setBreakMinutes(req.breakMinutes() != null ? req.breakMinutes() : 0);
        type.setMaxParticipantsPerSession(normalizeMaxParticipantsPerSession(req.maxParticipantsPerSession()));
        type.setWidgetGroupBookingEnabled(Boolean.TRUE.equals(req.widgetGroupBookingEnabled()));
        type.setGuestBookingEnabled(req.guestBookingEnabled() == null || Boolean.TRUE.equals(req.guestBookingEnabled()));
        type.getLinkedServices().clear();
        repo.saveAndFlush(type);
        saveLinkedServices(type, req.services() != null ? req.services() : List.of(), me.getCompany().getId());
        return toResponse(repo.findAllWithLinkedServicesByCompanyId(me.getCompany().getId()).stream()
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
        repo.delete(type);
    }

    private void saveLinkedServices(SessionType type, List<TypeServiceItem> items, Long companyId) {
        if (items == null) return;
        for (var item : items) {
            var tx = txRepo.findByIdAndCompanyId(item.transactionServiceId(), companyId).orElseThrow();
            var link = new TypeTransactionService();
            link.setSessionType(type);
            link.setTransactionService(tx);
            link.setPrice(item.price());
            type.getLinkedServices().add(link);
        }
        repo.save(type);
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
                duration,
                breakMinutes,
                t.getMaxParticipantsPerSession(),
                t.isWidgetGroupBookingEnabled(),
                t.isGuestBookingEnabled(),
                services
        );
    }

    private Integer normalizeMaxParticipantsPerSession(Integer value) {
        if (value == null) return null;
        if (value < 1 || value > 999) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Max participants per session must be between 1 and 999.");
        }
        return value;
    }
}
