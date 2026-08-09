package com.example.app.user;

import com.example.app.location.Location;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Central authority for employee/consultant branch scope and per-location working-hour overrides. */
@Service
public class ConsultantLocationService {
    private final ObjectMapper objectMapper;

    public ConsultantLocationService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public boolean isAvailableAt(User user, Long locationId) {
        if (user == null || locationId == null || !user.isActive() || !user.isConsultant()) return false;
        if (user.isAvailableAllLocations()) return true;
        return user.getLocations() != null && user.getLocations().stream()
                .map(Location::getId)
                .filter(Objects::nonNull)
                .anyMatch(locationId::equals);
    }

    public void requireAvailableAt(User user, Location location) {
        if (location == null || location.getId() == null || !isAvailableAt(user, location.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selected employee is not available at this location.");
        }
    }

    /** Returns the location override when present, otherwise the user's global working-hours JSON. */
    public String workingHoursJsonFor(User user, Long locationId) {
        if (user == null) return null;
        if (locationId != null) {
            String overrides = user.getWorkingHoursByLocationJson();
            if (overrides != null && !overrides.isBlank()) {
                try {
                    JsonNode root = objectMapper.readTree(overrides);
                    JsonNode node = root == null ? null : root.get(String.valueOf(locationId));
                    if (node != null && !node.isNull() && node.isObject()) {
                        return objectMapper.writeValueAsString(node);
                    }
                } catch (Exception ignored) {
                    // Invalid legacy/development JSON falls back to the global schedule.
                }
            }
        }
        return user.getWorkingHoursJson();
    }

    public Map<String, Object> workingHoursOverridesForResponse(User user) {
        if (user == null || user.getWorkingHoursByLocationJson() == null || user.getWorkingHoursByLocationJson().isBlank()) {
            return Map.of();
        }
        try {
            JsonNode root = objectMapper.readTree(user.getWorkingHoursByLocationJson());
            if (root == null || !root.isObject()) return Map.of();
            Map<String, Object> result = new LinkedHashMap<>();
            root.fields().forEachRemaining(entry -> result.put(entry.getKey(), objectMapper.convertValue(entry.getValue(), Object.class)));
            return result;
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    public List<Long> assignedLocationIds(User user) {
        if (user == null || user.getLocations() == null) return List.of();
        return user.getLocations().stream()
                .map(Location::getId)
                .filter(Objects::nonNull)
                .sorted()
                .toList();
    }
}
