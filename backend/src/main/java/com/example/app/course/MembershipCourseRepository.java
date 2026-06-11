package com.example.app.course;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MembershipCourseRepository extends JpaRepository<MembershipCourse, Long> {
    @Query("""
            SELECT mc
            FROM MembershipCourse mc
            JOIN mc.course c
            WHERE mc.company.id = :companyId
              AND mc.membershipProduct.id = :membershipProductId
            ORDER BY c.title ASC
            """)
    List<MembershipCourse> findAllByMembershipProductIdAndCompanyIdOrderByCourseTitleAsc(
            @Param("membershipProductId") Long membershipProductId,
            @Param("companyId") Long companyId);

    @Query("""
            SELECT mc
            FROM MembershipCourse mc
            JOIN mc.course c
            WHERE mc.company.id = :companyId
              AND mc.membershipProduct.id IN :membershipProductIds
            ORDER BY c.title ASC
            """)
    List<MembershipCourse> findAllByMembershipProductIdInAndCompanyId(
            @Param("membershipProductIds") Collection<Long> membershipProductIds,
            @Param("companyId") Long companyId);

    long countByCourseId(Long courseId);

    @Modifying
    @Query("DELETE FROM MembershipCourse mc WHERE mc.company.id = :companyId AND mc.membershipProduct.id = :membershipProductId")
    void deleteAllByMembershipProductIdAndCompanyId(@Param("membershipProductId") Long membershipProductId, @Param("companyId") Long companyId);
}
