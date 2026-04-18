package com.example.app.guest.model;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantInviteRepository extends JpaRepository<TenantInvite, Long> {
    Optional<TenantInvite> findByCodeIgnoreCase(String code);
}
