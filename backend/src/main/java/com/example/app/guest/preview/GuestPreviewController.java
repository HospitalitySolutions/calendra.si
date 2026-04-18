package com.example.app.guest.preview;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/guest/preview")
public class GuestPreviewController {
    @GetMapping("/session")
    public GuestPreviewDtos.GuestSessionResponse session() {
        return GuestPreviewService.session();
    }

    @GetMapping("/profile")
    public GuestPreviewDtos.GuestProfileResponse profile() {
        return GuestPreviewService.profile();
    }

    @GetMapping("/tenant/{tenantCode}")
    public GuestPreviewDtos.TenantLookupResponse tenant(@PathVariable String tenantCode) {
        return GuestPreviewService.tenantLookup(tenantCode);
    }

    @GetMapping("/home/{companyId}")
    public GuestPreviewDtos.HomeResponse home(@PathVariable String companyId) {
        return GuestPreviewService.home(companyId);
    }

    @GetMapping("/products")
    public List<GuestPreviewDtos.ProductResponse> products(@RequestParam(defaultValue = "tenant-northside") String companyId) {
        return GuestPreviewService.products(companyId);
    }

    @GetMapping("/wallet")
    public GuestPreviewDtos.WalletResponse wallet(@RequestParam(defaultValue = "tenant-northside") String companyId) {
        return GuestPreviewService.wallet(companyId);
    }

    @GetMapping("/history")
    public List<GuestPreviewDtos.BookingHistoryItemResponse> history() {
        return GuestPreviewService.history();
    }

    @GetMapping("/notifications")
    public GuestPreviewDtos.NotificationsResponse notifications(@RequestParam(defaultValue = "tenant-northside") String companyId) {
        return GuestPreviewService.notifications(companyId);
    }
}
