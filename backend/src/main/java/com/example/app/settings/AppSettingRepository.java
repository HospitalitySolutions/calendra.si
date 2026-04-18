package com.example.app.settings;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import com.example.app.settings.SettingKey;

public interface AppSettingRepository extends JpaRepository<AppSetting, Long> {
    Optional<AppSetting> findByKey(String key);
    List<AppSetting> findAllByKey(String key);

    List<AppSetting> findAllByCompanyId(Long companyId);
    Optional<AppSetting> findByCompanyIdAndKey(Long companyId, String key);

    default Optional<AppSetting> findByKey(SettingKey key) {
        return findByKey(key.name());
    }

    default List<AppSetting> findAllByKey(SettingKey key) {
        return findAllByKey(key.name());
    }

    default Optional<AppSetting> findByCompanyIdAndKey(Long companyId, SettingKey key) {
        return findByCompanyIdAndKey(companyId, key.name());
    }
}
