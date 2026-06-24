package com.example.app.widget.manage;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
