package com.example.app.settings;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    @Query("select s.company.id from AppSetting s where s.key = :key and lower(s.value) like lower(concat('%', :needle, '%'))")
    List<Long> findCompanyIdsByKeyAndValueContainingIgnoreCase(@Param("key") String key, @Param("needle") String needle);
}
