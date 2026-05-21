package com.example.app.securitycenter;

import com.example.app.user.User;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SecurityAlertPreferenceRepository extends JpaRepository<SecurityAlertPreference, Long> {
    Optional<SecurityAlertPreference> findByUser(User user);
}
