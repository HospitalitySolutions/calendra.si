package com.example.app.session;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SessionBookingRepository extends JpaRepository<SessionBooking, Long> {

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id NOT IN :excludeIds")
    boolean existsOverlappingInCompanyExcluding(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeIds") List<Long> excludeIds);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id <> :excludeBookingId")
    boolean existsOverlappingInCompanyExceptBooking(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeBookingId") Long excludeBookingId);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.consultant.id = :consultantId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id NOT IN :excludeIds")
    boolean existsOverlappingForConsultantExcluding(
            @Param("companyId") Long companyId,
            @Param("consultantId") Long consultantId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeIds") List<Long> excludeIds);

    /** Single-ID exclusion (create uses sentinel -1; update uses booking id). Avoids NOT IN (:one) quirks on some JPA setups. */
    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.consultant.id = :consultantId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id <> :excludeBookingId")
    boolean existsOverlappingForConsultantExceptBooking(
            @Param("companyId") Long companyId,
            @Param("consultantId") Long consultantId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeBookingId") Long excludeBookingId);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id NOT IN :excludeIds " +
            "AND :spaceId IS NOT NULL AND sb.space IS NOT NULL AND sb.space.id = :spaceId " +
            "AND (sb.meetingLink IS NULL OR sb.meetingLink = '')")
    boolean existsOverlappingForSpaceExcluding(
            @Param("companyId") Long companyId,
            @Param("spaceId") Long spaceId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeIds") List<Long> excludeIds);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id <> :excludeBookingId " +
           "AND :spaceId IS NOT NULL AND sb.space IS NOT NULL AND sb.space.id = :spaceId " +
           "AND (sb.meetingLink IS NULL OR sb.meetingLink = '')")
    boolean existsOverlappingForSpaceExceptBooking(
            @Param("companyId") Long companyId,
            @Param("spaceId") Long spaceId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeBookingId") Long excludeBookingId);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.consultant IS NULL " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id NOT IN :excludeIds")
    boolean existsOverlappingUnassignedExcluding(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeIds") List<Long> excludeIds);

    @Query("SELECT CASE WHEN COUNT(sb) > 0 THEN true ELSE false END FROM SessionBooking sb WHERE sb.company.id = :companyId " +
           "AND sb.consultant IS NULL " +
           "AND sb.startTime < :end AND sb.endTime > :start AND sb.id <> :excludeBookingId")
    boolean existsOverlappingUnassignedExceptBooking(
            @Param("companyId") Long companyId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("excludeBookingId") Long excludeBookingId);

    List<SessionBooking> findByConsultantId(Long consultantId);

    List<SessionBooking> findAllByCompanyId(Long companyId);
    List<SessionBooking> findByConsultantIdAndCompanyId(Long consultantId, Long companyId);
    Optional<SessionBooking> findByIdAndCompanyId(Long id, Long companyId);

    @Query("SELECT sb FROM SessionBooking sb LEFT JOIN FETCH sb.consultant WHERE sb.client.id = :clientId AND sb.company.id = :companyId")
    List<SessionBooking> findByClientIdAndCompanyId(@Param("clientId") Long clientId, @Param("companyId") Long companyId);

    @Query("SELECT sb FROM SessionBooking sb WHERE sb.company.id = :companyId AND sb.client.id = :clientId " +
           "AND sb.consultant.id = :consultantId AND sb.billedAt IS NULL ORDER BY sb.startTime DESC")
    List<SessionBooking> findUnbilledByClientAndConsultant(
            @Param("companyId") Long companyId,
            @Param("clientId") Long clientId,
            @Param("consultantId") Long consultantId
    );

    @Query("SELECT DISTINCT sb FROM SessionBooking sb LEFT JOIN FETCH sb.type t LEFT JOIN FETCH t.linkedServices ls LEFT JOIN FETCH ls.transactionService " +
           "WHERE sb.endTime < :now AND sb.type IS NOT NULL AND sb.billedAt IS NULL")
    List<SessionBooking> findPastSessionsWithType(LocalDateTime now);

    @Query("SELECT DISTINCT sb FROM SessionBooking sb LEFT JOIN FETCH sb.type t LEFT JOIN FETCH t.linkedServices ls LEFT JOIN FETCH ls.transactionService " +
            "WHERE sb.endTime < :now AND sb.company.id = :companyId AND sb.type IS NOT NULL AND sb.billedAt IS NULL")
    List<SessionBooking> findPastSessionsWithTypeAndCompanyId(
            @Param("now") LocalDateTime now,
            @Param("companyId") Long companyId
    );

    @Query("SELECT sb FROM SessionBooking sb LEFT JOIN FETCH sb.client LEFT JOIN FETCH sb.consultant " +
            "WHERE sb.company.id = :companyId AND sb.id IN :ids")
    List<SessionBooking> findAllByCompanyIdAndIds(
            @Param("companyId") Long companyId,
            @Param("ids") Collection<Long> ids
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
}
