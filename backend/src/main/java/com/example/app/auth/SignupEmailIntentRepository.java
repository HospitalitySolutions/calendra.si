package com.example.app.auth;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SignupEmailIntentRepository extends JpaRepository<SignupEmailIntent, Long> {
    Optional<SignupEmailIntent> findByTokenAndActiveTrue(String token);
    Optional<SignupEmailIntent> findByToken(String token);

    List<SignupEmailIntent> findAllByEmailIgnoreCaseAndActiveTrue(String email);

    List<SignupEmailIntent> findAllByEmailIgnoreCaseAndActiveTrueAndExpiresAtAfter(String email, Instant after);

    List<SignupEmailIntent> findAllByEmailIgnoreCaseOrderByCreatedAtDesc(String email);
}
