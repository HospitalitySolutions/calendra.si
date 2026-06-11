package com.example.app.course;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.guest.model.GuestProduct;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "membership_courses", uniqueConstraints = {
        @UniqueConstraint(name = "uk_membership_course", columnNames = {"membership_product_id", "course_id"})
})
public class MembershipCourse extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false)
    @JoinColumn(name = "membership_product_id", nullable = false)
    private GuestProduct membershipProduct;

    @ManyToOne(optional = false)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;
}
