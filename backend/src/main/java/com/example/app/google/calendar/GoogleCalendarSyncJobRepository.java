package com.example.app.google.calendar;

import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GoogleCalendarSyncJobRepository extends JpaRepository<GoogleCalendarSyncJob, Long> {
    Optional<GoogleCalendarSyncJob> findFirstByConnection_IdAndActionAndAppEntityTypeAndAppEntityIdAndStatusOrderByCreatedAtDesc(Long connectionId, GoogleCalendarSyncAction action, GoogleCalendarEntityType appEntityType, Long appEntityId, GoogleCalendarSyncJobStatus status);

    Optional<GoogleCalendarSyncJob> findFirstByConnection_IdAndActionAndStatusOrderByCreatedAtDesc(Long connectionId, GoogleCalendarSyncAction action, GoogleCalendarSyncJobStatus status);

    @Query("SELECT j FROM GoogleCalendarSyncJob j " +
            "LEFT JOIN FETCH j.company " +
            "LEFT JOIN FETCH j.connection c " +
            "LEFT JOIN FETCH c.company " +
            "LEFT JOIN FETCH c.user " +
            "WHERE j.id = :id")
    Optional<GoogleCalendarSyncJob> findByIdWithDetails(@Param("id") Long id);

    @Query("SELECT j FROM GoogleCalendarSyncJob j " +
            "LEFT JOIN FETCH j.company " +
            "LEFT JOIN FETCH j.connection c " +
            "LEFT JOIN FETCH c.company " +
            "LEFT JOIN FETCH c.user " +
            "WHERE j.status = :status AND j.nextAttemptAt <= :now " +
            "ORDER BY j.createdAt ASC")
    List<GoogleCalendarSyncJob> findDueJobs(@Param("now") Instant now, @Param("status") GoogleCalendarSyncJobStatus status, Pageable pageable);

    default List<GoogleCalendarSyncJob> findDueJobs(Instant now, Pageable pageable) {
        return findDueJobs(now, GoogleCalendarSyncJobStatus.PENDING, pageable);
    }
}
