package com.example.app.customfield;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomFieldValueRepository extends JpaRepository<CustomFieldValue, Long> {
    List<CustomFieldValue> findAllByCompanyIdAndEntityTypeAndEntityIdIn(Long companyId, CustomFieldAppliesTo entityType, Collection<Long> entityIds);
    List<CustomFieldValue> findAllByCompanyIdAndFieldDefinitionId(Long companyId, Long fieldDefinitionId);
    Optional<CustomFieldValue> findByCompanyIdAndFieldDefinitionIdAndEntityId(Long companyId, Long fieldDefinitionId, Long entityId);
    void deleteAllByCompanyIdAndFieldDefinitionId(Long companyId, Long fieldDefinitionId);
    void deleteAllByCompanyIdAndEntityTypeAndEntityId(Long companyId, CustomFieldAppliesTo entityType, Long entityId);
}
