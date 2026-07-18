package com.example.app.waitlist;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaitlistRequestWindowRepository extends JpaRepository<WaitlistRequestWindow, Long> {
    List<WaitlistRequestWindow> findAllByRequestIdOrderByDateAscDayOfWeekAscTimeFromAsc(Long requestId);
    List<WaitlistRequestWindow> findAllByRequestIdIn(Collection<Long> requestIds);
    void deleteAllByRequestId(Long requestId);
}
