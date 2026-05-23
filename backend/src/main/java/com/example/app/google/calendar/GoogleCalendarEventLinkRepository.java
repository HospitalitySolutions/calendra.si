package com.example.app.google.calendar;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GoogleCalendarEventLinkRepository extends JpaRepository<GoogleCalendarEventLink, Long> {
    Optional<GoogleCalendarEventLink> findByConnection_IdAndCalendarIdAndGoogleEventId(Long connectionId, String calendarId, String googleEventId);

    Optional<GoogleCalendarEventLink> findByConnection_IdAndCompany_IdAndAppEntityTypeAndAppEntityId(Long connectionId, Long companyId, GoogleCalendarEntityType appEntityType, Long appEntityId);

    List<GoogleCalendarEventLink> findAllByCompany_IdAndAppEntityTypeAndAppEntityId(Long companyId, GoogleCalendarEntityType appEntityType, Long appEntityId);

    Optional<GoogleCalendarEventLink> findFirstByConnection_IdAndGoogleIcalUidAndDeletedAtIsNull(Long connectionId, String googleIcalUid);

    List<GoogleCalendarEventLink> findTop100ByConnection_IdOrderByUpdatedAtDesc(Long connectionId);

    List<GoogleCalendarEventLink> findTop100ByCompany_IdAndSyncStatusContainingIgnoreCaseOrderByUpdatedAtDesc(Long companyId, String syncStatusPart);
}
