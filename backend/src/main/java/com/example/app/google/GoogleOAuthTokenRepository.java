package com.example.app.google;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GoogleOAuthTokenRepository extends JpaRepository<GoogleOAuthToken, Long> {
    Optional<GoogleOAuthToken> findByUser_Id(Long userId);
}
