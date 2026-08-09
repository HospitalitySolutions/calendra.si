package com.example.app.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface BookableSlotRepository extends JpaRepository<BookableSlot, Long> {
    List<BookableSlot> findByConsultantId(Long consultantId);

    List<BookableSlot> findAllByCompanyId(Long companyId);
    List<BookableSlot> findAllByCompanyIdAndLocationId(Long companyId, Long locationId);

    @Query("""
        select distinct s from BookableSlot s
        join fetch s.consultant c
        join fetch s.location l
        left join fetch c.types
        where s.company.id = :companyId
          and l.id = :locationId
          and c.active = true
          and c.consultant = true
        """)
    List<BookableSlot> findAllForWidgetByCompanyIdAndLocationId(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId);

    /** Compatibility query for internal callers that have not selected a branch yet. */
    @Query("""
        select distinct s from BookableSlot s
        join fetch s.consultant c
        join fetch s.location l
        left join fetch c.types
        where s.company.id = :companyId
          and c.active = true
          and c.consultant = true
        """)
    List<BookableSlot> findAllForWidgetByCompanyId(@Param("companyId") Long companyId);

    @Query("""
        select distinct s from BookableSlot s
        join fetch s.consultant c
        join fetch s.location l
        left join fetch c.types
        where s.company.id = :companyId
          and l.id = :locationId
          and s.dayOfWeek = :dayOfWeek
          and c.active = true
          and c.consultant = true
          and (:consultantId is null or c.id = :consultantId)
          and (s.indefinite = true
               or ((s.startDate is null or s.startDate <= :date)
                   and (s.endDate is null or s.endDate >= :date)))
        """)
    List<BookableSlot> findAllForWidgetByCompanyIdAndLocationIdAndDate(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId,
            @Param("dayOfWeek") DayOfWeek dayOfWeek,
            @Param("date") LocalDate date,
            @Param("consultantId") Long consultantId);

    @Query("""
        select distinct s from BookableSlot s
        join fetch s.consultant c
        join fetch s.location l
        left join fetch c.types
        where s.company.id = :companyId
          and s.dayOfWeek = :dayOfWeek
          and c.active = true
          and c.consultant = true
          and (:consultantId is null or c.id = :consultantId)
          and (s.indefinite = true
               or ((s.startDate is null or s.startDate <= :date)
                   and (s.endDate is null or s.endDate >= :date)))
        """)
    List<BookableSlot> findAllForWidgetByCompanyIdAndDate(
            @Param("companyId") Long companyId,
            @Param("dayOfWeek") DayOfWeek dayOfWeek,
            @Param("date") LocalDate date,
            @Param("consultantId") Long consultantId);

    List<BookableSlot> findByConsultantIdAndCompanyId(Long consultantId, Long companyId);
    List<BookableSlot> findByConsultantIdAndCompanyIdAndLocationId(Long consultantId, Long companyId, Long locationId);

    @Query("""
        select s from BookableSlot s
        join fetch s.consultant c
        join fetch s.location l
        where s.company.id = :companyId
          and (s.indefinite = true
               or ((s.startDate is null or s.startDate <= :toDate)
                   and (s.endDate is null or s.endDate >= :fromDate)))
        order by s.dayOfWeek asc, s.startTime asc, s.id asc
        """)
    List<BookableSlot> findVisibleByCompanyAndDateRange(
            @Param("companyId") Long companyId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate
    );

    @Query("""
        select s from BookableSlot s
        join fetch s.consultant c
        join fetch s.location l
        where s.company.id = :companyId
          and l.id = :locationId
          and (s.indefinite = true
               or ((s.startDate is null or s.startDate <= :toDate)
                   and (s.endDate is null or s.endDate >= :fromDate)))
        order by s.dayOfWeek asc, s.startTime asc, s.id asc
        """)
    List<BookableSlot> findVisibleByCompanyAndLocationAndDateRange(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate
    );

    @Query("""
        select s from BookableSlot s
        join fetch s.consultant c
        join fetch s.location l
        where s.company.id = :companyId
          and c.id = :consultantId
          and (s.indefinite = true
               or ((s.startDate is null or s.startDate <= :toDate)
                   and (s.endDate is null or s.endDate >= :fromDate)))
        order by s.dayOfWeek asc, s.startTime asc, s.id asc
        """)
    List<BookableSlot> findVisibleByConsultantAndCompanyAndDateRange(
            @Param("consultantId") Long consultantId,
            @Param("companyId") Long companyId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate
    );

    @Query("""
        select s from BookableSlot s
        join fetch s.consultant c
        join fetch s.location l
        where s.company.id = :companyId
          and l.id = :locationId
          and c.id = :consultantId
          and (s.indefinite = true
               or ((s.startDate is null or s.startDate <= :toDate)
                   and (s.endDate is null or s.endDate >= :fromDate)))
        order by s.dayOfWeek asc, s.startTime asc, s.id asc
        """)
    List<BookableSlot> findVisibleByConsultantAndCompanyAndLocationAndDateRange(
            @Param("consultantId") Long consultantId,
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate
    );

    Optional<BookableSlot> findByIdAndCompanyId(Long id, Long companyId);

    @Query("""
        select count(s) > 0 from BookableSlot s
        where s.company.id = :companyId
          and s.location.id = :locationId
          and s.consultant.id = :consultantId
          and s.dayOfWeek = :dayOfWeek
          and s.id <> coalesce(:excludeId, -1)
          and (
                (s.indefinite = true or :indefinite = true)
             or (s.startDate is null or s.startDate <= :endDate)
             and (s.endDate is null or s.endDate >= :startDate)
          )
          and s.startTime < :endTime
          and s.endTime > :startTime
    """)
    boolean existsOverlappingSlotByCompanyAndLocationId(
            @Param("companyId") Long companyId,
            @Param("locationId") Long locationId,
            @Param("consultantId") Long consultantId,
            @Param("dayOfWeek") DayOfWeek dayOfWeek,
            @Param("startTime") java.time.LocalTime startTime,
            @Param("endTime") java.time.LocalTime endTime,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("indefinite") boolean indefinite,
            @Param("excludeId") Long excludeId
    );
}
