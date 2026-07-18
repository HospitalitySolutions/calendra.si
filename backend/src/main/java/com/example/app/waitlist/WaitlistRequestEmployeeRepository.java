package com.example.app.waitlist;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaitlistRequestEmployeeRepository extends JpaRepository<WaitlistRequestEmployee, Long> {
    List<WaitlistRequestEmployee> findAllByRequestId(Long requestId);
    List<WaitlistRequestEmployee> findAllByRequestIdIn(Collection<Long> requestIds);
    void deleteAllByRequestId(Long requestId);
}
