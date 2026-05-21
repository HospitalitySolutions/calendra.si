package com.example.app.guest.model;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestUserRepository extends JpaRepository<GuestUser, Long> {
    Optional<GuestUser> findByEmailIgnoreCase(String email);
    boolean existsByEmailIgnoreCase(String email);
    Optional<GuestUser> findByGoogleSubject(String googleSubject);
    Optional<GuestUser> findByAppleSubject(String appleSubject);
}
