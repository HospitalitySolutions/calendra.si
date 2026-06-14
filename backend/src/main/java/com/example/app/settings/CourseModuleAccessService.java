package com.example.app.settings;

import com.example.app.course.CourseRepository;
import com.example.app.guest.model.GuestProductRepository;
import com.example.app.guest.model.ProductType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CourseModuleAccessService {
    private final AppSettingRepository settings;
    private final CourseRepository courses;
    private final GuestProductRepository products;

    public CourseModuleAccessService(
            AppSettingRepository settings,
            CourseRepository courses,
            GuestProductRepository products
    ) {
        this.settings = settings;
        this.courses = courses;
        this.products = products;
    }

    public boolean isEnabled(Long companyId) {
        if (companyId == null) return true;
        return settings.findByCompanyIdAndKey(companyId, SettingKey.COURSES_ENABLED)
                .map(AppSetting::getValue)
                .map(value -> !"false".equalsIgnoreCase(String.valueOf(value).trim()))
                .orElse(true);
    }

    public void assertEnabled(Long companyId) {
        if (!isEnabled(companyId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Courses are disabled for this tenant.");
        }
    }

    public void assertCanDisable(Long companyId) {
        if (companyId == null) return;
        boolean hasCourses = courses.existsByCompanyId(companyId);
        boolean hasActiveCourseAccess = products.existsByCompanyIdAndProductTypeAndActiveTrue(companyId, ProductType.COURSE);
        if (hasCourses || hasActiveCourseAccess) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Tečaji can be turned off only after all Tečaji are deleted and all active Course access products are archived."
            );
        }
    }
}
