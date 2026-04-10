package com.example.app.mfa;

import com.example.app.user.User;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WebAuthnCredentialRepository extends JpaRepository<WebAuthnCredential, Long> {
    List<WebAuthnCredential> findAllByUserOrderByCreatedAtAsc(User user);
    long countByUser(User user);
    boolean existsByUser(User user);
    Optional<WebAuthnCredential> findByCredentialId(String credentialId);
    Optional<WebAuthnCredential> findByCredentialIdAndUser(String credentialId, User user);
    void deleteByCredentialIdAndUser(String credentialId, User user);
    List<WebAuthnCredential> findAllByCredentialId(String credentialId);
}
