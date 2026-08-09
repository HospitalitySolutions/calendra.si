package com.example.app.settings;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocationSettingOverrideRepository extends JpaRepository<LocationSettingOverride, Long> {
    Optional<LocationSettingOverride> findByCompanyIdAndLocationIdAndSettingKey(Long companyId, Long locationId, String settingKey);
    List<LocationSettingOverride> findAllByCompanyIdAndLocationId(Long companyId, Long locationId);
    void deleteByCompanyIdAndLocationIdAndSettingKey(Long companyId, Long locationId, String settingKey);
}
