package com.example.app.session;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PersonalCalendarBlockRepository extends JpaRepository<PersonalCalendarBlock, Long> {
    /**
     * Lightweight public-widget projection. One query returns ordinary overlapping personal
     * blocks plus every availability marker whose recurrence metadata may affect the requested
     * range. This avoids loading full entities and lazy owner associations for every slot check.
     */
    interface WidgetAvailabilityPersonalBlock {
        Long getId();
        Long getOwnerId();
        LocalDateTime getStartTime();
        LocalDateTime getEndTime();
        String getTask();
        String getNotes();
    }

    /**
     * Ordinary personal sessions that overlap the requested range. Availability markers are
     * deliberately excluded and loaded by a separate index-friendly query below. Splitting the
     * former OR query prevents PostgreSQL from scanning every personal block whenever a month is
     * opened in the public widget.
     */
    @Query(value = """
            select p.id as "id",
                   p.owner_id as "ownerId",
                   p.start_time as "startTime",
                   p.end_time as "endTime",
                   p.task as "task",
                   p.notes as "notes"
            from personal_calendar_block p
            where p.company_id = :companyId
              and (:ownerId is null or p.owner_id = :ownerId)
              and lower(p.task) <> '__availability_block__'
              and p.start_time < :rangeEnd
              and p.end_time > :rangeStart
            order by p.start_time asc, p.id asc
            """, nativeQuery = true)
    List<WidgetAvailabilityPersonalBlock> findWidgetOverlappingRegularBlocks(
            @Param("companyId") Long companyId,
            @Param("ownerId") Long ownerId,
            @Param("rangeStart") LocalDateTime rangeStart,
            @Param("rangeEnd") LocalDateTime rangeEnd);

    /**
     * Availability markers may be recurring or indefinite, so they cannot be filtered only by
     * their stored anchor timestamp. The partial marker index keeps this lookup small, and the
     * widget service expands each marker once into concrete occurrences for the requested range.
     */
    @Query(value = """
            select p.id as "id",
                   p.owner_id as "ownerId",
                   p.start_time as "startTime",
                   p.end_time as "endTime",
                   p.task as "task",
                   p.notes as "notes"
            from personal_calendar_block p
            where p.company_id = :companyId
              and (:ownerId is null or p.owner_id = :ownerId)
              and lower(p.task) = '__availability_block__'
            order by p.start_time asc, p.id asc
            """, nativeQuery = true)
    List<WidgetAvailabilityPersonalBlock> findWidgetAvailabilityMarkers(
            @Param("companyId") Long companyId,
            @Param("ownerId") Long ownerId);

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

    /**
     * Same overlap check for staff calendar mutations, but excludes the hidden
     * __availability_block__ marker. Staff may intentionally place or move a
     * booking over blocked availability after confirming the override; ordinary
     * personal sessions must still conflict unless explicitly allowed.
     */
    @Query("SELECT CASE WHEN COUNT(p) > 0 THEN true ELSE false END FROM PersonalCalendarBlock p " +
           "WHERE p.owner.id = :ownerId AND p.company.id = :companyId " +
           "AND (p.task IS NULL OR LOWER(p.task) <> '__availability_block__') " +
           "AND p.startTime < :end AND p.endTime > :start")
    boolean existsOverlappingRegularPersonalSessionForOwner(@Param("ownerId") Long ownerId, @Param("companyId") Long companyId,
                                                            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    @Query("SELECT p FROM PersonalCalendarBlock p WHERE p.owner.id = :ownerId AND p.company.id = :companyId " +
           "AND LOWER(p.task) = '__availability_block__'")
    List<PersonalCalendarBlock> findAvailabilityBlockMarkersForOwner(@Param("ownerId") Long ownerId, @Param("companyId") Long companyId);

    @Query("SELECT p FROM PersonalCalendarBlock p WHERE p.company.id = :companyId " +
           "AND LOWER(p.task) = '__availability_block__'")
    List<PersonalCalendarBlock> findAvailabilityBlockMarkersByCompany(@Param("companyId") Long companyId);

}
