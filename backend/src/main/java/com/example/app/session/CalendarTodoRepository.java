package com.example.app.session;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CalendarTodoRepository extends JpaRepository<CalendarTodo, Long> {
    @Query("SELECT t FROM CalendarTodo t WHERE t.owner.id = :ownerId AND t.company.id = :companyId " +
            "AND t.startTime >= :rangeStart AND t.startTime < :rangeEnd ORDER BY t.startTime")
    List<CalendarTodo> findByOwnerAndDateRange(
            @Param("ownerId") Long ownerId,
            @Param("companyId") Long companyId,
            @Param("rangeStart") LocalDateTime rangeStart,
            @Param("rangeEnd") LocalDateTime rangeEnd);

    @Query("SELECT t FROM CalendarTodo t WHERE t.company.id = :companyId " +
            "AND t.startTime >= :rangeStart AND t.startTime < :rangeEnd ORDER BY t.startTime")
    List<CalendarTodo> findByCompanyAndDateRange(
            @Param("companyId") Long companyId,
            @Param("rangeStart") LocalDateTime rangeStart,
            @Param("rangeEnd") LocalDateTime rangeEnd);

    @Query("SELECT t FROM CalendarTodo t WHERE t.owner.id = :ownerId AND t.company.id = :companyId " +
            "AND t.startTime < :now ORDER BY t.startTime")
    List<CalendarTodo> findOverdueByOwner(
            @Param("ownerId") Long ownerId,
            @Param("companyId") Long companyId,
            @Param("now") LocalDateTime now);
}
