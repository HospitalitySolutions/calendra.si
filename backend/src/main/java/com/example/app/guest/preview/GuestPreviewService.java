package com.example.app.guest.preview;

import java.util.List;

final class GuestPreviewService {
    private GuestPreviewService() {}

    static GuestPreviewDtos.GuestSessionResponse session() {
        return new GuestPreviewDtos.GuestSessionResponse(
                "preview-token",
                new GuestPreviewDtos.GuestUserResponse(
                        "guest-1",
                        "ana@example.com",
                        "Ana",
                        "Novak",
                        "+38640123456",
                        "sl"
                ),
                List.of(
                        northside(),
                        blueRiver()
                )
        );
    }

    static GuestPreviewDtos.GuestProfileResponse profile() {
        GuestPreviewDtos.GuestSessionResponse session = session();
        return new GuestPreviewDtos.GuestProfileResponse(session.guestUser(), session.linkedTenants());
    }

    static GuestPreviewDtos.TenantLookupResponse tenantLookup(String tenantCode) {
        return new GuestPreviewDtos.TenantLookupResponse(
                "tenant-northside",
                "Northside Fitness",
                "Premium training studio",
                "Ljubljana",
                "+38640111222",
                "TENANT_CODE",
                tenantCode != null && !tenantCode.isBlank()
        );
    }

    static GuestPreviewDtos.HomeResponse home(String companyId) {
        GuestPreviewDtos.TenantSummaryResponse tenant = "tenant-yoga".equals(companyId) ? blueRiver() : northside();
        return new GuestPreviewDtos.HomeResponse(
                tenant,
                "tenant-yoga".equals(companyId)
                        ? List.of(
                                new GuestPreviewDtos.UpcomingBookingResponse("booking-2", "Yoga Flow", "2026-04-20T08:00:00Z", "CONFIRMED")
                        )
                        : List.of(
                                new GuestPreviewDtos.UpcomingBookingResponse("booking-1", "Personal Training", "2026-04-18T18:30:00Z", "CONFIRMED"),
                                new GuestPreviewDtos.UpcomingBookingResponse("booking-3", "Recovery Session", "2026-04-23T17:00:00Z", "CONFIRMED")
                        ),
                "tenant-yoga".equals(companyId)
                        ? List.of(
                                new GuestPreviewDtos.EntitlementResponse("ent-2", "Yoga 10 Pack", "PACK", 7, "2026-06-11T00:00:00Z", "ACTIVE")
                        )
                        : List.of(
                                new GuestPreviewDtos.EntitlementResponse("ent-1", "5 PT Pack", "PACK", 4, "2026-06-01T00:00:00Z", "ACTIVE"),
                                new GuestPreviewDtos.EntitlementResponse("ent-3", "Monthly Gym", "MEMBERSHIP", null, "2026-05-01T00:00:00Z", "ACTIVE")
                        ),
                List.of(
                        new GuestPreviewDtos.PendingOrderResponse("order-1", "PENDING", "BANK_TRANSFER", 59.0, "ORD-2026-00014")
                )
        );
    }

    static List<GuestPreviewDtos.ProductResponse> products(String companyId) {
        if ("tenant-yoga".equals(companyId)) {
            return List.of(
                    new GuestPreviewDtos.ProductResponse("prod-yoga-ticket", "Yoga Flow", "CLASS_TICKET", 12.0, "EUR", "session-yoga", "Yoga Flow", true, "Group class for mobility, breathwork, and full-body flow.", 60),
                    new GuestPreviewDtos.ProductResponse("prod-yoga-private", "Private Yoga", "SESSION_SINGLE", 38.0, "EUR", "session-yoga-private", "Private Yoga", true, "One-on-one guided session tailored to your goals.", 45)
            );
        }
        return List.of(
                new GuestPreviewDtos.ProductResponse("prod-pt-single", "Personal Training", "SESSION_SINGLE", 45.0, "EUR", "session-pt", "Personal Training", true, "Focused one-on-one coaching session in the studio.", 45),
                new GuestPreviewDtos.ProductResponse("prod-recovery", "Recovery Session", "SESSION_SINGLE", 35.0, "EUR", "session-recovery", "Recovery Session", true, "Mobility and recovery work to reset after intense training.", 30),
                new GuestPreviewDtos.ProductResponse("prod-pack-5", "5 Session Pack", "PACK", 180.0, "EUR", "session-pt", "Personal Training", false, "Best value bundle for regular personal training.", 45),
                new GuestPreviewDtos.ProductResponse("prod-membership", "Monthly Membership", "MEMBERSHIP", 59.0, "EUR", null, null, false, "Unlimited gym access during staffed hours.", null)
        );
    }

    static GuestPreviewDtos.WalletResponse wallet(String companyId) {
        return new GuestPreviewDtos.WalletResponse(
                home(companyId).activeEntitlements(),
                List.of(
                        new GuestPreviewDtos.WalletOrderResponse("order-paid-1", "PAID", "CARD", 59.0, "2026-04-15T10:00:00Z"),
                        new GuestPreviewDtos.WalletOrderResponse("order-pending-1", "PENDING", "BANK_TRANSFER", 180.0, null)
                )
        );
    }

    static List<GuestPreviewDtos.BookingHistoryItemResponse> history() {
        return List.of(
                new GuestPreviewDtos.BookingHistoryItemResponse("booking-h1", "Personal Training", "2026-04-01T18:30:00Z", "COMPLETED"),
                new GuestPreviewDtos.BookingHistoryItemResponse("booking-h2", "Yoga Flow", "2026-03-28T08:00:00Z", "COMPLETED"),
                new GuestPreviewDtos.BookingHistoryItemResponse("booking-h3", "Gym Access", "2026-03-12T17:00:00Z", "CANCELLED")
        );
    }

    static GuestPreviewDtos.NotificationsResponse notifications(String companyId) {
        return new GuestPreviewDtos.NotificationsResponse(
                List.of(
                        new GuestPreviewDtos.NotificationResponse("notif-1", "BOOKING_REMINDER", "Reminder: " + ("tenant-yoga".equals(companyId) ? "Yoga Flow" : "Personal Training"), "Your upcoming session is confirmed.", null, "2026-04-16T08:00:00Z"),
                        new GuestPreviewDtos.NotificationResponse("notif-2", "PAYMENT_PENDING", "Payment pending", "Your bank transfer will activate the service once received.", null, "2026-04-15T10:00:00Z")
                )
        );
    }

    private static GuestPreviewDtos.TenantSummaryResponse northside() {
        return new GuestPreviewDtos.TenantSummaryResponse(
                "tenant-northside",
                "Northside Fitness",
                "Premium training studio",
                "Ljubljana",
                "+38640111222",
                "ACTIVE"
        );
    }

    private static GuestPreviewDtos.TenantSummaryResponse blueRiver() {
        return new GuestPreviewDtos.TenantSummaryResponse(
                "tenant-yoga",
                "Blue River Yoga",
                "Studio classes and private sessions",
                "Celje",
                "+38640111333",
                "ACTIVE"
        );
    }
}
