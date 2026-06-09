package com.example.app.admin;

import com.example.app.common.SimulatedTimeService;
import com.example.app.common.SimulatedTimeService.Simulation;
import com.example.app.common.TimeService;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Platform Admin endpoints to control the per-tenant date/time simulator.
 *
 * <p>SUPER_ADMIN only. Shifting a tenant's clock only affects time-based business logic for that
 * tenant; security, fiscalization and audit timestamps are never simulated.</p>
 */
@RestController
@RequestMapping("/api/platform-admin/time-simulator")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class PlatformTimeSimulatorController {
    private final SimulatedTimeService simulatedTimeService;
    private final TimeService timeService;
    private final CompanyRepository companies;

    public PlatformTimeSimulatorController(SimulatedTimeService simulatedTimeService, TimeService timeService, CompanyRepository companies) {
        this.simulatedTimeService = simulatedTimeService;
        this.timeService = timeService;
        this.companies = companies;
    }

    public record SimulationView(
            Long tenantId,
            String tenantName,
            long offsetSeconds,
            boolean enabled,
            String realNow,
            String simulatedNow) {}

    public record ChangeRequest(
            Long tenantId,
            String mode,
            String absoluteDateTime,
            Long offsetSeconds,
            Long advanceSeconds,
            String zone) {}

    @GetMapping
    public List<SimulationView> list() {
        return simulatedTimeService.listSimulations().stream().map(this::toView).toList();
    }

    @PutMapping
    public SimulationView change(@RequestBody ChangeRequest request) {
        if (request == null || request.tenantId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "tenantId is required.");
        }
        Long tenantId = request.tenantId();
        if (companies.findById(tenantId).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found.");
        }
        String mode = request.mode() == null ? "" : request.mode().trim().toUpperCase();
        Simulation result = switch (mode) {
            case "ABSOLUTE" -> {
                if (request.absoluteDateTime() == null || request.absoluteDateTime().isBlank()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "absoluteDateTime is required for ABSOLUTE mode.");
                }
                yield simulatedTimeService.setAbsolute(tenantId, parseDateTime(request.absoluteDateTime()), parseZone(request.zone()));
            }
            case "OFFSET" -> simulatedTimeService.setOffset(tenantId, Duration.ofSeconds(request.offsetSeconds() == null ? 0L : request.offsetSeconds()));
            case "ADVANCE" -> simulatedTimeService.advance(tenantId, Duration.ofSeconds(request.advanceSeconds() == null ? 0L : request.advanceSeconds()));
            case "DISABLED", "CLEAR", "RESET" -> {
                simulatedTimeService.clear(tenantId);
                yield new Simulation(tenantId, companies.findById(tenantId).map(Company::getName).orElse(null), 0L, Instant.now().getEpochSecond(), false);
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported mode: " + mode);
        };
        return toView(result);
    }

    @DeleteMapping("/{tenantId}")
    public SimulationView clear(@PathVariable Long tenantId) {
        simulatedTimeService.clear(tenantId);
        return new SimulationView(
                tenantId,
                companies.findById(tenantId).map(Company::getName).orElse(null),
                0L,
                false,
                Instant.now().toString(),
                Instant.now().toString());
    }

    private SimulationView toView(Simulation sim) {
        Instant simulatedNow = sim.tenantId == null ? Instant.now() : timeService.instant(sim.tenantId);
        return new SimulationView(
                sim.tenantId,
                sim.tenantName,
                sim.offsetSeconds,
                sim.enabled && sim.offsetSeconds != 0L,
                Instant.now().toString(),
                simulatedNow.toString());
    }

    private static LocalDateTime parseDateTime(String raw) {
        String value = raw.trim();
        try {
            return LocalDateTime.parse(value);
        } catch (DateTimeParseException ignored) {
            // Accept "yyyy-MM-dd" (start of day).
            try {
                return java.time.LocalDate.parse(value).atStartOfDay();
            } catch (DateTimeParseException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid absoluteDateTime; use ISO yyyy-MM-ddTHH:mm or yyyy-MM-dd.");
            }
        }
    }

    private static ZoneId parseZone(String raw) {
        if (raw == null || raw.isBlank()) {
            return ZoneId.systemDefault();
        }
        try {
            return ZoneId.of(raw.trim());
        } catch (Exception e) {
            return ZoneId.systemDefault();
        }
    }
}
