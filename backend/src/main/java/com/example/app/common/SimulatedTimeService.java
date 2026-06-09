package com.example.app.common;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Owns the per-tenant simulated-time offsets used to artificially shift the clock for testing.
 *
 * <p>State is persisted as a single JSON row ({@link SettingKey#PLATFORM_TIME_SIMULATION_JSON}) on the
 * Platform Admin company and cached in memory. Reads ({@link #offsetFor(Long)}) hit only the cache so
 * the hot path stays cheap; the cache is refreshed on writes and on a short schedule so multiple app
 * instances converge.</p>
 */
@Service
public class SimulatedTimeService {
    private static final Logger log = LoggerFactory.getLogger(SimulatedTimeService.class);
    private static final String PLATFORM_ADMIN_COMPANY_NAME = "Platform Admin";

    private final CompanyRepository companies;
    private final UserRepository users;
    private final AppSettingRepository settings;
    private final ObjectMapper objectMapper;

    private volatile Map<Long, Long> offsetCache = Map.of();

    public SimulatedTimeService(CompanyRepository companies, UserRepository users, AppSettingRepository settings, ObjectMapper objectMapper) {
        this.companies = companies;
        this.users = users;
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static final class Simulation {
        public Long tenantId;
        public String tenantName;
        public long offsetSeconds;
        public long setAtEpochSeconds;
        public boolean enabled = true;

        public Simulation() {
        }

        public Simulation(Long tenantId, String tenantName, long offsetSeconds, long setAtEpochSeconds, boolean enabled) {
            this.tenantId = tenantId;
            this.tenantName = tenantName;
            this.offsetSeconds = offsetSeconds;
            this.setAtEpochSeconds = setAtEpochSeconds;
            this.enabled = enabled;
        }
    }

    @PostConstruct
    public void init() {
        reloadCache();
    }

    /** Periodically refresh from storage so other app instances' changes propagate. */
    @Scheduled(fixedDelayString = "${app.time-simulator.cache-refresh-ms:15000}")
    public void reloadCache() {
        try {
            Map<Long, Long> next = new LinkedHashMap<>();
            for (Simulation sim : readAll()) {
                if (sim.tenantId != null && sim.enabled && sim.offsetSeconds != 0L) {
                    next.put(sim.tenantId, sim.offsetSeconds);
                }
            }
            this.offsetCache = Map.copyOf(next);
        } catch (Exception e) {
            log.warn("Failed to refresh time-simulation cache", e);
        }
    }

    /** Effective offset for a tenant; {@link Duration#ZERO} when no active simulation. Cache-only, no DB. */
    public Duration offsetFor(Long tenantId) {
        if (tenantId == null) {
            return Duration.ZERO;
        }
        Long seconds = offsetCache.get(tenantId);
        return seconds == null ? Duration.ZERO : Duration.ofSeconds(seconds);
    }

    public boolean hasAnySimulation() {
        return !offsetCache.isEmpty();
    }

    public List<Simulation> listSimulations() {
        List<Simulation> all = readAll();
        all.sort(Comparator.comparing(s -> s.tenantName == null ? "" : s.tenantName.toLowerCase()));
        return all;
    }

    @Transactional
    public Simulation setAbsolute(Long tenantId, LocalDateTime target, ZoneId zone) {
        Objects.requireNonNull(target, "target");
        ZoneId effectiveZone = zone == null ? ZoneId.systemDefault() : zone;
        long targetEpoch = target.atZone(effectiveZone).toEpochSecond();
        long offset = targetEpoch - Instant.now().getEpochSecond();
        return upsert(tenantId, offset);
    }

    @Transactional
    public Simulation setOffset(Long tenantId, Duration offset) {
        return upsert(tenantId, offset == null ? 0L : offset.getSeconds());
    }

    @Transactional
    public Simulation advance(Long tenantId, Duration delta) {
        long current = offsetFor(tenantId).getSeconds();
        long next = current + (delta == null ? 0L : delta.getSeconds());
        return upsert(tenantId, next);
    }

    @Transactional
    public void clear(Long tenantId) {
        if (tenantId == null) {
            return;
        }
        List<Simulation> all = readAll();
        all.removeIf(s -> Objects.equals(s.tenantId, tenantId));
        writeAll(all);
        reloadCache();
    }

    private Simulation upsert(Long tenantId, long offsetSeconds) {
        if (tenantId == null) {
            throw new IllegalArgumentException("tenantId is required");
        }
        List<Simulation> all = readAll();
        all.removeIf(s -> Objects.equals(s.tenantId, tenantId));
        String tenantName = companies.findById(tenantId).map(Company::getName).orElse(null);
        Simulation sim = new Simulation(tenantId, tenantName, offsetSeconds, Instant.now().getEpochSecond(), offsetSeconds != 0L);
        all.add(sim);
        writeAll(all);
        reloadCache();
        return sim;
    }

    private List<Simulation> readAll() {
        Company platform = resolvePlatformCompany().orElse(null);
        if (platform == null || platform.getId() == null) {
            return new ArrayList<>();
        }
        String json = settings.findByCompanyIdAndKey(platform.getId(), SettingKey.PLATFORM_TIME_SIMULATION_JSON)
                .map(AppSetting::getValue)
                .filter(v -> v != null && !v.isBlank())
                .orElse(null);
        if (json == null) {
            return new ArrayList<>();
        }
        try {
            List<Simulation> parsed = objectMapper.readValue(json, new TypeReference<List<Simulation>>() {});
            return parsed == null ? new ArrayList<>() : new ArrayList<>(parsed);
        } catch (Exception e) {
            log.warn("Could not parse PLATFORM_TIME_SIMULATION_JSON; resetting", e);
            return new ArrayList<>();
        }
    }

    private void writeAll(List<Simulation> simulations) {
        Company platform = resolvePlatformCompany().orElse(null);
        if (platform == null || platform.getId() == null) {
            throw new IllegalStateException("Platform Admin company not found");
        }
        String json;
        try {
            json = objectMapper.writeValueAsString(simulations);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialize time simulations", e);
        }
        AppSetting setting = settings.findByCompanyIdAndKey(platform.getId(), SettingKey.PLATFORM_TIME_SIMULATION_JSON)
                .orElseGet(() -> {
                    AppSetting s = new AppSetting();
                    s.setCompany(platform);
                    s.setKey(SettingKey.PLATFORM_TIME_SIMULATION_JSON.name());
                    return s;
                });
        setting.setValue(json);
        settings.save(setting);
    }

    private Optional<Company> resolvePlatformCompany() {
        Optional<Company> named = companies.findAll().stream()
                .filter(c -> c.getName() != null && PLATFORM_ADMIN_COMPANY_NAME.equalsIgnoreCase(c.getName().trim()))
                .min(Comparator.comparing(Company::getId));
        if (named.isPresent()) {
            return named;
        }
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .map(com.example.app.user.User::getCompany)
                .filter(Objects::nonNull)
                .findFirst();
    }
}
