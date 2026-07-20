package com.example.app.waitlist;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WaitlistBookingHoldRepository extends JpaRepository<WaitlistBookingHold, Long> {
    Optional<WaitlistBookingHold> findByOfferId(Long offerId);

    @Query("""
            select h from WaitlistBookingHold h
            join fetch h.offer o
            join fetch o.request r
            left join fetch r.client
            left join fetch r.service
            left join fetch h.employee
            left join fetch h.room
            where h.company.id = :companyId
              and r.id = :requestId
              and h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE
              and h.expiresAt > :now
            """)
    Optional<WaitlistBookingHold> findActiveByRequestIdAndCompanyId(
            @Param("requestId") Long requestId,
            @Param("companyId") Long companyId,
            @Param("now") Instant now);

    /**
     * Used while creating another waitlist offer. A hold conflicts when either the
     * same employee or the same room is already reserved. When neither resource is
     * assigned, only another unassigned hold conflicts.
     */
    @Query("""
            select count(h) > 0 from WaitlistBookingHold h
            where h.company.id = :companyId
              and h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE
              and h.expiresAt > :now
              and h.slotStart < :end
              and h.slotEnd > :start
              and (
                    (:employeeId is not null and h.employee.id = :employeeId)
                 or (:roomId is not null and h.room.id = :roomId)
                 or (:employeeId is null and :roomId is null and h.employee is null and h.room is null)
              )
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

    @Query("""
            select count(h) > 0 from WaitlistBookingHold h
            where h.company.id = :companyId
              and h.employee.id = :employeeId
              and h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE
              and h.expiresAt > :now
              and h.slotStart < :end
              and h.slotEnd > :start
              and (:excludeOfferId is null or h.offer.id <> :excludeOfferId)
            """)
    boolean existsActiveEmployeeOverlap(
            @Param("companyId") Long companyId,
            @Param("employeeId") Long employeeId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("now") Instant now,
            @Param("excludeOfferId") Long excludeOfferId);

    @Query("""
            select count(h) > 0 from WaitlistBookingHold h
            where h.company.id = :companyId
              and h.room.id = :roomId
              and h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE
              and h.expiresAt > :now
              and h.slotStart < :end
              and h.slotEnd > :start
              and (:excludeOfferId is null or h.offer.id <> :excludeOfferId)
            """)
    boolean existsActiveRoomOverlap(
            @Param("companyId") Long companyId,
            @Param("roomId") Long roomId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("now") Instant now,
            @Param("excludeOfferId") Long excludeOfferId);

    @Query("""
            select count(h) > 0 from WaitlistBookingHold h
            where h.company.id = :companyId
              and h.room is not null
              and h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE
              and h.expiresAt > :now
              and h.slotStart < :end
              and h.slotEnd > :start
              and (:excludeOfferId is null or h.offer.id <> :excludeOfferId)
            """)
    boolean existsActiveAnyRoomOverlap(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("now") Instant now,
            @Param("excludeOfferId") Long excludeOfferId);

    @Query("""
            select count(h) > 0 from WaitlistBookingHold h
            where h.company.id = :companyId
              and h.employee is null
              and h.room is null
              and h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE
              and h.expiresAt > :now
              and h.slotStart < :end
              and h.slotEnd > :start
              and (:excludeOfferId is null or h.offer.id <> :excludeOfferId)
            """)
    boolean existsActiveUnassignedOverlap(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("now") Instant now,
            @Param("excludeOfferId") Long excludeOfferId);


    @Query("""
            select distinct h from WaitlistBookingHold h
            join fetch h.offer o
            join fetch o.request r
            left join fetch r.client
            left join fetch r.service
            left join fetch h.employee
            left join fetch h.room
            where h.company.id = :companyId
              and h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE
              and h.expiresAt > :now
              and h.slotStart < :rangeEnd
              and h.slotEnd > :rangeStart
            order by h.slotStart asc, h.id asc
            """)
    List<WaitlistBookingHold> findActiveOverlappingByCompany(
            @Param("companyId") Long companyId,
            @Param("rangeStart") LocalDateTime rangeStart,
            @Param("rangeEnd") LocalDateTime rangeEnd,
            @Param("now") Instant now);

    @Query("""
            select distinct h from WaitlistBookingHold h
            join fetch h.offer o
            join fetch o.request r
            left join fetch r.client
            left join fetch r.service
            left join fetch h.employee
            left join fetch h.room
            where h.company.id = :companyId
              and h.employee.id = :employeeId
              and h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE
              and h.expiresAt > :now
              and h.slotStart < :rangeEnd
              and h.slotEnd > :rangeStart
            order by h.slotStart asc, h.id asc
            """)
    List<WaitlistBookingHold> findActiveOverlappingByEmployee(
            @Param("companyId") Long companyId,
            @Param("employeeId") Long employeeId,
            @Param("rangeStart") LocalDateTime rangeStart,
            @Param("rangeEnd") LocalDateTime rangeEnd,
            @Param("now") Instant now);

    @Query("select h from WaitlistBookingHold h where h.status = com.example.app.waitlist.WaitlistHoldStatus.ACTIVE and h.expiresAt <= :now")
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<WaitlistBookingHold> findExpiredActive(@Param("now") Instant now, Pageable pageable);
}
