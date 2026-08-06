package com.example.app.session;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SpaceRepository extends JpaRepository<Space, Long> {
    interface SpaceSummary {
        Long getId();
        String getName();
        String getDescription();
        Instant getCreatedAt();
        Instant getUpdatedAt();
        Long getLocationId();
        String getLocationName();
        String getLocationTimezone();
        Boolean getLocationActive();
    }

    @Query("""
            select s.id as id,
                   s.name as name,
                   s.description as description,
                   s.createdAt as createdAt,
                   s.updatedAt as updatedAt,
                   l.id as locationId,
                   l.name as locationName,
                   l.timezone as locationTimezone,
                   l.active as locationActive
              from Space s
              left join s.location l
             where s.company.id = :companyId
             order by s.id
            """)
    List<SpaceSummary> findSummariesByCompanyId(@Param("companyId") Long companyId);

    @EntityGraph(attributePaths = {"location"})
    List<Space> findAllByCompanyId(Long companyId);

    long countByCompanyId(Long companyId);
    long countByLocationId(Long locationId);

    @EntityGraph(attributePaths = {"location"})
    Optional<Space> findByIdAndCompanyId(Long id, Long companyId);
}
