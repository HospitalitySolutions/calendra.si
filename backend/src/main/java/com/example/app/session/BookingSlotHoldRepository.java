package com.example.app.session;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BookingSlotHoldRepository extends JpaRepository<BookingSlotHold, Long> {
    /** Lightweight active hold projection for public-widget availability checks. */
    interface WidgetAvailabilityHold {
        Long getConsultantId();
        LocalDateTime getSlotStart();
        LocalDateTime getBusyEnd();
    }

    @Query(value = """
            select h.consultant_id as "consultantId",
                   h.slot_start as "slotStart",
                   h.busy_end as "busyEnd"
            from booking_slot_holds h
            where h.company_id = :companyId
              and h.consultant_id is not null
              and h.expires_at > :now
              and h.slot_start < :rangeEnd
              and h.busy_end > :rangeStart
              and (:consultantId is null or h.consultant_id = :consultantId)
            order by h.slot_start asc, h.id asc
            """, nativeQuery = true)
    List<WidgetAvailabilityHold> findWidgetAvailabilityHolds(
            @Param("companyId") Long companyId,
            @Param("consultantId") Long consultantId,
            @Param("rangeStart") LocalDateTime rangeStart,
            @Param("rangeEnd") LocalDateTime rangeEnd,
            @Param("now") Instant now);

    Optional<BookingSlotHold> findByHoldToken(String holdToken);

    @Query("select case when count(h) > 0 then true else false end from BookingSlotHold h " +
            "where h.company.id = :companyId and h.consultant.id = :consultantId and h.expiresAt > :now " +
            "and h.holdToken <> :excludedToken and h.slotStart < :end and h.busyEnd > :start")
    boolean existsActiveConsultantOverlap(@Param("companyId") Long companyId,
                                          @Param("consultantId") Long consultantId,
                                          @Param("start") LocalDateTime start,
                                          @Param("end") LocalDateTime end,
                                          @Param("now") Instant now,
                                          @Param("excludedToken") String excludedToken);

    @Query("select case when count(h) > 0 then true else false end from BookingSlotHold h " +
            "where h.company.id = :companyId and h.consultant is null and h.groupSessionId is null and h.expiresAt > :now " +
            "and h.holdToken <> :excludedToken and h.slotStart < :end and h.busyEnd > :start")
    boolean existsActiveUnassignedOverlap(@Param("companyId") Long companyId,
                                          @Param("start") LocalDateTime start,
                                          @Param("end") LocalDateTime end,
                                          @Param("now") Instant now,
                                          @Param("excludedToken") String excludedToken);

    @Query("select case when count(h) > 0 then true else false end from BookingSlotHold h " +
            "where h.company.id = :companyId and h.groupSessionId = :groupSessionId and h.expiresAt > :now " +
            "and h.holdToken <> :excludedToken")
    boolean existsActiveGroupSessionHold(@Param("companyId") Long companyId,
                                         @Param("groupSessionId") Long groupSessionId,
                                         @Param("now") Instant now,
                                         @Param("excludedToken") String excludedToken);

    @Modifying
    @Query("delete from BookingSlotHold h where h.expiresAt <= :now")
    int deleteExpired(@Param("now") Instant now);
}
