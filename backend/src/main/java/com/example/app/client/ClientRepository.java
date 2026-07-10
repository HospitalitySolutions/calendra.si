package com.example.app.client;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ClientRepository extends JpaRepository<Client, Long> {
    @EntityGraph(attributePaths = {"assignedTo", "assignedUsers", "preferredSlots", "billingCompany"})
    List<Client> findAll();

    @EntityGraph(attributePaths = {"assignedTo", "assignedUsers", "preferredSlots", "billingCompany"})
    List<Client> findAllByCompanyId(Long companyId);

    @EntityGraph(attributePaths = {"assignedTo", "assignedUsers", "preferredSlots", "billingCompany"})
    @Query("""
            select distinct c from Client c
            left join c.assignedUsers assignedUser
            where c.assignedTo.id = :userId or assignedUser.id = :userId
            order by c.lastName asc, c.firstName asc, c.id asc
            """)
    List<Client> findByAssignedToId(@Param("userId") Long userId);

    @EntityGraph(attributePaths = {"assignedTo", "assignedUsers", "preferredSlots", "billingCompany"})
    @Query("""
            select distinct c from Client c
            left join c.assignedUsers assignedUser
            where c.company.id = :companyId
              and (c.assignedTo.id = :userId or assignedUser.id = :userId)
            order by c.lastName asc, c.firstName asc, c.id asc
            """)
    List<Client> findByAssignedToIdAndCompanyId(@Param("userId") Long userId, @Param("companyId") Long companyId);

    @Query("""
            select distinct c from Client c
            left join fetch c.assignedTo assignedTo
            left join c.assignedUsers assignedUser
            left join fetch c.billingCompany
            where c.company.id = :companyId
              and c.createdAt >= :createdFrom
              and c.createdAt < :createdToExclusive
              and (:assignedToId is null or assignedTo.id = :assignedToId or assignedUser.id = :assignedToId)
            order by c.createdAt asc, c.id asc
            """)
    List<Client> findAnalyticsByCompanyIdAndCreatedAtRange(
            @Param("companyId") Long companyId,
            @Param("createdFrom") Instant createdFrom,
            @Param("createdToExclusive") Instant createdToExclusive,
            @Param("assignedToId") Long assignedToId
    );

    @EntityGraph(attributePaths = {"assignedTo", "assignedUsers", "billingCompany"})
    @Query("""
            select c from Client c
            where c.company.id = :companyId
              and (:search is null or :search = ''
                   or lower(coalesce(c.firstName, '')) like lower(concat('%', :search, '%'))
                   or lower(coalesce(c.lastName, '')) like lower(concat('%', :search, '%'))
                   or lower(coalesce(c.email, '')) like lower(concat('%', :search, '%'))
                   or lower(coalesce(c.phone, '')) like lower(concat('%', :search, '%')))
            order by c.lastName asc, c.firstName asc, c.id asc
            """)
    List<Client> findPageByCompanyId(
            @Param("companyId") Long companyId,
            @Param("search") String search,
            Pageable pageable);

    @EntityGraph(attributePaths = {"assignedTo", "assignedUsers", "billingCompany"})
    @Query("""
            select distinct c from Client c
            left join c.assignedUsers assignedUser
            where c.company.id = :companyId
              and (c.assignedTo.id = :assignedToId or assignedUser.id = :assignedToId)
              and (:search is null or :search = ''
                   or lower(coalesce(c.firstName, '')) like lower(concat('%', :search, '%'))
                   or lower(coalesce(c.lastName, '')) like lower(concat('%', :search, '%'))
                   or lower(coalesce(c.email, '')) like lower(concat('%', :search, '%'))
                   or lower(coalesce(c.phone, '')) like lower(concat('%', :search, '%')))
            order by c.lastName asc, c.firstName asc, c.id asc
            """)
    List<Client> findPageByAssignedToIdAndCompanyId(
            @Param("assignedToId") Long assignedToId,
            @Param("companyId") Long companyId,
            @Param("search") String search,
            Pageable pageable);

    Optional<Client> findByIdAndCompanyId(Long id, Long companyId);

    Optional<Client> findFirstByCompanyIdAndPhoneOrderByIdAsc(Long companyId, String phone);
    Optional<Client> findFirstByCompanyIdAndWhatsappPhoneOrderByIdAsc(Long companyId, String whatsappPhone);
    Optional<Client> findFirstByCompanyIdAndViberUserIdOrderByIdAsc(Long companyId, String viberUserId);

    @Query("""
            select c from Client c
            left join fetch c.assignedTo
            left join fetch c.billingCompany
            where c.company.id = :companyId
              and (
                    function('regexp_replace', coalesce(c.whatsappPhone, ''), '[^0-9]', '', 'g') = :normalizedPhone
                 or function('regexp_replace', coalesce(c.phone, ''), '[^0-9]', '', 'g') = :normalizedPhone
              )
            order by c.id asc
            """)
    List<Client> findMessagingPhoneCandidatesByCompanyId(
            @Param("companyId") Long companyId,
            @Param("normalizedPhone") String normalizedPhone,
            Pageable pageable);

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
