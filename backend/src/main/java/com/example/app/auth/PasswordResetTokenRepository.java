package com.example.app.auth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    Optional<PasswordResetToken> findByTokenAndActiveTrue(String token);
    List<PasswordResetToken> findAllByUser_LoginAccount_IdAndActiveTrue(Long loginAccountId);

    int deleteByExpiresAtBefore(Instant cutoff);
}

