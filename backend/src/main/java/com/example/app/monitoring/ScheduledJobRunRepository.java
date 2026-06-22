package com.example.app.monitoring;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduledJobRunRepository extends JpaRepository<ScheduledJobRun, Long> {
    List<ScheduledJobRun> findTop500ByOrderByStartedAtDesc();

    List<ScheduledJobRun> findByJobNameInOrderByStartedAtDesc(Collection<String> jobNames);

    List<ScheduledJobRun> findByJobNameOrderByStartedAtDesc(String jobName, Pageable pageable);

    long deleteByCreatedAtBefore(Instant cutoff);
}
