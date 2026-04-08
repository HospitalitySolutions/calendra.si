package com.example.app.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;


public interface BookableSlotRepository extends JpaRepository<BookableSlot, Long> {
    List<BookableSlot> findByConsultantId(Long consultantId);

    List<BookableSlot> findAllByCompanyId(Long companyId);

    List<BookableSlot> findByConsultantIdAndCompanyId(Long consultantId, Long companyId);

    Optional<BookableSlot> findByIdAndCompanyId(Long id, Long companyId);

    @Query("""
        select count(s) > 0 from BookableSlot s
        where s.consultant.id = :consultantId
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
    boolean existsOverlappingSlot(
            @Param("consultantId") Long consultantId,
            @Param("dayOfWeek") java.time.DayOfWeek dayOfWeek,
            @Param("startTime") java.time.LocalTime startTime,
            @Param("endTime") java.time.LocalTime endTime,
            @Param("startDate") java.time.LocalDate startDate,
            @Param("endDate") java.time.LocalDate endDate,
            @Param("indefinite") boolean indefinite,
            @Param("excludeId") Long excludeId
    );

    @Query("""
        select count(s) > 0 from BookableSlot s
        where s.company.id = :companyId
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
    boolean existsOverlappingSlotByCompanyId(
            @Param("companyId") Long companyId,
            @Param("consultantId") Long consultantId,
            @Param("dayOfWeek") java.time.DayOfWeek dayOfWeek,
            @Param("startTime") java.time.LocalTime startTime,
            @Param("endTime") java.time.LocalTime endTime,
            @Param("startDate") java.time.LocalDate startDate,
            @Param("endDate") java.time.LocalDate endDate,
            @Param("indefinite") boolean indefinite,
            @Param("excludeId") Long excludeId
    );
}
