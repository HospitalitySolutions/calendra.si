package com.example.app.customfield;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomFieldDefinitionRepository extends JpaRepository<CustomFieldDefinition, Long> {
    List<CustomFieldDefinition> findAllByCompanyIdOrderByAppliesToAscSortOrderAscNameAscIdAsc(Long companyId);
    List<CustomFieldDefinition> findAllByCompanyIdAndAppliesToOrderBySortOrderAscNameAscIdAsc(Long companyId, CustomFieldAppliesTo appliesTo);
    List<CustomFieldDefinition> findAllByCompanyIdAndAppliesToAndActiveTrueOrderBySortOrderAscNameAscIdAsc(Long companyId, CustomFieldAppliesTo appliesTo);
    Optional<CustomFieldDefinition> findByIdAndCompanyId(Long id, Long companyId);
}
