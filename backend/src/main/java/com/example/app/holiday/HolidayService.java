package com.example.app.holiday;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class HolidayService {
    private static final Logger log = LoggerFactory.getLogger(HolidayService.class);
    private static final String COUNTRY_CODE = "SI";
    private static final Duration CACHE_TTL = Duration.ofHours(24);
    private static final ParameterizedTypeReference<List<NagerHoliday>> NAGER_LIST_TYPE =
            new ParameterizedTypeReference<>() {};

    private final RestTemplate restTemplate = new RestTemplate();
    private final Map<Integer, CacheEntry> byYearCache = new ConcurrentHashMap<>();

    public record HolidayDto(LocalDate date, String localName, String name) {}

    public List<HolidayDto> getHolidaysInRange(LocalDate from, LocalDate to) {
        List<HolidayDto> result = new ArrayList<>();
        for (int year = from.getYear(); year <= to.getYear(); year++) {
            var yearRows = getOrLoadYear(year);
            for (var h : yearRows) {
                if (h.date().isBefore(from) || h.date().isAfter(to)) {
                    continue;
                }
                result.add(new HolidayDto(h.date(), h.localName(), h.name()));
            }
        }
        result.sort((a, b) -> a.date().compareTo(b.date()));
        return result;
    }

    private List<HolidayDto> getOrLoadYear(int year) {
        CacheEntry existing = byYearCache.get(year);
        if (existing != null && !existing.isExpired()) {
            return existing.holidays();
        }
        synchronized (this) {
            CacheEntry recheck = byYearCache.get(year);
            if (recheck != null && !recheck.isExpired()) {
                return recheck.holidays();
            }
            List<HolidayDto> loaded = fetchYear(year);
            byYearCache.put(year, new CacheEntry(loaded, Instant.now().plus(CACHE_TTL)));
            return loaded;
        }
    }

    private List<HolidayDto> fetchYear(int year) {
        String url = "https://date.nager.at/api/v3/PublicHolidays/" + year + "/" + COUNTRY_CODE;
        try {
            ResponseEntity<List<NagerHoliday>> response = restTemplate.exchange(
                    url,
                    HttpMethod.GET,
                    null,
                    NAGER_LIST_TYPE
            );
            List<NagerHoliday> body = response.getBody();
            if (body == null) {
                return List.of();
            }
            return body.stream()
                    .filter(Objects::nonNull)
                    .filter(this::isWorkFreeHoliday)
                    .map(h -> new HolidayDto(h.date(), clean(h.localName()), clean(h.name())))
                    .filter(h -> h.date() != null)
                    .toList();
        } catch (Exception ex) {
            log.warn("Failed to load holidays for year {}: {}", year, ex.getMessage());
            return List.of();
        }
    }

    private boolean isWorkFreeHoliday(NagerHoliday h) {
        if (h.types() == null || h.types().isEmpty()) {
            return true;
        }
        return h.types().stream()
                .filter(Objects::nonNull)
                .map(v -> v.toLowerCase(Locale.ROOT))
                .anyMatch("public"::equals);
    }

    private String clean(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        return trimmed.isEmpty() ? "" : trimmed;
    }

    private record CacheEntry(List<HolidayDto> holidays, Instant expiresAt) {
        private boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }

    private record NagerHoliday(
            LocalDate date,
            String localName,
            String name,
            String countryCode,
            Boolean fixed,
            Boolean global,
            List<String> counties,
            Integer launchYear,
            List<String> types
    ) {}
}
