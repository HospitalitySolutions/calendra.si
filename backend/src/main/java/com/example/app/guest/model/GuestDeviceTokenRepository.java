package com.example.app.guest.model;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestDeviceTokenRepository extends JpaRepository<GuestDeviceToken, Long> {
    Optional<GuestDeviceToken> findByPushToken(String pushToken);
}
