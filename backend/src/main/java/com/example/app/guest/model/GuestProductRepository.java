package com.example.app.guest.model;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestProductRepository extends JpaRepository<GuestProduct, Long> {
    List<GuestProduct> findAllByCompanyIdAndActiveTrueAndGuestVisibleTrueOrderBySortOrderAscIdAsc(Long companyId);
    Optional<GuestProduct> findByIdAndCompanyId(Long id, Long companyId);
}
