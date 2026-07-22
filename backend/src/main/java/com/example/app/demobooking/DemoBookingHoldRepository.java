package com.example.app.demobooking;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DemoBookingHoldRepository extends JpaRepository<DemoBookingHold, Long> {
    Optional<DemoBookingHold> findByHoldToken(String holdToken);

    @Query("select case when count(h) > 0 then true else false end from DemoBookingHold h " +
            "where h.profile.id = :profileId and h.expiresAt > :now and h.holdToken <> :excludedToken and h.startAt < :endAt and h.endAt > :startAt")
    boolean existsActiveOverlap(@Param("profileId") Long profileId,
                                @Param("now") Instant now,
                                @Param("excludedToken") String excludedToken,
                                @Param("startAt") Instant startAt,
                                @Param("endAt") Instant endAt);

    @Modifying
    @Query("delete from DemoBookingHold h where h.expiresAt <= :now")
    int deleteExpired(@Param("now") Instant now);
}
