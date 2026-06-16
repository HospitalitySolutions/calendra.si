package com.example.app.course;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CourseAccessProgressRepository extends JpaRepository<CourseAccessProgress, Long> {
    List<CourseAccessProgress> findAllByEntitlement_Id(Long entitlementId);
    Optional<CourseAccessProgress> findByEntitlement_IdAndCourse_Id(Long entitlementId, Long courseId);

    @Modifying
    @Query("delete from CourseAccessProgress p where p.course.id = :courseId")
    void deleteAllByCourseId(@Param("courseId") Long courseId);
}

