package com.example.app.inbox;

import java.time.Instant;
import org.springframework.data.domain.Pageable;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClientMessageRepository extends JpaRepository<ClientMessage, Long> {
    List<ClientMessage> findAllByCompanyIdOrderByCreatedAtDesc(Long companyId);
    List<ClientMessage> findAllByCompanyIdAndClientIdOrderByCreatedAtAsc(Long companyId, Long clientId);


    @Query("""
            select distinct m from ClientMessage m
            left join fetch m.client c
            left join fetch c.assignedTo
            left join fetch m.senderUser
            where m.company.id = :companyId
            order by m.createdAt desc, m.id desc
            """)
    List<ClientMessage> findPageByCompanyIdOrderByCreatedAtDesc(@Param("companyId") Long companyId, Pageable pageable);

    @Query("""
            select distinct m from ClientMessage m
            left join fetch m.client c
            left join fetch c.assignedTo
            left join c.assignedUsers assignedUser
            left join fetch m.senderUser
            where m.company.id = :companyId
              and (c.assignedTo.id = :assignedToId or assignedUser.id = :assignedToId)
            order by m.createdAt desc, m.id desc
            """)
    List<ClientMessage> findPageByCompanyIdAndAssignedToIdOrderByCreatedAtDesc(
            @Param("companyId") Long companyId,
            @Param("assignedToId") Long assignedToId,
            Pageable pageable);

    @Query("""
            select distinct m from ClientMessage m
            left join fetch m.client c
            left join fetch c.assignedTo
            left join fetch m.senderUser
            where m.company.id = :companyId
              and m.client.id = :clientId
            order by m.createdAt desc, m.id desc
            """)
    List<ClientMessage> findPageByCompanyIdAndClientIdOrderByCreatedAtDesc(
            @Param("companyId") Long companyId,
            @Param("clientId") Long clientId,
            Pageable pageable);

    @Query("""
            select distinct m from ClientMessage m
            left join fetch m.client c
            left join fetch c.assignedTo
            left join fetch m.senderUser
            where m.company.id = :companyId
              and m.client.id = :clientId
              and (m.conversationKey = :conversationKey or (:legacyKey = true and m.conversationKey is null))
            order by m.createdAt desc, m.id desc
            """)
    List<ClientMessage> findPageByCompanyIdAndClientIdAndConversationKeyOrderByCreatedAtDesc(
            @Param("companyId") Long companyId,
            @Param("clientId") Long clientId,
            @Param("conversationKey") String conversationKey,
            @Param("legacyKey") boolean legacyKey,
            Pageable pageable);
    java.util.Optional<ClientMessage> findFirstByCompanyIdAndExternalMessageId(Long companyId, String externalMessageId);

    @Modifying
    @Query("delete from ClientMessage m where m.createdAt < :cutoff")
    int deleteAllByCreatedAtBefore(@Param("cutoff") Instant cutoff);
}
