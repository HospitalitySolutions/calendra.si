package com.example.app.session;

import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SessionServiceRepository extends JpaRepository<SessionService, Long> {
    List<SessionService> findBySessionBookingIdOrderByPositionAscIdAsc(Long sessionBookingId);

    @Query(value = """
            select count(*) > 0
            from session_booking sb
            where sb.company_id = :companyId
              and sb.id not in (:excludeIds)
              and upper(coalesce(sb.booking_status, 'RESERVED')) not in ('CANCELLED', 'NO_SHOW')
              and (sb.meeting_link is null or sb.meeting_link = '')
              and upper(coalesce(sb.meeting_provisioning_status, 'NONE')) = 'NONE'
              and (
                    exists (
                        select 1
                        from session_service ss
                        where ss.session_booking_id = sb.id
                          and ss.space_id = :spaceId
                          and ss.start_time < :requestedBusyEnd
                          and (ss.end_time + (coalesce(ss.break_minutes_snapshot, 0) * interval '1 minute')) > :start
                    )
                    or (
                        not exists (select 1 from session_service any_ss where any_ss.session_booking_id = sb.id)
                        and sb.space_id = :spaceId
                        and sb.start_time < :requestedBusyEnd
                        and coalesce(sb.availability_end_time, sb.end_time) > :start
                    )
              )
            """, nativeQuery = true)
    boolean existsAvailabilityBlockingOverlapForSpace(
            @Param("companyId") Long companyId,
            @Param("spaceId") Long spaceId,
            @Param("start") LocalDateTime start,
            @Param("requestedBusyEnd") LocalDateTime requestedBusyEnd,
            @Param("excludeIds") List<Long> excludeIds
    );
}
