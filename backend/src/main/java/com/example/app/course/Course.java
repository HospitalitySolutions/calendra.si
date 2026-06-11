package com.example.app.course;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.guest.model.GuestProduct;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "courses")
public class Course extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @OneToOne
    @JoinColumn(name = "guest_product_id")
    private GuestProduct guestProduct;

    @Column(nullable = false, length = 180)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CourseMediaType mediaType = CourseMediaType.VIDEO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private CourseStatus status = CourseStatus.DRAFT;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal priceGross = BigDecimal.ZERO;

    @Column(nullable = false, length = 3)
    private String currency = "EUR";

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean guestVisible = true;

    @Column(nullable = false)
    private int sortOrder = 0;

    @Column(length = 512)
    private String thumbnailUrl;

    @Column(name = "bunny_library_id", length = 96)
    private String bunnyLibraryId;

    @Column(name = "bunny_library_name", length = 180)
    private String bunnyLibraryName;

    @Column(name = "bunny_video_id", length = 96)
    private String bunnyVideoId;

    @Column(name = "bunny_storage_path", length = 512)
    private String bunnyStoragePath;

    @Column(name = "bunny_cdn_url", length = 512)
    private String bunnyCdnUrl;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "file_name", length = 255)
    private String fileName;

    @Column(name = "content_type", length = 120)
    private String contentType;

    @Column(columnDefinition = "TEXT")
    private String metadataJson;
}
