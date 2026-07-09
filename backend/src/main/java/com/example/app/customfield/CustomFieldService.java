package com.example.app.customfield;

import com.example.app.company.Company;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CustomFieldService {
    private static final Pattern SIMPLE_EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final CustomFieldDefinitionRepository definitions;
    private final CustomFieldValueRepository values;
    private final ObjectMapper objectMapper;

    public CustomFieldService(
            CustomFieldDefinitionRepository definitions,
            CustomFieldValueRepository values,
            ObjectMapper objectMapper
    ) {
        this.definitions = definitions;
        this.values = values;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public Map<Long, String> valuesForEntity(Long companyId, CustomFieldAppliesTo appliesTo, Long entityId) {
        if (entityId == null) {
            return Map.of();
        }
        Map<Long, Map<Long, String>> grouped = valuesForEntities(companyId, appliesTo, List.of(entityId));
        return grouped.getOrDefault(entityId, Map.of());
    }

    @Transactional(readOnly = true)
    public Map<Long, Map<Long, String>> valuesForEntities(Long companyId, CustomFieldAppliesTo appliesTo, Collection<Long> entityIds) {
        if (entityIds == null || entityIds.isEmpty()) {
            return Map.of();
        }
        Set<Long> ids = entityIds.stream().filter(Objects::nonNull).collect(Collectors.toSet());
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, Map<Long, String>> result = new HashMap<>();
        values.findAllByCompanyIdAndEntityTypeAndEntityIdIn(companyId, appliesTo, ids).forEach(value -> {
            if (value.getFieldDefinition() == null || value.getFieldDefinition().getId() == null) {
                return;
            }
            result.computeIfAbsent(value.getEntityId(), ignored -> new LinkedHashMap<>())
                    .put(value.getFieldDefinition().getId(), value.getValueText());
        });
        return result;
    }

    @Transactional
    public void saveValues(
            Company company,
            CustomFieldAppliesTo appliesTo,
            Long entityId,
            Map<Long, String> rawValues
    ) {
        if (company == null || company.getId() == null || entityId == null) {
            return;
        }
        Map<Long, String> incoming = rawValues == null ? Collections.emptyMap() : rawValues;
        Long companyId = company.getId();
        List<CustomFieldDefinition> activeDefinitions = definitions
                .findAllByCompanyIdAndAppliesToAndActiveTrueOrderBySortOrderAscNameAscIdAsc(companyId, appliesTo);
        Map<Long, CustomFieldValue> existing = values
                .findAllByCompanyIdAndEntityTypeAndEntityIdIn(companyId, appliesTo, List.of(entityId))
                .stream()
                .filter(value -> value.getFieldDefinition() != null && value.getFieldDefinition().getId() != null)
                .collect(Collectors.toMap(value -> value.getFieldDefinition().getId(), value -> value, (a, b) -> a));

        for (CustomFieldDefinition definition : activeDefinitions) {
            Long fieldId = definition.getId();
            String normalized = normalizeValue(definition, incoming.get(fieldId));
            if (definition.isRequired() && isEmptyCustomValue(definition.getFieldType(), normalized)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, definition.getName() + " is required.");
            }
            CustomFieldValue current = existing.get(fieldId);
            if (isEmptyCustomValue(definition.getFieldType(), normalized)) {
                if (current != null) {
                    values.delete(current);
                }
                continue;
            }
            if (current == null) {
                current = new CustomFieldValue();
                current.setCompany(company);
                current.setEntityType(appliesTo);
                current.setEntityId(entityId);
                current.setFieldDefinition(definition);
            }
            current.setValueText(normalized);
            values.save(current);
        }
    }

    @Transactional
    public void deleteValuesForEntity(Long companyId, CustomFieldAppliesTo appliesTo, Long entityId) {
        if (companyId == null || appliesTo == null || entityId == null) {
            return;
        }
        values.deleteAllByCompanyIdAndEntityTypeAndEntityId(companyId, appliesTo, entityId);
    }

    public List<String> parseOptions(String optionsJson) {
        if (optionsJson == null || optionsJson.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(optionsJson, STRING_LIST).stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(value -> !value.isBlank())
                    .distinct()
                    .toList();
        } catch (Exception ex) {
            return List.of();
        }
    }

    public String serializeOptions(List<String> options) {
        List<String> clean = options == null ? List.of() : options.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .toList();
        try {
            return objectMapper.writeValueAsString(clean);
        } catch (JsonProcessingException ex) {
            return "[]";
        }
    }

    private String normalizeValue(CustomFieldDefinition definition, String raw) {
        CustomFieldType type = definition.getFieldType() == null ? CustomFieldType.TEXT : definition.getFieldType();
        if (type == CustomFieldType.CHECKBOX) {
            if (raw == null) return null;
            String normalized = raw.trim().toLowerCase();
            if (normalized.equals("true") || normalized.equals("false")) return normalized;
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, definition.getName() + " must be true or false.");
        }
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;
        return switch (type) {
            case NUMBER -> normalizeNumber(definition, trimmed);
            case DATE -> normalizeDate(definition, trimmed);
            case EMAIL -> normalizeEmail(definition, trimmed);
            case DROPDOWN -> normalizeDropdown(definition, trimmed);
            case MULTI_SELECT -> normalizeMultiSelect(definition, trimmed);
            case PHONE, TEXT, LONG_TEXT -> trimmed;
            case CHECKBOX -> trimmed;
        };
    }

    private String normalizeNumber(CustomFieldDefinition definition, String value) {
        try {
            return new BigDecimal(value).stripTrailingZeros().toPlainString();
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, definition.getName() + " must be a number.");
        }
    }

    private String normalizeDate(CustomFieldDefinition definition, String value) {
        try {
            return LocalDate.parse(value).toString();
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, definition.getName() + " must be a valid date.");
        }
    }

    private String normalizeEmail(CustomFieldDefinition definition, String value) {
        String normalized = value.toLowerCase();
        if (!SIMPLE_EMAIL.matcher(normalized).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, definition.getName() + " must be a valid email.");
        }
        return normalized;
    }

    private String normalizeDropdown(CustomFieldDefinition definition, String value) {
        List<String> options = parseOptions(definition.getOptionsJson());
        if (!options.isEmpty() && options.stream().noneMatch(option -> option.equals(value))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, definition.getName() + " has an invalid option.");
        }
        return value;
    }

    private String normalizeMultiSelect(CustomFieldDefinition definition, String value) {
        List<String> selected;
        try {
            selected = objectMapper.readValue(value, STRING_LIST).stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(item -> !item.isBlank())
                    .distinct()
                    .toList();
        } catch (Exception ex) {
            selected = List.of(value);
        }
        List<String> options = parseOptions(definition.getOptionsJson());
        if (!options.isEmpty()) {
            for (String item : selected) {
                if (options.stream().noneMatch(option -> option.equals(item))) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, definition.getName() + " has an invalid option.");
                }
            }
        }
        return serializeOptions(selected);
    }

    private static boolean isEmptyCustomValue(CustomFieldType type, String value) {
        if (value == null || value.isBlank()) return true;
        return type == CustomFieldType.MULTI_SELECT && value.trim().equals("[]");
    }
}
