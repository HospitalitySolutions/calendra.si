package com.example.app.waitlist;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WaitlistOfferRepository extends JpaRepository<WaitlistOffer, Long> {
    List<WaitlistOffer> findAllByRequestIdOrderByOfferedAtDesc(Long requestId);
    Optional<WaitlistOffer> findFirstByRequestIdAndStatusOrderByOfferedAtDesc(Long requestId, WaitlistOfferStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from WaitlistOffer o where o.id = :id and o.company.id = :companyId")
    Optional<WaitlistOffer> findForUpdateByIdAndCompanyId(@Param("id") Long id, @Param("companyId") Long companyId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from WaitlistOffer o where o.id = :id")
    Optional<WaitlistOffer> findForUpdateById(@Param("id") Long id);

    @Query("""
            select o from WaitlistOffer o
            where o.status = com.example.app.waitlist.WaitlistOfferStatus.PENDING
              and o.expiringNotifiedAt is null
              and o.expiresAt > :now
              and o.expiresAt <= :threshold
            order by o.expiresAt asc, o.id asc
            """)
    List<WaitlistOffer> findPendingExpiring(
            @Param("now") Instant now,
            @Param("threshold") Instant threshold);

    @Query("select o from WaitlistOffer o where o.status = com.example.app.waitlist.WaitlistOfferStatus.PENDING and o.expiresAt <= :now order by o.expiresAt asc, o.id asc")
    List<WaitlistOffer> findExpiredPending(@Param("now") Instant now);
}
