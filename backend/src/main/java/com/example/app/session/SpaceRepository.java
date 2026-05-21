package com.example.app.session;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface SpaceRepository extends JpaRepository<Space, Long> {
    List<Space> findAllByCompanyId(Long companyId);

    long countByCompanyId(Long companyId);
    Optional<Space> findByIdAndCompanyId(Long id, Long companyId);
}

