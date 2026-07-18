package com.example.app.waitlist;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaitlistEventRepository extends JpaRepository<WaitlistEvent, Long> {
    List<WaitlistEvent> findAllByRequestIdOrderByOccurredAtDescIdDesc(Long requestId);
}
