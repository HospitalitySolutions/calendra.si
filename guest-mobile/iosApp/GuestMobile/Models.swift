import Foundation

struct GuestUserModel: Identifiable, Codable {
    let id: String
    let email: String
    let firstName: String
    let lastName: String
    let phone: String?
    let language: String?
}

struct TenantModel: Identifiable, Hashable, Codable {
    let id: String
    let name: String
    let description: String?
    let city: String?
    let phone: String?
    let status: String?
    let companyAddress: String?
    let employeeSelectionStep: Bool?

    enum CodingKeys: String, CodingKey {
        case id = "companyId"
        case name = "companyName"
        case description = "publicDescription"
        case city = "publicCity"
        case phone = "publicPhone"
        case status
        case companyAddress
        case employeeSelectionStep
    }

    init(id: String, name: String, description: String?, city: String?, phone: String?, status: String?, companyAddress: String?, employeeSelectionStep: Bool? = nil) {
        self.id = id
        self.name = name
        self.description = description
        self.city = city
        self.phone = phone
        self.status = status
        self.companyAddress = companyAddress
        self.employeeSelectionStep = employeeSelectionStep
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.name = try c.decode(String.self, forKey: .name)
        self.description = try c.decodeIfPresent(String.self, forKey: .description)
        self.city = try c.decodeIfPresent(String.self, forKey: .city)
        self.phone = try c.decodeIfPresent(String.self, forKey: .phone)
        self.status = try c.decodeIfPresent(String.self, forKey: .status)
        self.companyAddress = try c.decodeIfPresent(String.self, forKey: .companyAddress)
        self.employeeSelectionStep = try c.decodeIfPresent(Bool.self, forKey: .employeeSelectionStep)
    }
}

struct ConsultantSummaryModel: Identifiable, Hashable, Codable {
    let id: String
    let firstName: String
    let lastName: String
    let email: String?

    var fullName: String {
        let trimmed = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? email ?? "Employee" : trimmed
    }
}

struct GuestSessionModel: Codable {
    let token: String
    let guestUser: GuestUserModel
    let linkedTenants: [TenantModel]
}

struct GuestProfileModel: Codable {
    let guestUser: GuestUserModel
    let linkedTenants: [TenantModel]
}

struct GuestLinkedCompanyOptionModel: Identifiable, Codable, Hashable {
    let id: String
    let name: String
}

struct GuestProfileSettingsModel: Codable {
    let guestUser: GuestUserModel
    let companyId: String?
    let companyName: String?
    let linkedCompanyId: String?
    let linkedCompanyName: String?
    let batchPaymentEnabled: Bool
    let linkedCompanyOptions: [GuestLinkedCompanyOptionModel]
}

struct UpdateGuestProfileSettingsPayload: Codable {
    let firstName: String
    let lastName: String
    let email: String
    let phone: String?
    let language: String
    let companyId: String?
    let linkedCompanyId: String?
    let batchPaymentEnabled: Bool?
}

struct BookingModel: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let startsAt: String
    let status: String

    enum CodingKeys: String, CodingKey {
        case id = "bookingId"
        case title = "sessionTypeName"
        case startsAt
        case status = "bookingStatus"
    }
}

struct EntitlementModel: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let type: String
    let remainingUses: Int?
    let validUntil: String?
    let status: String?
    let sessionTypeId: String?
    let sessionTypeName: String?
    let autoRenews: Bool?

    enum CodingKeys: String, CodingKey {
        case id = "entitlementId"
        case name = "productName"
        case type = "entitlementType"
        case remainingUses
        case validUntil
        case status
        case sessionTypeId
        case sessionTypeName
        case autoRenews
    }
}

struct OrderModel: Identifiable, Codable, Hashable {
    let id: String
    let status: String
    let paymentMethod: String
    let totalGross: Double
    let paidAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "orderId"
        case status
        case paymentMethod = "paymentMethodType"
        case totalGross
        case paidAt
    }
}

struct NotificationModel: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let body: String
    let notificationType: String?
    let readAt: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "notificationId"
        case title
        case body
        case notificationType
        case readAt
        case createdAt
    }
}

