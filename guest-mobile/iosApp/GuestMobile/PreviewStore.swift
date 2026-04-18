import Foundation

@MainActor
final class PreviewStore: ObservableObject {
    @Published var user = GuestUserModel(
        id: "guest-1",
        email: "ana@example.com",
        firstName: "Ana",
        lastName: "Novak",
        phone: "+38640123456",
        language: "sl"
    )

    @Published var linkedTenants: [TenantModel] = [
        TenantModel(id: "tenant-northside", name: "Northside Fitness", description: "Premium training studio", city: "Ljubljana", phone: "+38640111222", status: "ACTIVE", companyAddress: "Dunajska cesta 1, 1000 Ljubljana"),
        TenantModel(id: "tenant-yoga", name: "Blue River Yoga", description: "Studio classes and private sessions", city: "Celje", phone: "+38640111333", status: "ACTIVE", companyAddress: nil)
    ]

    func dashboard(for companyId: String) -> TenantDashboardModel {
        let tenant = linkedTenants.first(where: { $0.id == companyId }) ?? linkedTenants[0]
        if companyId == "tenant-yoga" {
            return TenantDashboardModel(
                tenant: tenant,
                upcomingBookings: [
                    BookingModel(id: "booking-2", title: "Yoga Flow", startsAt: "2026-04-20T08:00:00Z", status: "CONFIRMED")
                ],
                entitlements: [
                    EntitlementModel(id: "ent-2", name: "Yoga 10 Pack", type: "PACK", remainingUses: 7, validUntil: "2026-06-11T00:00:00Z", status: "ACTIVE")
                ],
                orders: [
                    OrderModel(id: "order-2", status: "PAID", paymentMethod: "CARD", totalGross: 24.0, paidAt: "2026-04-10T08:00:00Z")
                ],
                notifications: [
                    NotificationModel(id: "notif-2", title: "Reminder: Yoga Flow", body: "Your class starts tomorrow at 08:00.", notificationType: "BOOKING_REMINDER", readAt: nil, createdAt: "2026-04-16T08:00:00Z")
                ],
                products: [
                    ProductModel(id: "prod-yoga-ticket", name: "Yoga Flow", productType: "CLASS_TICKET", priceGross: 12.0, currency: "EUR", sessionTypeId: "session-yoga", sessionTypeName: "Yoga Flow", bookable: true, description: "Group class for mobility, breathwork, and full-body flow.", durationMinutes: 60),
                    ProductModel(id: "prod-yoga-private", name: "Private Yoga", productType: "SESSION_SINGLE", priceGross: 38.0, currency: "EUR", sessionTypeId: "session-yoga-private", sessionTypeName: "Private Yoga", bookable: true, description: "One-on-one guided session tailored to your goals.", durationMinutes: 45)
                ]
            )
        }

        return TenantDashboardModel(
            tenant: tenant,
            upcomingBookings: [
                BookingModel(id: "booking-1", title: "Personal Training", startsAt: "2026-04-18T18:30:00Z", status: "CONFIRMED"),
                BookingModel(id: "booking-3", title: "Recovery Session", startsAt: "2026-04-23T17:00:00Z", status: "CONFIRMED")
            ],
            entitlements: [
                EntitlementModel(id: "ent-1", name: "5 PT Pack", type: "PACK", remainingUses: 4, validUntil: "2026-06-01T00:00:00Z", status: "ACTIVE"),
                EntitlementModel(id: "ent-3", name: "Monthly Gym", type: "MEMBERSHIP", remainingUses: nil, validUntil: "2026-05-01T00:00:00Z", status: "ACTIVE")
            ],
            orders: [
                OrderModel(id: "order-1", status: "PENDING", paymentMethod: "BANK_TRANSFER", totalGross: 59.0, paidAt: nil)
            ],
            notifications: [
                NotificationModel(id: "notif-1", title: "Reminder: Personal Training", body: "Your session starts tomorrow at 18:30.", notificationType: "BOOKING_REMINDER", readAt: nil, createdAt: "2026-04-16T08:00:00Z")
            ],
            products: [
                ProductModel(id: "prod-pt-single", name: "Personal Training", productType: "SESSION_SINGLE", priceGross: 45.0, currency: "EUR", sessionTypeId: "session-pt", sessionTypeName: "Personal Training", bookable: true, description: "Focused one-on-one coaching session in the studio.", durationMinutes: 45),
                ProductModel(id: "prod-recovery", name: "Recovery Session", productType: "SESSION_SINGLE", priceGross: 35.0, currency: "EUR", sessionTypeId: "session-recovery", sessionTypeName: "Recovery Session", bookable: true, description: "Mobility and recovery work to reset after intense training.", durationMinutes: 30),
                ProductModel(id: "prod-pack-5", name: "5 Session Pack", productType: "PACK", priceGross: 180.0, currency: "EUR", sessionTypeId: "session-pt", sessionTypeName: "Personal Training", bookable: false, description: "Best value bundle for regular personal training.", durationMinutes: 45)
            ]
        )
    }

    func availability(for sessionTypeId: String, date: String) -> [AvailabilitySlotModel] {
        [
            AvailabilitySlotModel(id: "slot-1", startsAt: "\(date)T08:00:00Z", endsAt: "\(date)T08:45:00Z", available: true),
            AvailabilitySlotModel(id: "slot-2", startsAt: "\(date)T10:00:00Z", endsAt: "\(date)T10:45:00Z", available: true),
            AvailabilitySlotModel(id: "slot-3", startsAt: "\(date)T18:30:00Z", endsAt: "\(date)T19:15:00Z", available: true)
        ]
    }
}
