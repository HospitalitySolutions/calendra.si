package com.example.app.widget;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.session.BookingSlotHoldService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/public/widget/{tenantCode}/booking-holds")
public class PublicWidgetBookingSlotHoldController {
    private final CompanyRepository companies;
    private final BookingSlotHoldService holds;
    private final PublicBookingWidgetService widgetService;

    public PublicWidgetBookingSlotHoldController(
            CompanyRepository companies,
            BookingSlotHoldService holds,
            PublicBookingWidgetService widgetService
    ) {
        this.companies = companies;
        this.holds = holds;
        this.widgetService = widgetService;
    }

    @PostMapping
    public BookingSlotHoldService.HoldResponse create(
            @PathVariable String tenantCode,
            @RequestBody BookingSlotHoldService.HoldRequest request,
            HttpServletRequest httpRequest
    ) {
        Company company = requireCompany(tenantCode);
        widgetService.guardPublicWidgetRequest(company, httpRequest, true, "booking-hold");
        return holds.create(company.getId(), request);
    }

    @DeleteMapping("/{token}")
    public ResponseEntity<Void> release(
            @PathVariable String tenantCode,
            @PathVariable String token,
            HttpServletRequest httpRequest
    ) {
        Company company = requireCompany(tenantCode);
        widgetService.guardPublicWidgetRequest(company, httpRequest, false, "booking-hold-release");
        holds.release(company.getId(), token);
        return ResponseEntity.noContent().build();
    }

    private Company requireCompany(String tenantCode) {
        if (tenantCode == null || tenantCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking page not found.");
        }
        return companies.findByTenantCodeIgnoreCase(tenantCode.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Booking page not found."));
    }
}
