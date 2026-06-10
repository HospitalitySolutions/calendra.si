package com.example.app.session;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PersonalCalendarBlockRepository extends JpaRepository<PersonalCalendarBlock, Long> {
    @Query("SELECT p FROM PersonalCalendarBlock p WHERE p.owner.id = :ownerId AND p.company.id = :companyId " +
           "AND p.startTime < :rangeEnd AND p.endTime > :rangeStart")
    List<PersonalCalendarBlock> findOverlapping(@Param("ownerId") Long ownerId, @Param("companyId") Long companyId,
                                                 @Param("rangeStart") LocalDateTime rangeStart, @Param("rangeEnd") LocalDateTime rangeEnd);

    @Query("SELECT p FROM PersonalCalendarBlock p WHERE p.company.id = :companyId " +
           "AND p.startTime < :rangeEnd AND p.endTime > :rangeStart")
    List<PersonalCalendarBlock> findOverlappingByCompany(@Param("companyId") Long companyId,
                                                          @Param("rangeStart") LocalDateTime rangeStart, @Param("rangeEnd") LocalDateTime rangeEnd);

    @Query("SELECT p FROM PersonalCalendarBlock p WHERE p.owner.id = :ownerId AND p.company.id = :companyId " +
           "AND p.startTime >= :rangeStart AND p.startTime < :rangeEnd ORDER BY p.startTime")
    List<PersonalCalendarBlock> findByOwnerAndDateRange(@Param("ownerId") Long ownerId, @Param("companyId") Long companyId,
                                                        @Param("rangeStart") LocalDateTime rangeStart, @Param("rangeEnd") LocalDateTime rangeEnd);

    @Query("SELECT p FROM PersonalCalendarBlock p WHERE p.company.id = :companyId " +
           "AND p.startTime >= :rangeStart AND p.startTime < :rangeEnd ORDER BY p.startTime")
    List<PersonalCalendarBlock> findByCompanyAndDateRange(@Param("companyId") Long companyId,
                                                          @Param("rangeStart") LocalDateTime rangeStart, @Param("rangeEnd") LocalDateTime rangeEnd);

    /**
     * Returns true for any calendar block that makes the owner unavailable, including the
     * special __availability_block__ marker created from Calendar -> Availability -> Block.
     *
     * That marker is intentionally hidden from the normal personal-session display, but it
     * must still participate in booking conflict checks so guest mobile and the public
     * website widget do not expose times that were explicitly blocked in the calendar.
     */
    @Query("SELECT CASE WHEN COUNT(p) > 0 THEN true ELSE false END FROM PersonalCalendarBlock p " +
           "WHERE p.owner.id = :ownerId AND p.company.id = :companyId " +
           "AND p.startTime < :end AND p.endTime > :start")
    boolean existsOverlappingPersonalSessionForOwner(@Param("ownerId") Long ownerId, @Param("companyId") Long companyId,
                                                     @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
