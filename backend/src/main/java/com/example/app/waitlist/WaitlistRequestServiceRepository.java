package com.example.app.waitlist;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaitlistRequestServiceRepository extends JpaRepository<WaitlistRequestService, Long> {
    @EntityGraph(attributePaths = {"service", "service.serviceGroup"})
    List<WaitlistRequestService> findAllByRequestIdOrderBySortOrderSnapshotAscIdAsc(Long requestId);

    @EntityGraph(attributePaths = {"service", "service.serviceGroup"})
    List<WaitlistRequestService> findAllByRequestIdIn(Collection<Long> requestIds);

    void deleteAllByRequestId(Long requestId);

    boolean existsByRequestIdAndServiceId(Long requestId, Long serviceId);
}
