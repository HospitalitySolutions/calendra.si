package com.example.app.course;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseRepository extends JpaRepository<Course, Long> {
    List<Course> findAllByCompanyIdOrderBySortOrderAscIdAsc(Long companyId);
    List<Course> findAllByCompanyIdAndActiveTrueAndGuestVisibleTrueAndStatusOrderBySortOrderAscIdAsc(Long companyId, CourseStatus status);
    Optional<Course> findByIdAndCompanyId(Long id, Long companyId);
    Optional<Course> findByGuestProductIdAndCompanyId(Long guestProductId, Long companyId);
}
