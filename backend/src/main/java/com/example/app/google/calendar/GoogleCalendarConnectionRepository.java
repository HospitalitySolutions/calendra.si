package com.example.app.google.calendar;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GoogleCalendarConnectionRepository extends JpaRepository<GoogleCalendarConnection, Long> {
    List<GoogleCalendarConnection> findAllByCompany_IdOrderByIdAsc(Long companyId);

    Optional<GoogleCalendarConnection> findFirstByCompany_IdAndUser_IdAndStatusOrderByIdDesc(Long companyId, Long userId, GoogleCalendarConnectionStatus status);

    Optional<GoogleCalendarConnection> findFirstByCompany_IdAndUserIsNullAndStatusOrderByIdDesc(Long companyId, GoogleCalendarConnectionStatus status);

    Optional<GoogleCalendarConnection> findByIdAndCompany_Id(Long id, Long companyId);

    Optional<GoogleCalendarConnection> findByChannelIdAndResourceId(String channelId, String resourceId);

    @Query("SELECT c FROM GoogleCalendarConnection c WHERE c.status = :status AND c.channelExpiresAt IS NOT NULL AND c.channelExpiresAt < :before")
    List<GoogleCalendarConnection> findActiveChannelsExpiringBefore(@Param("before") Instant before, @Param("status") GoogleCalendarConnectionStatus status);

    default List<GoogleCalendarConnection> findActiveChannelsExpiringBefore(Instant before) {
        return findActiveChannelsExpiringBefore(before, GoogleCalendarConnectionStatus.ACTIVE);
    }
}
