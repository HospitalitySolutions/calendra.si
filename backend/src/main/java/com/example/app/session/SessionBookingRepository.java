package com.example.app.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SessionBookingRepository extends JpaRepository<SessionBooking, Long> {

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id NOT IN :excludeIds " +
           "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsOverlappingInCompanyExcluding(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeIds") List<Long> excludeIds);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id <> :excludeBookingId " +
           "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsOverlappingInCompanyExceptBooking(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeBookingId") Long excludeBookingId);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.consultant.id = :consultantId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id NOT IN :excludeIds " +
           "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsOverlappingForConsultantExcluding(
            @Param("companyId") Long companyId,
            @Param("consultantId") Long consultantId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeIds") List<Long> excludeIds);

    /** Single-ID exclusion (create uses sentinel -1; update uses booking id). Avoids NOT IN (:one) quirks on some JPA setups. */
    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.consultant.id = :consultantId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id <> :excludeBookingId " +
           "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsOverlappingForConsultantExceptBooking(
            @Param("companyId") Long companyId,
            @Param("consultantId") Long consultantId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeBookingId") Long excludeBookingId);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id NOT IN :excludeIds " +
            "AND :spaceId IS NOT NULL AND sb.space IS NOT NULL AND sb.space.id = :spaceId " +
            "AND (sb.meetingLink IS NULL OR sb.meetingLink = '') " +
            "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsOverlappingForSpaceExcluding(
            @Param("companyId") Long companyId,
            @Param("spaceId") Long spaceId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeIds") List<Long> excludeIds);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id <> :excludeBookingId " +
           "AND :spaceId IS NOT NULL AND sb.space IS NOT NULL AND sb.space.id = :spaceId " +
           "AND (sb.meetingLink IS NULL OR sb.meetingLink = '') " +
           "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsOverlappingForSpaceExceptBooking(
            @Param("companyId") Long companyId,
            @Param("spaceId") Long spaceId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeBookingId") Long excludeBookingId);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.consultant IS NULL " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id NOT IN :excludeIds " +
           "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsOverlappingUnassignedExcluding(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeIds") List<Long> excludeIds);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.consultant IS NULL " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id <> :excludeBookingId " +
           "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsOverlappingUnassignedExceptBooking(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeBookingId") Long excludeBookingId);

    @Query(value = """
            select count(*) > 0
            from session_booking sb
            where sb.company_id = :companyId
              and sb.client_id = :clientId
              and sb.id not in (:excludeIds)
              and upper(coalesce(sb.booking_status, 'RESERVED')) not in ('CANCELLED', 'NO_SHOW')
              and sb.start_time < :end
              and sb.end_time > :start
            """, nativeQuery = true)
    boolean existsAvailabilityBlockingOverlapForClient(
            @Param("companyId") Long companyId,
            @Param("clientId") Long clientId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeIds") List<Long> excludeIds);

    @Query(value = """
            select count(*) > 0
            from session_booking sb
            left join session_type st on st.id = sb.type_id
            where sb.company_id = :companyId
              and sb.consultant_id = :consultantId
              and sb.id not in (:excludeIds)
              and upper(coalesce(sb.booking_status, 'RESERVED')) not in ('CANCELLED', 'NO_SHOW')
              and sb.start_time < :requestedBusyEnd
              and (sb.end_time + (coalesce(st.break_minutes, 0) * interval '1 minute')) > :start
            """, nativeQuery = true)
    boolean existsAvailabilityBlockingOverlapForConsultant(
            @Param("companyId") Long companyId,
            @Param("consultantId") Long consultantId,
            @Param("start") LocalDateTime start,
            @Param("requestedBusyEnd") LocalDateTime requestedBusyEnd,
            @Param("excludeIds") List<Long> excludeIds);

    @Query(value = """
            select count(*) > 0
            from session_booking sb
            left join session_type st on st.id = sb.type_id
            where sb.company_id = :companyId
              and sb.space_id = :spaceId
              and sb.id not in (:excludeIds)
              and upper(coalesce(sb.booking_status, 'RESERVED')) not in ('CANCELLED', 'NO_SHOW')
              and (sb.meeting_link is null or sb.meeting_link = '')
              and sb.start_time < :requestedBusyEnd
              and (sb.end_time + (coalesce(st.break_minutes, 0) * interval '1 minute')) > :start
            """, nativeQuery = true)
    boolean existsAvailabilityBlockingOverlapForSpace(
            @Param("companyId") Long companyId,
            @Param("spaceId") Long spaceId,
            @Param("start") LocalDateTime start,
            @Param("requestedBusyEnd") LocalDateTime requestedBusyEnd,
            @Param("excludeIds") List<Long> excludeIds);

    @Query(value = """
            select count(*) > 0
            from session_booking sb
            left join session_type st on st.id = sb.type_id
            where sb.company_id = :companyId
              and sb.id not in (:excludeIds)
              and upper(coalesce(sb.booking_status, 'RESERVED')) not in ('CANCELLED', 'NO_SHOW')
              and (sb.meeting_link is null or sb.meeting_link = '')
              and sb.start_time < :requestedBusyEnd
              and (sb.end_time + (coalesce(st.break_minutes, 0) * interval '1 minute')) > :start
            """, nativeQuery = true)
    boolean existsAvailabilityBlockingOverlapForAnyPhysicalSpace(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("requestedBusyEnd") LocalDateTime requestedBusyEnd,
            @Param("excludeIds") List<Long> excludeIds);

    List<SessionBooking> findByBookingGroupKeyAndCompanyIdOrderByIdAsc(String bookingGroupKey, Long companyId);

    List<SessionBooking> findAllByBookingGroupKeyOrderByIdAsc(String bookingGroupKey);

    List<SessionBooking> findByConsultantId(Long consultantId);

    List<SessionBooking> findAllByCompanyId(Long companyId);
    List<SessionBooking> findByConsultantIdAndCompanyId(Long consultantId, Long companyId);
    List<SessionBooking> findByConsultantIdAndCompanyIdAndStartTimeGreaterThanEqualAndStartTimeLessThan(Long consultantId, Long companyId, LocalDateTime from, LocalDateTime to);
    List<SessionBooking> findByCompanyIdAndStartTimeGreaterThanEqualAndStartTimeLessThan(Long companyId, LocalDateTime from, LocalDateTime to);

    @Query("""
            SELECT DISTINCT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.client
            LEFT JOIN FETCH sb.consultant consultant
            LEFT JOIN FETCH sb.space space
            LEFT JOIN FETCH sb.type sessionType
            WHERE sb.company.id = :companyId
              AND sb.startTime >= :rangeStart
              AND sb.startTime < :rangeEnd
              AND (:consultantId IS NULL OR consultant.id = :consultantId)
              AND (:spaceId IS NULL OR space.id = :spaceId)
              AND (:typeId IS NULL OR sessionType.id = :typeId)
            ORDER BY sb.startTime ASC, sb.id ASC
            """)
    List<SessionBooking> findAnalyticsByCompanyIdAndRange(
            @Param("companyId") Long companyId,
            @Param("rangeStart") LocalDateTime rangeStart,
            @Param("rangeEnd") LocalDateTime rangeEnd,
            @Param("consultantId") Long consultantId,
            @Param("spaceId") Long spaceId,
            @Param("typeId") Long typeId
    );

    @Query("""
            SELECT DISTINCT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.client c
            LEFT JOIN FETCH c.billingCompany
            LEFT JOIN FETCH sb.payeeCompany
            LEFT JOIN FETCH sb.consultant
            LEFT JOIN FETCH sb.space
            LEFT JOIN FETCH sb.type
            LEFT JOIN FETCH sb.clientGroup
            LEFT JOIN FETCH sb.sessionGroupBillingCompany
            WHERE sb.company.id = :companyId
              AND sb.startTime < :rangeEnd
              AND sb.endTime > :rangeStart
            ORDER BY sb.startTime ASC, sb.id ASC
            """)
    List<SessionBooking> findOverlappingDateRangeByCompanyId(
            @Param("companyId") Long companyId,
            @Param("rangeStart") LocalDateTime rangeStart,
            @Param("rangeEnd") LocalDateTime rangeEnd
    );

    @Query("""
            SELECT DISTINCT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.client c
            LEFT JOIN FETCH c.billingCompany
            LEFT JOIN FETCH sb.payeeCompany
            LEFT JOIN FETCH sb.consultant
            LEFT JOIN FETCH sb.space
            LEFT JOIN FETCH sb.type
            LEFT JOIN FETCH sb.clientGroup
            LEFT JOIN FETCH sb.sessionGroupBillingCompany
            WHERE sb.company.id = :companyId
              AND sb.consultant.id = :consultantId
              AND sb.startTime < :rangeEnd
              AND sb.endTime > :rangeStart
            ORDER BY sb.startTime ASC, sb.id ASC
            """)
    List<SessionBooking> findOverlappingDateRangeByConsultantIdAndCompanyId(
            @Param("consultantId") Long consultantId,
            @Param("companyId") Long companyId,
            @Param("rangeStart") LocalDateTime rangeStart,
            @Param("rangeEnd") LocalDateTime rangeEnd
    );

    Optional<SessionBooking> findByIdAndCompanyId(Long id, Long companyId);

    Optional<SessionBooking> findFirstByCompanyIdAndSourceOrderId(Long companyId, String sourceOrderId);

    @Query("SELECT sb FROM SessionBooking sb LEFT JOIN FETCH sb.consultant WHERE sb.client.id = :clientId AND sb.company.id = :companyId")
    List<SessionBooking> findByClientIdAndCompanyId(@Param("clientId") Long clientId, @Param("companyId") Long companyId);

    @Query("""
            SELECT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.consultant
            LEFT JOIN FETCH sb.type
            WHERE sb.client.id = :clientId
              AND sb.company.id = :companyId
            ORDER BY sb.startTime DESC, sb.id DESC
            """)
    List<SessionBooking> findByClientIdAndCompanyIdOrderByStartTimeDesc(
            @Param("clientId") Long clientId,
            @Param("companyId") Long companyId,
            Pageable pageable
    );

    @Query("""
            SELECT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.consultant
            LEFT JOIN FETCH sb.type
            WHERE sb.client.id = :clientId
              AND sb.company.id = :companyId
              AND sb.consultant.id = :consultantId
            ORDER BY sb.startTime DESC, sb.id DESC
            """)
    List<SessionBooking> findByClientIdAndCompanyIdAndConsultantIdOrderByStartTimeDesc(
            @Param("clientId") Long clientId,
            @Param("companyId") Long companyId,
            @Param("consultantId") Long consultantId,
            Pageable pageable
    );

    @Query("""
            SELECT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.consultant
            LEFT JOIN FETCH sb.type
            WHERE sb.client.id = :clientId
              AND sb.company.id = :companyId
              AND sb.startTime > :now
            ORDER BY sb.startTime ASC, sb.id ASC
            """)
    List<SessionBooking> findUpcomingByClientIdAndCompanyId(
            @Param("clientId") Long clientId,
            @Param("companyId") Long companyId,
            @Param("now") LocalDateTime now,
            Pageable pageable
    );

    @Query("""
            SELECT DISTINCT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.company
            LEFT JOIN FETCH sb.client
            LEFT JOIN FETCH sb.consultant
            LEFT JOIN FETCH sb.type
            LEFT JOIN FETCH sb.space
            WHERE sb.client.id = :clientId
              AND sb.company.id = :companyId
              AND sb.startTime > :now
              AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')
            ORDER BY sb.startTime ASC, sb.id ASC
            """)
    List<SessionBooking> findUpcomingActiveByClientIdAndCompanyId(
            @Param("clientId") Long clientId,
            @Param("companyId") Long companyId,
            @Param("now") LocalDateTime now
    );

    @Query("""
            SELECT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.consultant
            LEFT JOIN FETCH sb.type
            WHERE sb.client.id = :clientId
              AND sb.company.id = :companyId
              AND sb.startTime < :now
            ORDER BY sb.startTime DESC, sb.id DESC
            """)
    List<SessionBooking> findHistoryByClientIdAndCompanyId(
            @Param("clientId") Long clientId,
            @Param("companyId") Long companyId,
            @Param("now") LocalDateTime now,
            Pageable pageable
    );

    @Query("SELECT sb FROM SessionBooking sb WHERE sb.company.id = :companyId AND sb.client.id = :clientId " +
           "AND sb.consultant.id = :consultantId AND sb.billedAt IS NULL ORDER BY sb.startTime DESC")
    List<SessionBooking> findUnbilledByClientAndConsultant(
            @Param("companyId") Long companyId,
            @Param("clientId") Long clientId,
            @Param("consultantId") Long consultantId
    );


    @Query("SELECT DISTINCT sb FROM SessionBooking sb " +
           "LEFT JOIN FETCH sb.company " +
           "LEFT JOIN FETCH sb.client c " +
           "LEFT JOIN FETCH c.billingCompany " +
           "LEFT JOIN FETCH sb.payeeCompany " +
           "LEFT JOIN FETCH sb.consultant " +
           "LEFT JOIN FETCH sb.type t " +
           "LEFT JOIN FETCH t.linkedServices ls " +
           "LEFT JOIN FETCH ls.transactionService " +
           "WHERE sb.endTime < :now AND sb.type IS NOT NULL AND sb.billedAt IS NULL " +
           "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) <> 'CANCELLED'")
    List<SessionBooking> findPastSessionsWithType(LocalDateTime now);

    @Query("SELECT DISTINCT sb FROM SessionBooking sb " +
            "LEFT JOIN FETCH sb.company " +
            "LEFT JOIN FETCH sb.client c " +
            "LEFT JOIN FETCH c.billingCompany " +
            "LEFT JOIN FETCH sb.payeeCompany " +
            "LEFT JOIN FETCH sb.consultant " +
            "LEFT JOIN FETCH sb.type t " +
            "LEFT JOIN FETCH t.linkedServices ls " +
            "LEFT JOIN FETCH ls.transactionService " +
            "WHERE sb.endTime < :now AND sb.company.id = :companyId AND sb.type IS NOT NULL AND sb.billedAt IS NULL " +
            "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) <> 'CANCELLED'")
    List<SessionBooking> findPastSessionsWithTypeAndCompanyId(
            @Param("now") LocalDateTime now,
            @Param("companyId") Long companyId
    );

    @Query("""
            SELECT sb.id FROM SessionBooking sb
            WHERE sb.endTime < :now
              AND sb.company.id = :companyId
              AND sb.id > :afterId
              AND sb.type IS NOT NULL
              AND sb.billedAt IS NULL
              AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) <> 'CANCELLED'
              AND NOT EXISTS (
                    SELECT 1 FROM OpenBill o LEFT JOIN o.items i
                    WHERE o.company.id = :companyId
                      AND (o.sessionBooking.id = sb.id OR i.sourceSessionBookingId = sb.id)
              )
            ORDER BY sb.id ASC
            """)
    List<Long> findPastSessionIdsWithTypeAndCompanyIdAfterId(
            @Param("now") LocalDateTime now,
            @Param("companyId") Long companyId,
            @Param("afterId") Long afterId,
            Pageable pageable
    );

    @Query("""
            SELECT DISTINCT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.company
            LEFT JOIN FETCH sb.client c
            LEFT JOIN FETCH c.billingCompany
            LEFT JOIN FETCH sb.payeeCompany
            LEFT JOIN FETCH sb.consultant
            LEFT JOIN FETCH sb.type t
            LEFT JOIN FETCH t.linkedServices ls
            LEFT JOIN FETCH ls.transactionService
            WHERE sb.company.id = :companyId AND sb.id IN :ids
            """)
    List<SessionBooking> findAllForOpenBillSyncByCompanyIdAndIds(
            @Param("companyId") Long companyId,
            @Param("ids") Collection<Long> ids
    );

    @Query("""
            SELECT DISTINCT sb FROM SessionBooking sb
            LEFT JOIN FETCH sb.company
            LEFT JOIN FETCH sb.client c
            LEFT JOIN FETCH c.billingCompany
            LEFT JOIN FETCH sb.payeeCompany
            LEFT JOIN FETCH sb.consultant
            LEFT JOIN FETCH sb.type t
            LEFT JOIN FETCH t.linkedServices ls
            LEFT JOIN FETCH ls.transactionService
            WHERE sb.company.id = :companyId AND sb.id = :id
            """)
    Optional<SessionBooking> findForOpenBillSyncByIdAndCompanyId(
            @Param("id") Long id,
            @Param("companyId") Long companyId
    );

    @Query("SELECT sb FROM SessionBooking sb LEFT JOIN FETCH sb.client c LEFT JOIN FETCH c.billingCompany " +
            "LEFT JOIN FETCH sb.payeeCompany LEFT JOIN FETCH sb.consultant " +
            "WHERE sb.company.id = :companyId AND sb.id IN :ids")
    List<SessionBooking> findAllByCompanyIdAndIds(
            @Param("companyId") Long companyId,
            @Param("ids") Collection<Long> ids
    );

    @Query("SELECT DISTINCT sb FROM SessionBooking sb "
            + "LEFT JOIN FETCH sb.client "
            + "LEFT JOIN FETCH sb.consultant "
            + "LEFT JOIN FETCH sb.type "
            + "LEFT JOIN FETCH sb.clientGroup "
            + "WHERE sb.company.id = :companyId "
            + "AND sb.type.id = :typeId "
            + "AND sb.clientGroup IS NOT NULL "
            + "AND sb.startTime >= :from AND sb.startTime < :to")
    List<SessionBooking> findPublicGroupSessionCandidates(
            @Param("companyId") Long companyId,
            @Param("typeId") Long typeId,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to
    );

    @Query("SELECT COALESCE(MAX(sb.id), 0) FROM SessionBooking sb WHERE sb.company.id = :companyId")
    Long findMaxIdByCompanyId(@Param("companyId") Long companyId);

    @Query("SELECT sb FROM SessionBooking sb JOIN FETCH sb.client c " +
           "WHERE sb.reminderSentAt IS NULL AND sb.startTime >= :from AND sb.startTime <= :to")
    List<SessionBooking> findSessionsNeedingReminders(LocalDateTime from, LocalDateTime to);

    @Query("SELECT sb FROM SessionBooking sb JOIN FETCH sb.client c " +
            "WHERE sb.reminderSentAt IS NULL AND sb.company.id = :companyId AND sb.startTime >= :from AND sb.startTime <= :to")
    List<SessionBooking> findSessionsNeedingRemindersAndCompanyId(
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("companyId") Long companyId
    );

    @Query("SELECT DISTINCT sb FROM SessionBooking sb "
            + "JOIN FETCH sb.client "
            + "JOIN FETCH sb.company "
            + "LEFT JOIN FETCH sb.consultant "
            + "LEFT JOIN FETCH sb.type "
            + "LEFT JOIN FETCH sb.space "
            + "WHERE sb.company.id = :companyId "
            + "AND sb.notificationBeforeSentAt IS NULL "
            + "AND sb.startTime >= :startFrom AND sb.startTime < :startTo")
    List<SessionBooking> findNeedingBeforeSessionNotification(
            @Param("companyId") Long companyId,
            @Param("startFrom") LocalDateTime startFrom,
            @Param("startTo") LocalDateTime startTo
    );

    @Query("SELECT DISTINCT sb FROM SessionBooking sb "
            + "JOIN FETCH sb.client "
            + "JOIN FETCH sb.company "
            + "LEFT JOIN FETCH sb.consultant "
            + "LEFT JOIN FETCH sb.type "
            + "LEFT JOIN FETCH sb.space "
            + "WHERE sb.company.id = :companyId "
            + "AND sb.notificationAfterSentAt IS NULL "
            + "AND sb.endTime >= :endFrom AND sb.endTime < :endTo")
    List<SessionBooking> findNeedingAfterSessionNotification(
            @Param("companyId") Long companyId,
            @Param("endFrom") LocalDateTime endFrom,
            @Param("endTo") LocalDateTime endTo
    );

    @Modifying
    @Query("UPDATE SessionBooking sb SET sb.notes = :replacement WHERE sb.company.id = :companyId AND sb.client.id = :clientId")
    int anonymizeNotesForClient(
            @Param("companyId") Long companyId,
            @Param("clientId") Long clientId,
            @Param("replacement") String replacement
    );

    @Query("SELECT DISTINCT sb.client.id FROM SessionBooking sb WHERE sb.company.id = :companyId AND sb.client.id IN :clientIds "
            + "AND sb.endTime >= :now "
            + "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    List<Long> findClientIdsWithRemovalBlockingBookings(
            @Param("companyId") Long companyId,
            @Param("clientIds") Collection<Long> clientIds,
            @Param("now") LocalDateTime now);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId "
            + "AND sb.client.id = :clientId AND sb.endTime >= :now "
            + "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsRemovalBlockingBooking(
            @Param("companyId") Long companyId,
            @Param("clientId") Long clientId,
            @Param("now") LocalDateTime now);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId "
            + "AND sb.type.id = :typeId AND sb.endTime >= :now "
            + "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsUpcomingOrOngoingForType(
            @Param("companyId") Long companyId,
            @Param("typeId") Long typeId,
            @Param("now") LocalDateTime now);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb "
            + "JOIN sb.type t "
            + "JOIN t.linkedServices ls "
            + "WHERE sb.company.id = :companyId "
            + "AND ls.transactionService.id = :transactionServiceId "
            + "AND sb.endTime >= :now "
            + "AND UPPER(COALESCE(sb.bookingStatus, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW')")
    boolean existsUpcomingOrOngoingForTransactionService(
            @Param("companyId") Long companyId,
            @Param("transactionServiceId") Long transactionServiceId,
            @Param("now") LocalDateTime now);
}
