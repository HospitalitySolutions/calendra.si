import Foundation

@MainActor
final class PreviewStore: ObservableObject {
    @Published var user = GuestUserModel(
        id: "guest-1",
        email: "ana@example.com",
        firstName: "Ana",
        lastName: "Novak",
        phone: "+38640123456",
        language: "sl",
        profilePicturePath: nil
    )

    /// 1×1 PNG for preview profile picture downloads.
    private static let previewAvatarPNG = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2nX0kAAAAASUVORK5CYII=")!

    @Published var linkedTenants: [TenantModel] = [
        TenantModel(id: "tenant-northside", name: "Northside Fitness", description: "Premium training studio", city: "Ljubljana", phone: "+38640111222", status: "ACTIVE", companyAddress: "Dunajska cesta 1, 1000 Ljubljana", requireOnlinePayment: true),
        TenantModel(id: "tenant-yoga", name: "Blue River Yoga", description: "Studio classes and private sessions", city: "Celje", phone: "+38640111333", status: "ACTIVE", companyAddress: nil, requireOnlinePayment: true)
    ]

    private var linkedCompanyCatalog: [String: [GuestLinkedCompanyOptionModel]] = [
        "tenant-northside": [
            GuestLinkedCompanyOptionModel(id: "101", name: "Northside Corporate"),
            GuestLinkedCompanyOptionModel(id: "102", name: "Northside Wellness d.o.o.")
        ],
        "tenant-yoga": [
            GuestLinkedCompanyOptionModel(id: "201", name: "Blue River Studio"),
            GuestLinkedCompanyOptionModel(id: "202", name: "Yoga Partners d.o.o.")
        ]
    ]

    private struct TenantProfilePreference {
        var linkedCompanyId: String?
        var batchPaymentEnabled: Bool
        var notifyMessagesEnabled: Bool
        var notifyRemindersEnabled: Bool
    }

    private var tenantProfilePreferences: [String: TenantProfilePreference] = [
        "tenant-northside": TenantProfilePreference(linkedCompanyId: "101", batchPaymentEnabled: true, notifyMessagesEnabled: true, notifyRemindersEnabled: true),
        "tenant-yoga": TenantProfilePreference(linkedCompanyId: nil, batchPaymentEnabled: false, notifyMessagesEnabled: true, notifyRemindersEnabled: true)
    ]

    func profileSettings(companyId: String?) -> GuestProfileSettingsModel {
        let resolvedCompanyId = companyId ?? linkedTenants.first?.id
        let tenant = linkedTenants.first(where: { $0.id == resolvedCompanyId }) ?? linkedTenants.first
        let options = linkedCompanyCatalog[tenant?.id ?? ""] ?? []
        let preference = tenantProfilePreferences[tenant?.id ?? ""] ?? TenantProfilePreference(linkedCompanyId: nil, batchPaymentEnabled: false, notifyMessagesEnabled: true, notifyRemindersEnabled: true)
        let selectedCompany = options.first(where: { $0.id == preference.linkedCompanyId })
        return GuestProfileSettingsModel(
            guestUser: user,
            companyId: tenant?.id,
            companyName: tenant?.name,
            linkedCompanyId: selectedCompany?.id,
            linkedCompanyName: selectedCompany?.name,
            batchPaymentEnabled: preference.batchPaymentEnabled,
            notifyMessagesEnabled: preference.notifyMessagesEnabled,
            notifyRemindersEnabled: preference.notifyRemindersEnabled,
            linkedCompanyOptions: options
        )
    }

    func uploadProfilePicture() -> GuestProfileSettingsModel {
        user = GuestUserModel(
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            language: user.language,
            profilePicturePath: "/api/guest/profile/picture"
        )
        return profileSettings(companyId: linkedTenants.first?.id)
    }

    func downloadProfilePicturePreview() -> Data {
        Self.previewAvatarPNG
    }

    func updateProfileSettings(_ payload: UpdateGuestProfileSettingsPayload) -> GuestProfileSettingsModel {
        user = GuestUserModel(
            id: user.id,
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
            phone: payload.phone,
            language: payload.language,
            profilePicturePath: user.profilePicturePath
        )
        let companyId = payload.companyId ?? linkedTenants.first?.id ?? "tenant-northside"
        var pref = tenantProfilePreferences[companyId] ?? TenantProfilePreference(linkedCompanyId: nil, batchPaymentEnabled: false, notifyMessagesEnabled: true, notifyRemindersEnabled: true)
        pref.linkedCompanyId = payload.linkedCompanyId
        if let batchPaymentEnabled = payload.batchPaymentEnabled { pref.batchPaymentEnabled = batchPaymentEnabled }
        if let notifyMessages = payload.notifyMessagesEnabled { pref.notifyMessagesEnabled = notifyMessages }
        if let notifyReminders = payload.notifyRemindersEnabled { pref.notifyRemindersEnabled = notifyReminders }
        tenantProfilePreferences[companyId] = pref
        return profileSettings(companyId: companyId)
    }

