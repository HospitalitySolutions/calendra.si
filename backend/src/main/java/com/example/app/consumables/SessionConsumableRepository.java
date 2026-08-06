package com.example.app.consumables;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Collection;
import java.util.List;

public interface SessionConsumableRepository extends JpaRepository<SessionConsumable, Long> {
    @Query("SELECT sc FROM SessionConsumable sc JOIN FETCH sc.consumable c LEFT JOIN FETCH c.category WHERE sc.company.id = :companyId AND sc.bookingGroupKey = :groupKey ORDER BY c.name ASC")
    List<SessionConsumable> findByCompanyIdAndBookingGroupKey(@Param("companyId") Long companyId, @Param("groupKey") String groupKey);

    boolean existsByCompanyIdAndBookingGroupKey(Long companyId, String bookingGroupKey);

    @Modifying
    @Query("DELETE FROM SessionConsumable sc WHERE sc.company.id = :companyId AND sc.bookingGroupKey = :groupKey")
    void deleteByCompanyIdAndBookingGroupKey(@Param("companyId") Long companyId, @Param("groupKey") String groupKey);

    @Query("SELECT sc FROM SessionConsumable sc JOIN FETCH sc.consumable c WHERE sc.company.id = :companyId AND sc.bookingGroupKey IN :groupKeys")
    List<SessionConsumable> findByCompanyIdAndBookingGroupKeyIn(@Param("companyId") Long companyId, @Param("groupKeys") Collection<String> groupKeys);

    @Modifying(flushAutomatically = true)
    @Query(
            value = """
                    UPDATE session_consumable
                       SET session_booking_id = :anchorBookingId,
                           updated_at = CURRENT_TIMESTAMP
                     WHERE company_id = :companyId
                       AND session_booking_id IN (:removedBookingIds)
                    """,
            nativeQuery = true
    )
    int reanchorBeforeBookingDeletion(
            @Param("companyId") Long companyId,
            @Param("anchorBookingId") Long anchorBookingId,
            @Param("removedBookingIds") Collection<Long> removedBookingIds
    );
}
