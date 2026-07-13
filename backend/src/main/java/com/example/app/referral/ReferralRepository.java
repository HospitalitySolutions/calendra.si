package com.example.app.referral;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReferralRepository extends JpaRepository<Referral, Long> {

    Optional<Referral> findFirstByReferredCompanyIdAndStatus(Long referredCompanyId, ReferralStatus status);

    boolean existsByReferredCompanyId(Long referredCompanyId);

    @EntityGraph(attributePaths = {"referrerCompany", "referrerUser", "referredCompany"})
    Optional<Referral> findFirstByReferredCompanyIdOrderByCreatedAtDesc(Long referredCompanyId);

    @EntityGraph(attributePaths = {"referrerCompany", "referrerUser", "referredCompany"})
    List<Referral> findAllByReferrerCompanyIdOrderByCreatedAtDesc(Long referrerCompanyId);

    long countByReferrerCompanyIdAndStatus(Long referrerCompanyId, ReferralStatus status);

    long countByReferrerCompanyIdAndReferrerRewardGrantedTrueAndQualifiedAtAfter(Long referrerCompanyId, Instant after);

    @EntityGraph(attributePaths = {"referrerCompany", "referrerUser", "referredCompany"})
    List<Referral> findAllByOrderByCreatedAtDesc();
}
