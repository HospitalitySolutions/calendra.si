package com.example.app.zoom;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ZoomOAuthTokenRepository extends JpaRepository<ZoomOAuthToken, Long> {
    Optional<ZoomOAuthToken> findByUser_Id(Long userId);
}
