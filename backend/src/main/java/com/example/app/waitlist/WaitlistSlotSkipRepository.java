package com.example.app.waitlist;

import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaitlistSlotSkipRepository extends JpaRepository<WaitlistSlotSkip, Long> {
    boolean existsByRequestIdAndSlotStartAndEmployeeId(Long requestId, LocalDateTime slotStart, Long employeeId);
}
