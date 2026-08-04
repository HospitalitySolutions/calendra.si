package com.example.app.session;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SpaceRepository extends JpaRepository<Space, Long> {
    @EntityGraph(attributePaths = {"location"})
    List<Space> findAllByCompanyId(Long companyId);

    long countByCompanyId(Long companyId);
    long countByLocationId(Long locationId);

    @EntityGraph(attributePaths = {"location"})
    Optional<Space> findByIdAndCompanyId(Long id, Long companyId);
}
