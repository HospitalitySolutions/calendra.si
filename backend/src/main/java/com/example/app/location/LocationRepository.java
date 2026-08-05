package com.example.app.location;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LocationRepository extends JpaRepository<Location, Long> {
    List<Location> findAllByCompanyIdOrderByDefaultLocationDescNameAscIdAsc(Long companyId);
    List<Location> findAllByCompanyIdAndActiveTrueOrderByDefaultLocationDescNameAscIdAsc(Long companyId);
    List<Location> findAllByCompanyIdInAndActiveTrueOrderByCompanyIdAscDefaultLocationDescNameAscIdAsc(Collection<Long> companyIds);
    Optional<Location> findByIdAndCompanyId(Long id, Long companyId);
    List<Location> findAllByCompanyIdAndIdIn(Long companyId, Collection<Long> ids);
    Optional<Location> findFirstByCompanyIdAndDefaultLocationTrue(Long companyId);
    boolean existsByCompanyIdAndNameIgnoreCase(Long companyId, String name);
    long countByCompanyId(Long companyId);
    long countByDefaultLegalEntityId(Long legalEntityId);
    long countByCompanyIdAndDefaultLegalEntityId(Long companyId, Long legalEntityId);
}
