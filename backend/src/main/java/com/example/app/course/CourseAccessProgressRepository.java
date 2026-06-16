package com.example.app.course;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CourseAccessProgressRepository extends JpaRepository<CourseAccessProgress, Long> {
    List<CourseAccessProgress> findAllByEntitlement_Id(Long entitlementId);
    Optional<CourseAccessProgress> findByEntitlement_IdAndCourse_Id(Long entitlementId, Long courseId);
}
