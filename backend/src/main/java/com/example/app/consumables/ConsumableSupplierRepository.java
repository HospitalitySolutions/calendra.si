package com.example.app.consumables;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ConsumableSupplierRepository extends JpaRepository<ConsumableSupplier, Long> {
    List<ConsumableSupplier> findByCompanyIdOrderByNameAsc(Long companyId);
    Optional<ConsumableSupplier> findByIdAndCompanyId(Long id, Long companyId);
}
