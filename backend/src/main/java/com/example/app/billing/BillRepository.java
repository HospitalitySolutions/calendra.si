package com.example.app.billing;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface BillRepository extends JpaRepository<Bill, Long> {
    @Override
    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAll();

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyId(Long companyId);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyIdAndBillTypeOrderByIssueDateDescIdDesc(Long companyId, BillType billType);

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
    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findFirstByCompanyIdAndSourceSessionIdSnapshotOrderByIdDesc(Long companyId, Long sourceSessionIdSnapshot);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    Optional<Bill> findFirstByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdDesc(Long companyId, Long sourceSessionIdSnapshot, BillType billType);

    @EntityGraph(attributePaths = {"client", "consultant", "paymentMethod", "items", "items.transactionService"})
    List<Bill> findAllByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdAsc(Long companyId, Long sourceSessionIdSnapshot, BillType billType);

    List<Bill> findAllByCompanyIdAndIdIn(Long companyId, Collection<Long> ids);

    @Query(
            "select distinct b.company.id from Bill b where "
                    + "(b.stripeCustomerId is not null and lower(b.stripeCustomerId) like lower(concat('%', :needle, '%'))) or "
                    + "(b.stripeInvoiceId is not null and lower(b.stripeInvoiceId) like lower(concat('%', :needle, '%'))) or "
                    + "(b.checkoutSessionId is not null and lower(b.checkoutSessionId) like lower(concat('%', :needle, '%'))) or "
                    + "(b.paymentIntentId is not null and lower(b.paymentIntentId) like lower(concat('%', :needle, '%')))")
    List<Long> findDistinctCompanyIdsByStripeFieldsContainingIgnoreCase(@Param("needle") String needle);

    List<Bill> findTop8ByCompany_IdOrderByIdDesc(Long companyId);
}