    func dashboard(for companyId: String) -> TenantDashboardModel {
        let tenant = linkedTenants.first(where: { $0.id == companyId }) ?? linkedTenants[0]
        if companyId == "tenant-yoga" {
            return TenantDashboardModel(
                tenant: tenant,
                upcomingBookings: [
                    BookingModel(id: "booking-2", title: "Yoga Flow", startsAt: "2026-04-20T08:00:00Z", status: "CONFIRMED")
                ],
                entitlements: [
                    EntitlementModel(id: "ent-2", name: "Yoga 10 Pack", type: "PACK", remainingUses: 7, totalUses: 10, validUntil: "2026-06-11T00:00:00Z", validityDays: 180, status: "ACTIVE", sessionTypeId: "session-yoga", sessionTypeName: "Yoga Flow", autoRenews: false, displayCode: "YF99-007", priceGross: 99.0, currency: "EUR")
                ],
                orders: [
                    OrderModel(id: "order-2", status: "PAID", paymentMethod: "CARD", totalGross: 24.0, currency: "EUR", paidAt: "2026-04-10T08:00:00Z", createdAt: "2026-04-10T08:00:00Z", referenceCode: "ORD-2026-00011", productName: "Yoga Flow", productType: "CLASS_TICKET", billPaymentStatus: "PAID")
                ],
                notifications: [
                    NotificationModel(id: "notif-2", title: "Reminder: Yoga Flow", body: "Your class starts tomorrow at 08:00.", notificationType: "BOOKING_REMINDER", readAt: nil, createdAt: "2026-04-16T08:00:00Z", payloadJson: nil)
                ],
                products: [
                    ProductModel(id: "prod-yoga-ticket", name: "Yoga Flow", productType: "CLASS_TICKET", priceGross: 12.0, currency: "EUR", sessionTypeId: "session-yoga", sessionTypeName: "Yoga Flow", bookable: true, description: "Group class for mobility, breathwork, and full-body flow.", durationMinutes: 60, promoText: "Available now", validityDays: 30, usageLimit: nil),
                    ProductModel(id: "prod-yoga-pack", name: "Yoga 10 Pack", productType: "PACK", priceGross: 99.0, currency: "EUR", sessionTypeId: "session-yoga", sessionTypeName: "Yoga Flow", bookable: false, description: "Save with a ten-class bundle.", durationMinutes: 60, promoText: "Best value", validityDays: 180, usageLimit: 10)
                ],
                inboxThread: GuestInboxThreadModel(clientId: 2, clientFirstName: "Ana", clientLastName: "Novak", lastPreview: "Welcome to Blue River Yoga", lastSenderName: "Studio team", lastSentAt: "2026-04-16T08:00:00Z", messageCount: 1, unreadCount: 1),
                inboxMessages: [
                    GuestInboxMessageModel(id: 11, clientId: 2, clientFirstName: "Ana", clientLastName: "Novak", recipient: "ana@example.com", channel: "GUEST_APP", direction: "OUTBOUND", status: "SENT", subject: nil, body: "Welcome to Blue River Yoga", externalMessageId: nil, errorMessage: nil, senderName: "Studio team", senderPhone: nil, sentAt: "2026-04-16T08:00:00Z", createdAt: "2026-04-16T08:00:00Z", attachments: nil)
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
                EntitlementModel(id: "ent-1", name: "5 Session Pack", type: "PACK", remainingUses: 4, totalUses: 5, validUntil: "2026-06-01T00:00:00Z", validityDays: 120, status: "ACTIVE", sessionTypeId: "session-pt", sessionTypeName: "Personal Training", autoRenews: false, displayCode: "SP180-001", priceGross: 180.0, currency: "EUR"),
                EntitlementModel(id: "ent-3", name: "Monthly Membership", type: "MEMBERSHIP", remainingUses: nil, totalUses: nil, validUntil: "2026-05-01T00:00:00Z", validityDays: 30, status: "ACTIVE", sessionTypeId: nil, sessionTypeName: nil, autoRenews: true, displayCode: "MM59-003", priceGross: 59.0, currency: "EUR"),
                EntitlementModel(id: "ent-4", name: "Personal Training", type: "CLASS_TICKET", remainingUses: 1, totalUses: 1, validUntil: "2026-05-20T00:00:00Z", validityDays: 60, status: "ACTIVE", sessionTypeId: "session-pt", sessionTypeName: "Personal Training", autoRenews: false, displayCode: "PT45-012", priceGross: 45.0, currency: "EUR")
            ],
            orders: [
                OrderModel(id: "order-1", status: "PENDING", paymentMethod: "BANK_TRANSFER", totalGross: 180.0, currency: "EUR", paidAt: nil, createdAt: "2026-04-16T08:05:00Z", referenceCode: "ORD-2026-00023", productName: "5 Session Pack", productType: "PACK", billPaymentStatus: "PAYMENT_PENDING"),
                OrderModel(id: "order-paid-a", status: "PAID", paymentMethod: "CARD", totalGross: 59.0, currency: "EUR", paidAt: "2026-04-15T10:00:00Z", createdAt: "2026-04-15T09:58:00Z", referenceCode: "ORD-2026-00021", productName: "Monthly Membership", productType: "MEMBERSHIP", billPaymentStatus: "PAID"),
                OrderModel(id: "order-paid-b", status: "PAID", paymentMethod: "PAYPAL", totalGross: 45.0, currency: "EUR", paidAt: "2026-04-12T14:22:00Z", createdAt: "2026-04-12T14:21:00Z", referenceCode: "ORD-2026-00019", productName: "Personal Training", productType: "CLASS_TICKET", billPaymentStatus: "PAID")
            ],
            notifications: [
                NotificationModel(id: "notif-1", title: "Reminder: Personal Training", body: "Your session starts tomorrow at 18:30.", notificationType: "BOOKING_REMINDER", readAt: nil, createdAt: "2026-04-16T08:00:00Z", payloadJson: nil)
            ],
            products: [
                ProductModel(id: "prod-pt-single", name: "Personal Training", productType: "CLASS_TICKET", priceGross: 45.0, currency: "EUR", sessionTypeId: "session-pt", sessionTypeName: "Personal Training", bookable: true, description: "Focused one-on-one coaching session in the studio.", durationMinutes: 45, promoText: "Available now", validityDays: 60, usageLimit: nil),
                ProductModel(id: "prod-pack-5", name: "5 Session Pack", productType: "PACK", priceGross: 180.0, currency: "EUR", sessionTypeId: "session-pt", sessionTypeName: "Personal Training", bookable: false, description: "Best value bundle for regular personal training.", durationMinutes: 45, promoText: "Best value", validityDays: 120, usageLimit: 5),
                ProductModel(id: "prod-membership", name: "Monthly Membership", productType: "MEMBERSHIP", priceGross: 59.0, currency: "EUR", sessionTypeId: nil, sessionTypeName: nil, bookable: false, description: "Unlimited gym access during staffed hours.", durationMinutes: nil, promoText: "Popular", validityDays: 30, usageLimit: nil)
            ],
            inboxThread: GuestInboxThreadModel(clientId: 1, clientFirstName: "Ana", clientLastName: "Novak", lastPreview: "Can you confirm my visit?", lastSenderName: "Ana Novak", lastSentAt: "2026-04-16T08:00:00Z", messageCount: 2, unreadCount: 0),
            inboxMessages: [
                GuestInboxMessageModel(id: 1, clientId: 1, clientFirstName: "Ana", clientLastName: "Novak", recipient: "ana@example.com", channel: "GUEST_APP", direction: "OUTBOUND", status: "READ", subject: nil, body: "Welcome to Northside Fitness", externalMessageId: nil, errorMessage: nil, senderName: "Studio team", senderPhone: nil, sentAt: "2026-04-15T08:00:00Z", createdAt: "2026-04-15T08:00:00Z", attachments: nil),
                GuestInboxMessageModel(id: 2, clientId: 1, clientFirstName: "Ana", clientLastName: "Novak", recipient: "ana@example.com", channel: "GUEST_APP", direction: "INBOUND", status: "RECEIVED", subject: nil, body: "Can you confirm my visit?", externalMessageId: nil, errorMessage: nil, senderName: "Ana Novak", senderPhone: nil, sentAt: "2026-04-16T08:00:00Z", createdAt: "2026-04-16T08:00:00Z", attachments: nil)
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
