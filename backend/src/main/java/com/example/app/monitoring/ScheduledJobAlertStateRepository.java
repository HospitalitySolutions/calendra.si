package com.example.app.monitoring;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ScheduledJobAlertStateRepository extends JpaRepository<ScheduledJobAlertState, Long> {
    Optional<ScheduledJobAlertState> findFirstByJobNameAndAlertTypeAndStatusOrderByLastDetectedAtDesc(
            String jobName,
            ScheduledJobAlertType alertType,
            ScheduledJobAlertStatus status
    );

    List<ScheduledJobAlertState> findByStatusOrderBySeverityDescLastDetectedAtDesc(ScheduledJobAlertStatus status);

    List<ScheduledJobAlertState> findByJobNameInAndStatusOrderByLastDetectedAtDesc(
            Collection<String> jobNames,
            ScheduledJobAlertStatus status
    );
}
