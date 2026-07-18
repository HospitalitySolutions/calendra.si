package com.example.app.waitlist;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WaitlistBookingHoldRepository extends JpaRepository<WaitlistBookingHold, Long> {
    Optional<WaitlistBookingHold> findByOfferId(Long offerId);

    @Query("""
            select count(h) > 0 from WaitlistBookingHold h
            where h.company.id = :companyId
              and h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE
              and h.expiresAt > :now
              and h.slotStart < :end
              and h.slotEnd > :start
              and (:employeeId is null or h.employee.id = :employeeId)
              and (:roomId is null or h.room.id = :roomId)
              and (:excludeOfferId is null or h.offer.id <> :excludeOfferId)
            """)
    boolean existsActiveOverlap(
            @Param("companyId") Long companyId,
            @Param("employeeId") Long employeeId,
            @Param("roomId") Long roomId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("now") Instant now,
            @Param("excludeOfferId") Long excludeOfferId);

    @Query("select h from WaitlistBookingHold h where h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE and h.expiresAt <= :now")
    List<WaitlistBookingHold> findExpiredActive(@Param("now") Instant now);
}
