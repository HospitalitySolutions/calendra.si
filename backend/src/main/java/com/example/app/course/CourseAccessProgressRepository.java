package com.example.app.course;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseAccessProgressRepository extends JpaRepository<CourseAccessProgress, Long> {
    Optional<CourseAccessProgress> findByEntitlementIdAndCourseId(Long entitlementId, Long courseId);
    List<CourseAccessProgress> findAllByEntitlementIdAndCourseIdIn(Long entitlementId, Collection<Long> courseIds);
    void deleteAllByCourseId(Long courseId);
}
