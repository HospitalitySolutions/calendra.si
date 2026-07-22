package com.example.app.demobooking;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DemoBookingRepository extends JpaRepository<DemoBooking, Long> {
    Optional<DemoBooking> findByManageToken(String manageToken);

    @Query("select case when count(b) > 0 then true else false end from DemoBooking b " +
            "where b.profile.id = :profileId and b.status in :statuses and b.startAt < :endAt and b.endAt > :startAt")
    boolean existsOverlapping(@Param("profileId") Long profileId,
                              @Param("statuses") Collection<String> statuses,
                              @Param("startAt") Instant startAt,
                              @Param("endAt") Instant endAt);

    @Query("select case when count(b) > 0 then true else false end from DemoBooking b " +
            "where b.profile.id = :profileId and b.id <> :excludedId and b.status in :statuses and b.startAt < :endAt and b.endAt > :startAt")
    boolean existsOverlappingExcluding(@Param("profileId") Long profileId,
                                       @Param("excludedId") Long excludedId,
                                       @Param("statuses") Collection<String> statuses,
                                       @Param("startAt") Instant startAt,
                                       @Param("endAt") Instant endAt);

    @Query("select count(b) from DemoBooking b where b.profile.id = :profileId and b.id <> :excludedId and b.status in :statuses and b.startAt >= :dayStart and b.startAt < :dayEnd")
    long countForDayExcluding(@Param("profileId") Long profileId,
                              @Param("excludedId") Long excludedId,
                              @Param("statuses") Collection<String> statuses,
                              @Param("dayStart") Instant dayStart,
                              @Param("dayEnd") Instant dayEnd);

    @Query("select b from DemoBooking b join fetch b.hostUser join fetch b.profile where b.startAt >= :from and b.startAt < :to order by b.startAt asc")
    List<DemoBooking> findAdminRange(@Param("from") Instant from, @Param("to") Instant to);

    @Query("select b from DemoBooking b join fetch b.hostUser join fetch b.profile where b.status = 'CONFIRMED' and b.startAt >= :from and b.startAt < :to order by b.startAt asc")
    List<DemoBooking> findConfirmedReminderRange(@Param("from") Instant from, @Param("to") Instant to);
}
