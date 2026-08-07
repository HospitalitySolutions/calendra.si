package com.example.app.widget.manage;

import java.time.Instant;
import java.util.Collection;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PublicBookingManageTokenRepository extends JpaRepository<PublicBookingManageToken, Long> {
    @Query("""
            SELECT t FROM PublicBookingManageToken t
            JOIN FETCH t.company
            JOIN FETCH t.booking b
            LEFT JOIN FETCH b.client
            LEFT JOIN FETCH b.consultant
            LEFT JOIN FETCH b.space
            LEFT JOIN FETCH b.type
            LEFT JOIN FETCH b.clientGroup
            WHERE t.tokenHash = :tokenHash
              AND t.revokedAt IS NULL
            """)
    Optional<PublicBookingManageToken> findActiveByTokenHash(@Param("tokenHash") String tokenHash);

    @Modifying(flushAutomatically = true)
    @Query("""
            DELETE FROM PublicBookingManageToken t
            WHERE t.company.id = :companyId
              AND t.booking.id IN :bookingIds
            """)
    int deleteByCompanyIdAndBookingIds(
            @Param("companyId") Long companyId,
            @Param("bookingIds") Collection<Long> bookingIds
    );

    @Modifying(flushAutomatically = true)
    @Query("""
            UPDATE PublicBookingManageToken t
               SET t.revokedAt = :revokedAt
             WHERE t.company.id = :companyId
               AND t.booking.id IN :bookingIds
               AND t.revokedAt IS NULL
            """)
    int revokeByCompanyIdAndBookingIds(
            @Param("companyId") Long companyId,
            @Param("bookingIds") Collection<Long> bookingIds,
            @Param("revokedAt") Instant revokedAt
    );
}
