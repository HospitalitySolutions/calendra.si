package com.example.app.mfa;

import com.example.app.user.User;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecoveryCodeRepository extends JpaRepository<RecoveryCode, Long> {
    List<RecoveryCode> findAllByUserOrderByCreatedAtAsc(User user);
    long countByUserAndUsedAtIsNull(User user);
    RecoveryCode findTopByUserOrderByCreatedAtDesc(User user);
    void deleteAllByUser(User user);
}
