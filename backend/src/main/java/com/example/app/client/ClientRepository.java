package com.example.app.client;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    List<Client> findAllByCompanyIdAndBillingCompanyId(Long companyId, Long billingCompanyId);


    @Query(
            """
            select c from Client c
            left join fetch c.assignedTo
            left join fetch c.billingCompany
            where c.company.id = :companyId
              and c.email is not null
              and trim(c.email) <> ''
              and lower(trim(c.email)) = :normalizedEmail
            order by c.id asc
            """)
    List<Client> findFirstCandidatesByCompanyIdAndNormalizedEmail(
            @Param("companyId") Long companyId,
            @Param("normalizedEmail") String normalizedEmail);

    @Query(
            """
            select c from Client c
            left join fetch c.assignedTo
            left join fetch c.billingCompany
            where c.company.id = :companyId
              and c.phone is not null
              and trim(c.phone) <> ''
              and trim(c.phone) = :normalizedPhone
            order by c.id asc
            """)
    List<Client> findFirstCandidatesByCompanyIdAndNormalizedPhone(
            @Param("companyId") Long companyId,
            @Param("normalizedPhone") String normalizedPhone);
    @Query(
            """
            select c from Client c
            where c.company.id = :companyId
              and c.email is not null
              and trim(c.email) <> ''
              and lower(trim(c.email)) = :normalizedEmail
            order by c.id asc
            """)
    List<Client> findAllByCompanyIdAndNormalizedEmail(
            @Param("companyId") Long companyId,
            @Param("normalizedEmail") String normalizedEmail);

    @Query(
            """
            select case when count(c) > 0 then true else false end from Client c
            where c.company.id = :companyId
              and c.email is not null
              and trim(c.email) <> ''
              and lower(trim(c.email)) = :normalizedEmail
              and (:excludeClientId is null or c.id <> :excludeClientId)
            """)
    boolean existsOtherWithNormalizedEmail(
            @Param("companyId") Long companyId,
            @Param("normalizedEmail") String normalizedEmail,
            @Param("excludeClientId") Long excludeClientId);
}
