package com.example.app.guest.model;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GuestOrderRepository extends JpaRepository<GuestOrder, Long> {
    boolean existsByReferenceCode(String referenceCode);

    @org.springframework.data.jpa.repository.Query("select o.referenceCode from GuestOrder o where o.company.id = :companyId and o.referenceCode is not null")
    List<String> findAllReferenceCodesByCompanyId(@org.springframework.data.repository.query.Param("companyId") Long companyId);

    List<GuestOrder> findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(Long guestUserId, Long companyId);
    List<GuestOrder> findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(Long guestUserId, Long companyId, Pageable pageable);
    List<GuestOrder> findAllByGuestUserIdAndCompanyIdAndStatusOrderByCreatedAtDesc(Long guestUserId, Long companyId, OrderStatus status);
    List<GuestOrder> findAllByGuestUserIdAndCompanyIdAndStatusOrderByCreatedAtDesc(Long guestUserId, Long companyId, OrderStatus status, Pageable pageable);
    Optional<GuestOrder> findByIdAndGuestUserId(Long id, Long guestUserId);
    Optional<GuestOrder> findByPaypalOrderId(String paypalOrderId);
    Optional<GuestOrder> findByStripeCheckoutSessionId(String stripeCheckoutSessionId);
    Optional<GuestOrder> findByBillId(Long billId);
    List<GuestOrder> findAllByClientIdAndCompanyIdAndStatusOrderByCreatedAtDesc(Long clientId, Long companyId, OrderStatus status);
}
