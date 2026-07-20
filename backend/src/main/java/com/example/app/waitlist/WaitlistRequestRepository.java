package com.example.app.waitlist;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WaitlistRequestRepository extends JpaRepository<WaitlistRequest, Long> {
    @Query("""
            select distinct r from WaitlistRequest r
            left join fetch r.client
            left join fetch r.service service
            left join fetch service.serviceGroup
            left join fetch r.serviceGroup
            left join fetch r.location
            left join fetch r.specificEmployee
            left join fetch r.targetSession
            left join fetch r.bookedBooking
            where r.company.id = :companyId
            order by r.joinedAt asc, r.id asc
            """)
    List<WaitlistRequest> findAllDetailedByCompanyId(@Param("companyId") Long companyId);

    @Query("""
            select distinct r from WaitlistRequest r
            left join fetch r.client
            left join fetch r.service service
            left join fetch service.serviceGroup
            left join fetch r.serviceGroup
            left join fetch r.location
            left join fetch r.specificEmployee
            left join fetch r.targetSession
            left join fetch r.bookedBooking
            where r.id = :id and r.company.id = :companyId
            """)
    Optional<WaitlistRequest> findDetailedByIdAndCompanyId(@Param("id") Long id, @Param("companyId") Long companyId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from WaitlistRequest r where r.id = :id and r.company.id = :companyId")
    Optional<WaitlistRequest> findForUpdateByIdAndCompanyId(@Param("id") Long id, @Param("companyId") Long companyId);

    boolean existsByCompanyIdAndDuplicateKeyAndStatusIn(Long companyId, String duplicateKey, List<WaitlistRequestStatus> statuses);

    @Query("""
            select r from WaitlistRequest r
            left join fetch r.service service
            left join fetch service.serviceGroup
            left join fetch r.serviceGroup
            where r.company.id = :companyId
              and r.status = com.example.app.waitlist.WaitlistRequestStatus.ACTIVE
              and r.dateFrom <= :date
              and r.dateTo >= :date
              and (r.expiresAt is null or r.expiresAt > :now)
            order by r.joinedAt asc, r.id asc
            """)
    List<WaitlistRequest> findActiveCandidates(
            @Param("companyId") Long companyId,
            @Param("date") LocalDate date,
            @Param("now") Instant now);

    @Query("""
            select r from WaitlistRequest r
            left join fetch r.service service
            left join fetch service.serviceGroup
            left join fetch r.serviceGroup
            where r.company.id = :companyId
              and r.joinedAt >= :from
              and r.joinedAt < :to
            order by r.joinedAt asc, r.id asc
            """)
    List<WaitlistRequest> findAnalyticsByCompanyIdAndJoinedAtRange(
            @Param("companyId") Long companyId,
            @Param("from") Instant from,
            @Param("to") Instant to);
}
