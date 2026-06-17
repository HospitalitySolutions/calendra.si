package com.example.app.guest.model;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BookingPushReminderRepository extends JpaRepository<BookingPushReminder, Long> {
    Optional<BookingPushReminder> findByBookingIdAndGuestUserId(Long bookingId, Long guestUserId);

    List<BookingPushReminder> findAllByBookingIdAndStatus(Long bookingId, BookingPushReminderStatus status);

    List<BookingPushReminder> findAllByGuestUserIdAndStatus(Long guestUserId, BookingPushReminderStatus status);

    List<BookingPushReminder> findAllByStatusAndDueAtLessThanEqualOrderByDueAtAscIdAsc(
            BookingPushReminderStatus status,
            LocalDateTime dueAt,
            Pageable pageable
    );
}
