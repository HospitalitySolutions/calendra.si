package com.example.app.settings;

import org.springframework.data.jpa.repository.JpaRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import com.example.app.settings.SettingKey;

public interface AppSettingRepository extends JpaRepository<AppSetting, Long> {
    Optional<AppSetting> findByKey(String key);
    List<AppSetting> findAllByKey(String key);

    List<AppSetting> findAllByCompanyId(Long companyId);

    @Query("select s from AppSetting s where s.company.id in :companyIds and s.key in :keys")
    List<AppSetting> findAllByCompanyIdsAndKeys(
            @Param("companyIds") java.util.Collection<Long> companyIds,
            @Param("keys") java.util.Collection<String> keys
    );

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

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from AppSetting s where s.company.id = :companyId and s.key = :key")
    Optional<AppSetting> findForUpdateByCompanyIdAndKey(@Param("companyId") Long companyId, @Param("key") String key);

    default Optional<AppSetting> findForUpdateByCompanyIdAndKey(Long companyId, SettingKey key) {
        return findForUpdateByCompanyIdAndKey(companyId, key.name());
    }

    @Query("select s.company.id from AppSetting s where s.key = :key and lower(s.value) like lower(concat('%', :needle, '%'))")
    List<Long> findCompanyIdsByKeyAndValueContainingIgnoreCase(@Param("key") String key, @Param("needle") String needle);
}
