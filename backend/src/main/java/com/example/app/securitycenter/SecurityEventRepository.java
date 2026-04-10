package com.example.app.securitycenter;

import com.example.app.user.User;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SecurityEventRepository extends JpaRepository<SecurityEvent, Long> {
    List<SecurityEvent> findByUserOrderByCreatedAtDesc(User user, Pageable pageable);
}
