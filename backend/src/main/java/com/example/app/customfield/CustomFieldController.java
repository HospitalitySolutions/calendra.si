package com.example.app.customfield;

import com.example.app.user.User;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/custom-fields")
public class CustomFieldController {
    private final CustomFieldDefinitionRepository definitions;
    private final CustomFieldValueRepository values;
    private final CustomFieldService customFieldService;

    public CustomFieldController(
            CustomFieldDefinitionRepository definitions,
            CustomFieldValueRepository values,
            CustomFieldService customFieldService
    ) {
        this.definitions = definitions;
        this.values = values;
        this.customFieldService = customFieldService;
    }

    public record CustomFieldDefinitionRequest(
            String name,
            CustomFieldAppliesTo appliesTo,
            CustomFieldType fieldType,
            Boolean required,
            Boolean showInList,
            Integer sortOrder,
            Boolean active,
            List<String> options
    ) {}

    public record CustomFieldDefinitionResponse(
            Long id,
            String name,
            CustomFieldAppliesTo appliesTo,
            CustomFieldType fieldType,
            boolean required,
            boolean showInList,
            int sortOrder,
            boolean active,
            List<String> options,
            Instant createdAt,
            Instant updatedAt
    ) {}

    @GetMapping
    @Transactional(readOnly = true)
    public List<CustomFieldDefinitionResponse> list(
            @RequestParam(required = false) CustomFieldAppliesTo appliesTo,
            @AuthenticationPrincipal User me
    ) {
        var rows = appliesTo == null
                ? definitions.findAllByCompanyIdOrderByAppliesToAscSortOrderAscNameAscIdAsc(me.getCompany().getId())
                : definitions.findAllByCompanyIdAndAppliesToOrderBySortOrderAscNameAscIdAsc(me.getCompany().getId(), appliesTo);
        return rows.stream().map(this::toResponse).toList();
    }

    @PostMapping
    @Transactional
    public CustomFieldDefinitionResponse create(@RequestBody CustomFieldDefinitionRequest req, @AuthenticationPrincipal User me) {
        var row = new CustomFieldDefinition();
        row.setCompany(me.getCompany());
        apply(row, req, true);
        return toResponse(definitions.save(row));
    }

    @PutMapping("/{id}")
    @Transactional
    public CustomFieldDefinitionResponse update(
            @PathVariable Long id,
            @RequestBody CustomFieldDefinitionRequest req,
            @AuthenticationPrincipal User me
    ) {
        var row = definitions.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        apply(row, req, false);
        return toResponse(definitions.save(row));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id, @AuthenticationPrincipal User me) {
        var row = definitions.findByIdAndCompanyId(id, me.getCompany().getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        values.deleteAllByCompanyIdAndFieldDefinitionId(me.getCompany().getId(), row.getId());
        definitions.delete(row);
    }

    private void apply(CustomFieldDefinition row, CustomFieldDefinitionRequest req, boolean creating) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Custom field data is required.");
        }
        if (req.name() == null || req.name().trim().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Field name is required.");
        }
        row.setName(req.name().trim());
        if (creating) {
            if (req.appliesTo() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Applies to is required.");
            }
            row.setAppliesTo(req.appliesTo());
        }
        row.setFieldType(req.fieldType() == null ? CustomFieldType.TEXT : req.fieldType());
        row.setRequired(Boolean.TRUE.equals(req.required()));
        row.setShowInList(Boolean.TRUE.equals(req.showInList()));
        row.setSortOrder(req.sortOrder() == null ? 0 : req.sortOrder());
        row.setActive(req.active() == null || Boolean.TRUE.equals(req.active()));
        row.setOptionsJson(customFieldService.serializeOptions(req.options()));
    }

    private CustomFieldDefinitionResponse toResponse(CustomFieldDefinition row) {
        return new CustomFieldDefinitionResponse(
                row.getId(),
                row.getName(),
                row.getAppliesTo(),
                row.getFieldType(),
                row.isRequired(),
                row.isShowInList(),
                row.getSortOrder(),
                row.isActive(),
                customFieldService.parseOptions(row.getOptionsJson()),
                row.getCreatedAt(),
                row.getUpdatedAt()
        );
    }
}
