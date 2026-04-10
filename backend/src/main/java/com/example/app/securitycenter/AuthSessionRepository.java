package com.example.app.securitycenter;

import com.example.app.user.User;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthSessionRepository extends JpaRepository<AuthSession, Long> {
    Optional<AuthSession> findBySessionTokenId(String sessionTokenId);
    List<AuthSession> findAllByUserOrderByLastSeenAtDesc(User user);
    List<AuthSession> findAllByUserAndRevokedAtIsNullOrderByLastAuthenticatedAtDesc(User user);
    List<AuthSession> findAllByUserAndSessionTokenIdNotAndRevokedAtIsNull(User user, String sessionTokenId);
}
