package com.example.app.inbox;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScheduledMessageRepository extends JpaRepository<ScheduledMessage, Long> {
    List<ScheduledMessage> findByCompanyIdAndStatusOrderByNextRunAtAsc(Long companyId, ScheduledMessageStatus status);
    Optional<ScheduledMessage> findByIdAndCompanyId(Long id, Long companyId);

    @Query("""
            select s.id from ScheduledMessage s
            where s.status = com.example.app.inbox.ScheduledMessageStatus.ACTIVE
              and s.nextRunAt <= :now
            order by s.nextRunAt asc, s.id asc
            """)
    List<Long> findDueIds(@Param("now") Instant now, Pageable pageable);

    @Query("""
            select s.id from ScheduledMessage s
            where s.status = com.example.app.inbox.ScheduledMessageStatus.ACTIVE
              and s.company.id in :companyIds
            order by s.nextRunAt asc, s.id asc
            """)
    List<Long> findActiveIdsForCompanies(@Param("companyIds") Collection<Long> companyIds, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @EntityGraph(attributePaths = {"company", "client", "senderUser"})
    @Query("""
            select s from ScheduledMessage s
            where s.id = :id
              and s.status = com.example.app.inbox.ScheduledMessageStatus.ACTIVE
            """)
    Optional<ScheduledMessage> findActiveForUpdate(@Param("id") Long id);
}
