package com.example.app.client;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ClientRepository extends JpaRepository<Client, Long> {
    @EntityGraph(attributePaths = {"assignedTo", "preferredSlots", "billingCompany"})
    List<Client> findAll();

    @EntityGraph(attributePaths = {"assignedTo", "preferredSlots", "billingCompany"})
    List<Client> findAllByCompanyId(Long companyId);

    @EntityGraph(attributePaths = {"assignedTo", "preferredSlots", "billingCompany"})
    List<Client> findByAssignedToId(Long userId);

    @EntityGraph(attributePaths = {"assignedTo", "preferredSlots", "billingCompany"})
    List<Client> findByAssignedToIdAndCompanyId(Long userId, Long companyId);

    Optional<Client> findByIdAndCompanyId(Long id, Long companyId);

    Optional<Client> findFirstByCompanyIdAndPhoneOrderByIdAsc(Long companyId, String phone);
    Optional<Client> findFirstByCompanyIdAndWhatsappPhoneOrderByIdAsc(Long companyId, String whatsappPhone);
    Optional<Client> findFirstByCompanyIdAndViberUserIdOrderByIdAsc(Long companyId, String viberUserId);

    Optional<Client> findFirstByCompanyIdAndBillingCompanyIdOrderByIdAsc(Long companyId, Long billingCompanyId);
}
