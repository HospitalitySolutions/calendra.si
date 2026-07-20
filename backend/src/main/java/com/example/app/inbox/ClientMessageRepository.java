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
    java.util.Optional<ClientMessage> findFirstByCompanyIdAndClientIdAndConversationClosedFalseOrderByCreatedAtDescIdDesc(Long companyId, Long clientId);
    java.util.Optional<ClientMessage> findFirstByCompanyIdAndClientIdAndChannelAndConversationClosedFalseOrderByCreatedAtDescIdDesc(
            Long companyId, Long clientId, MessageChannel channel);


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

    @Modifying(flushAutomatically = true)
    @Query("""
            update ClientMessage m
               set m.status = :readStatus
             where m.company.id = :companyId
               and m.client.id = :clientId
               and m.channel = :channel
               and m.direction = :direction
               and m.status in (:unreadStatuses)
               and ((m.sentAt is not null and m.sentAt <= :readAt)
                    or (m.sentAt is null and m.createdAt <= :readAt))
            """)
    int markGuestOutboundMessagesRead(
            @Param("companyId") Long companyId,
            @Param("clientId") Long clientId,
            @Param("channel") MessageChannel channel,
            @Param("direction") MessageDirection direction,
            @Param("unreadStatuses") List<MessageStatus> unreadStatuses,
            @Param("readStatus") MessageStatus readStatus,
            @Param("readAt") Instant readAt);

    @Modifying
    @Query("delete from ClientMessage m where m.createdAt < :cutoff")
    int deleteAllByCreatedAtBefore(@Param("cutoff") Instant cutoff);
}
