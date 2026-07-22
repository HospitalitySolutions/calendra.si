package com.example.app.demobooking;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DemoBookingProfileRepository extends JpaRepository<DemoBookingProfile, Long> {
    Optional<DemoBookingProfile> findFirstBySlug(String slug);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from DemoBookingProfile p where p.slug = :slug")
    Optional<DemoBookingProfile> findBySlugForUpdate(@Param("slug") String slug);
}
