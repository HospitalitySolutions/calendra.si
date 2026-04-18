package com.example.app.securitycenter;

import com.example.app.user.User;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SecurityActivityEventRepository extends JpaRepository<SecurityActivityEvent, Long> {
    List<SecurityActivityEvent> findTop20ByUserOrderByOccurredAtDesc(User user);
}
