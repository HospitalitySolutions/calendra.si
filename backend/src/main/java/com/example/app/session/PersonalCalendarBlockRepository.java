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

    @Query("SELECT CASE WHEN COUNT(p) > 0 THEN true ELSE false END FROM PersonalCalendarBlock p " +
           "WHERE p.owner.id = :ownerId AND p.company.id = :companyId " +
           "AND p.startTime < :end AND p.endTime > :start")
    boolean existsOverlappingForOwner(@Param("ownerId") Long ownerId, @Param("companyId") Long companyId,
                                      @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
