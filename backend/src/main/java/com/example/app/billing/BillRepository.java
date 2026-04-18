package com.example.app.billing;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface BillRepository extends JpaRepository<Bill, Long> {
    @Override
    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAll();

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyId(Long companyId);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyIdAndRecipientCompanyIdSnapshotOrderByIssueDateDescIdDesc(Long companyId, Long recipientCompanyIdSnapshot);

    @Override
    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findById(Long id);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findByIdAndCompanyId(Long id, Long companyId);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findByCheckoutSessionId(String checkoutSessionId);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findByStripeInvoiceId(String stripeInvoiceId);
}
