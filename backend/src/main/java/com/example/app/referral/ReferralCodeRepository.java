package com.example.app.referral;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReferralCodeRepository extends JpaRepository<ReferralCode, Long> {
    Optional<ReferralCode> findByUserId(Long userId);

    Optional<ReferralCode> findByCodeIgnoreCase(String code);

    boolean existsByCodeIgnoreCase(String code);
}
