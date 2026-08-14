package com.example.app.location;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.guest.catalog.GuestCatalogService;
import com.example.app.guest.common.GuestDtos;
import com.example.app.widget.PublicBookingWidgetController;
import com.example.app.widget.PublicBookingWidgetService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Read-only public storefront assembled from the same sources used by the booking
 * widget and Calendra Connect catalog. This endpoint intentionally exposes only
 * display metadata; creating orders/purchases remains behind the authenticated
 * Guest/Customer APIs.
 */
@Service
public class PublicStorefrontService {
    private static final List<String> STOREFRONT_PRODUCT_TYPES = List.of("PACK", "MEMBERSHIP", "GIFT_CARD", "COURSE");

    private final PublicLocationDirectoryService directory;
    private final CompanyRepository companies;
    private final PublicBookingWidgetService bookingWidget;
    private final GuestCatalogService guestCatalog;

    public PublicStorefrontService(
            PublicLocationDirectoryService directory,
            CompanyRepository companies,
            PublicBookingWidgetService bookingWidget,
            GuestCatalogService guestCatalog
    ) {
        this.directory = directory;
        this.companies = companies;
        this.bookingWidget = bookingWidget;
        this.guestCatalog = guestCatalog;
    }

    @Transactional(readOnly = true)
    public StorefrontResponse storefront(String slug, HttpServletRequest request) {
        PublicLocationDirectoryService.DirectoryLocationResponse location = directory.findBySlug(slug)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider location not found."));
        Company company = companies.findByTenantCodeIgnoreCase(location.tenantSlug())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Provider not found."));

        List<PublicBookingWidgetController.WidgetServiceResponse> widgetServices = location.publicBookingEnabled()
                ? bookingWidget.services(location.tenantSlug(), location.locationId(), request)
                : List.of();
        List<ServiceResponse> services = widgetServices.stream()
                .map(PublicStorefrontService::toServiceResponse)
                .toList();

        List<ProductResponse> products = guestCatalog.publicProducts(company.getId(), location.locationId()).stream()
                .filter(product -> storefrontProductType(product.productType()))
                .map(PublicStorefrontService::toProductResponse)
                .toList();

        List<TeamMemberResponse> team = location.publicBookingEnabled()
                ? bookingWidget.storefrontConsultants(location.tenantSlug(), location.locationId(), request).stream()
                        .filter(consultant -> consultant != null && consultant.id() != null
                                && consultant.name() != null && !consultant.name().isBlank())
                        .map(consultant -> new TeamMemberResponse(consultant.id(), consultant.name().trim()))
                        .toList()
                : List.of();

        return new StorefrontResponse(location, services, products, team);
    }

    private static boolean storefrontProductType(String raw) {
        if (raw == null) return false;
        return STOREFRONT_PRODUCT_TYPES.contains(raw.trim().toUpperCase(Locale.ROOT));
    }

    private static ServiceResponse toServiceResponse(PublicBookingWidgetController.WidgetServiceResponse service) {
        return new ServiceResponse(
                service.id(),
                service.name(),
                service.description(),
                service.durationMinutes(),
                service.priceLabel(),
                service.priceGross() == null ? null : service.priceGross().doubleValue(),
                service.maxParticipantsPerSession(),
                service.widgetGroupBookingEnabled(),
                service.serviceGroupId(),
                service.serviceGroupName(),
                service.serviceGroupSortOrder(),
                service.serviceSortOrder()
        );
    }

    private static ProductResponse toProductResponse(GuestDtos.ProductResponse product) {
        return new ProductResponse(
                product.productId(),
                product.name(),
                product.productType(),
                product.priceGross(),
                product.currency(),
                product.description(),
                product.promoText(),
                product.validityDays(),
                product.usageLimit(),
                product.bookable(),
                product.voucherFaceValueGross(),
                product.voucherSessionTypeNames() == null ? List.of() : product.voucherSessionTypeNames()
        );
    }

    public record StorefrontResponse(
            PublicLocationDirectoryService.DirectoryLocationResponse location,
            List<ServiceResponse> services,
            List<ProductResponse> products,
            List<TeamMemberResponse> team
    ) {}

    public record ServiceResponse(
            Long id,
            String name,
            String description,
            Integer durationMinutes,
            String priceLabel,
            Double priceGross,
            Integer maxParticipantsPerSession,
            boolean groupBooking,
            Long serviceGroupId,
            String serviceGroupName,
            Integer serviceGroupSortOrder,
            int serviceSortOrder
    ) {}

    public record ProductResponse(
            String productId,
            String name,
            String productType,
            double priceGross,
            String currency,
            String description,
            String promoText,
            Integer validityDays,
            Integer usageLimit,
            boolean bookable,
            Double voucherFaceValueGross,
            List<String> voucherSessionTypeNames
    ) {}

    public record TeamMemberResponse(Long id, String name) {}
}
