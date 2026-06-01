package com.example.app.guest.auth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestPasswordResetTokenRepository extends JpaRepository<GuestPasswordResetToken, Long> {
    Optional<GuestPasswordResetToken> findByTokenAndActiveTrue(String token);
    List<GuestPasswordResetToken> findAllByGuestUser_IdAndActiveTrue(Long guestUserId);
    int deleteByExpiresAtBefore(Instant cutoff);
}