struct ProductModel: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let productType: String
    let priceGross: Double
    let currency: String
    let sessionTypeId: String?
    let sessionTypeName: String?
    let bookable: Bool
    let description: String?
    let durationMinutes: Int?

    enum CodingKeys: String, CodingKey {
        case id = "productId"
        case name, productType, priceGross, currency, sessionTypeId, sessionTypeName, bookable, description, durationMinutes
    }
}

struct AvailabilitySlotModel: Identifiable, Codable, Hashable {
    let id: String
    let startsAt: String
    let endsAt: String
    let available: Bool

    enum CodingKeys: String, CodingKey {
        case id = "slotId"
        case startsAt, endsAt, available
    }
}

struct AvailabilityResponseModel: Codable {
    let sessionTypeId: String
    let date: String
    let slots: [AvailabilitySlotModel]
}

struct TenantLookupModel: Codable {
    let companyId: String
    let companyName: String
    let publicDescription: String?
    let publicCity: String?
    let publicPhone: String?
    let joinMethod: String
    let canJoin: Bool
}

struct HomePayloadModel: Codable {
    let tenant: TenantModel
    let upcomingBookings: [BookingModel]
    let activeEntitlements: [EntitlementModel]
    let pendingOrders: [OrderModel]
}

struct WalletPayloadModel: Codable {
    let entitlements: [EntitlementModel]
    let orders: [OrderModel]
}

struct ToggleAutoRenewPayload: Codable {
    let autoRenews: Bool
}

struct ToggleAutoRenewResponseModel: Codable {
    let entitlementId: String
    let autoRenews: Bool
}

struct NotificationsPayloadModel: Codable {
    let items: [NotificationModel]
}

struct TenantDashboardModel: Hashable {
    let tenant: TenantModel
    let upcomingBookings: [BookingModel]
    let entitlements: [EntitlementModel]
    let orders: [OrderModel]
    let notifications: [NotificationModel]
    let products: [ProductModel]
}

struct BookingCardModel: Identifiable, Hashable {
    let id: String
    let title: String
    let startsAt: String
    let status: String
    let tenantName: String
    let tenantCity: String?
    let tenantPhone: String?
}

struct AccessCardModel: Identifiable, Hashable {
    let id: String
    let companyId: String
    let name: String
    let type: String
    let tenantName: String
    let remainingUses: Int?
    let validUntil: String?
    let sessionTypeId: String?
    let autoRenews: Bool
}

struct WalletOfferModel: Identifiable, Hashable {
    let id: String
    let companyId: String
    let productId: String
    let name: String
    let productType: String
    let priceGross: Double
    let currency: String
    let description: String?
    let sessionTypeName: String?
}

struct ServiceOptionModel: Identifiable, Hashable {
    let id: String
    let companyId: String
    let tenantName: String
    let tenantCity: String?
    let tenantPhone: String?
    let productId: String
    let name: String
    let description: String?
    let priceGross: Double
    let currency: String
    let durationMinutes: Int?
    let sessionTypeId: String
}

struct JoinTenantPayload: Codable {
    let joinMethod: String
    let tenantCode: String?
    let inviteCode: String?
    let companyId: String?
}

struct LoginPayload: Codable {
    let email: String
    let password: String
}

struct SocialTokenPayload: Codable {
    let idToken: String
}

struct TenantCodePayload: Codable {
    let tenantCode: String
}

struct CreateOrderPayload: Codable {
    let companyId: String
    let productId: String
    let slotId: String?
    let paymentMethodType: String
    let consultantId: String?

    init(companyId: String, productId: String, slotId: String?, paymentMethodType: String, consultantId: String? = nil) {
        self.companyId = companyId
        self.productId = productId
        self.slotId = slotId
        self.paymentMethodType = paymentMethodType
        self.consultantId = consultantId
    }
}

struct CheckoutPayload: Codable {
    let paymentMethodType: String
    let saveCard: Bool
    let useSavedPaymentMethodId: String?
}

struct BankTransferInstructionsModel: Codable, Hashable {
    let amount: Double
    let currency: String
    let referenceCode: String
    let instructions: String
}

struct CheckoutResponseModel: Codable, Hashable {
    let orderId: String
    let paymentMethodType: String
    let status: String
    let checkoutUrl: String?
    let bankTransfer: BankTransferInstructionsModel?
    let nextAction: String
    let paymentIntentClientSecret: String?
    let customerId: String?
    let customerEphemeralKeySecret: String?
    let merchantDisplayName: String?
}
