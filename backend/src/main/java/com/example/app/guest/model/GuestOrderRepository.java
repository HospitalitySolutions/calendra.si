package com.example.app.guest.model;

import java.util.List;
import java.util.Optional;
import java.util.Collection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GuestOrderRepository extends JpaRepository<GuestOrder, Long> {
    boolean existsByReferenceCode(String referenceCode);

    @Query("select o.referenceCode from GuestOrder o where o.company.id = :companyId and o.referenceCode is not null")
    List<String> findAllReferenceCodesByCompanyId(@Param("companyId") Long companyId);

    List<GuestOrder> findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(Long guestUserId, Long companyId);
    List<GuestOrder> findAllByGuestUserIdAndCompanyIdOrderByCreatedAtDesc(Long guestUserId, Long companyId, Pageable pageable);
    List<GuestOrder> findAllByGuestUserIdAndCompanyIdAndStatusOrderByCreatedAtDesc(Long guestUserId, Long companyId, OrderStatus status);
    List<GuestOrder> findAllByGuestUserIdAndCompanyIdAndStatusOrderByCreatedAtDesc(Long guestUserId, Long companyId, OrderStatus status, Pageable pageable);
    Optional<GuestOrder> findByIdAndGuestUserId(Long id, Long guestUserId);
    Optional<GuestOrder> findByPaypalOrderId(String paypalOrderId);
    Optional<GuestOrder> findByStripeCheckoutSessionId(String stripeCheckoutSessionId);
    Optional<GuestOrder> findByBillId(Long billId);
    List<GuestOrder> findAllByClientIdAndCompanyIdAndStatusOrderByCreatedAtDesc(Long clientId, Long companyId, OrderStatus status);

    @Query("""
            SELECT e.sourceOrderId, p.name, p.productType
            FROM GuestEntitlement e
            LEFT JOIN e.product p
            WHERE e.sourceOrderId IN :orderIds
            ORDER BY e.sourceOrderId ASC, e.createdAt ASC
            """)
    List<Object[]> findFirstEntitlementProductRowsForOrderIds(@Param("orderIds") Collection<Long> orderIds);
}

