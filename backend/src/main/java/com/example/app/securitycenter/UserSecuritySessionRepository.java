package com.example.app.securitycenter;

import com.example.app.user.User;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserSecuritySessionRepository extends JpaRepository<UserSecuritySession, Long> {
    Optional<UserSecuritySession> findBySessionKey(String sessionKey);
    List<UserSecuritySession> findAllByUserAndRevokedAtIsNullOrderByLastSeenAtDesc(User user);
    List<UserSecuritySession> findAllByUserOrderByLastSeenAtDesc(User user);
}
