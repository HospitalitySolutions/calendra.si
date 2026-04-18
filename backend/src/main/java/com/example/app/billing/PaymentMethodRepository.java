package com.example.app.billing;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentMethodRepository extends JpaRepository<PaymentMethod, Long> {
    List<PaymentMethod> findAllByCompanyIdOrderByNameAsc(Long companyId);
    Optional<PaymentMethod> findByIdAndCompanyId(Long id, Long companyId);
}

