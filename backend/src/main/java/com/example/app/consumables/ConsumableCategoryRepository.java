package com.example.app.consumables;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ConsumableCategoryRepository extends JpaRepository<ConsumableCategory, Long> {
    List<ConsumableCategory> findByCompanyIdOrderByNameAsc(Long companyId);
    Optional<ConsumableCategory> findByIdAndCompanyId(Long id, Long companyId);
}
