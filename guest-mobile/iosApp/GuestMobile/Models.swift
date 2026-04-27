import Foundation

struct GuestUserModel: Identifiable, Codable {
    let id: String
    let email: String
    let firstName: String
    let lastName: String
    let phone: String?
    let language: String?
    /// e.g. `/api/guest/profile/picture` when set
    let profilePicturePath: String?
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
    /// When false, session bookings complete with pay-at-venue (no online payment step).
    let requireOnlinePayment: Bool?

    enum CodingKeys: String, CodingKey {
        case id = "companyId"
        case name = "companyName"
        case description = "publicDescription"
        case city = "publicCity"
        case phone = "publicPhone"
        case status
        case companyAddress
        case employeeSelectionStep
        case requireOnlinePayment
    }

    init(
        id: String,
        name: String,
        description: String?,
        city: String?,
        phone: String?,
        status: String?,
        companyAddress: String?,
        employeeSelectionStep: Bool? = nil,
        requireOnlinePayment: Bool? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.city = city
        self.phone = phone
        self.status = status
        self.companyAddress = companyAddress
        self.employeeSelectionStep = employeeSelectionStep
        self.requireOnlinePayment = requireOnlinePayment
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
        self.requireOnlinePayment = try c.decodeIfPresent(Bool.self, forKey: .requireOnlinePayment)
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
    let notifyMessagesEnabled: Bool
    let notifyRemindersEnabled: Bool
    let linkedCompanyOptions: [GuestLinkedCompanyOptionModel]

    init(
        guestUser: GuestUserModel,
        companyId: String?,
        companyName: String?,
        linkedCompanyId: String?,
        linkedCompanyName: String?,
        batchPaymentEnabled: Bool,
        notifyMessagesEnabled: Bool = true,
        notifyRemindersEnabled: Bool = true,
        linkedCompanyOptions: [GuestLinkedCompanyOptionModel]
    ) {
        self.guestUser = guestUser
        self.companyId = companyId
        self.companyName = companyName
        self.linkedCompanyId = linkedCompanyId
        self.linkedCompanyName = linkedCompanyName
        self.batchPaymentEnabled = batchPaymentEnabled
        self.notifyMessagesEnabled = notifyMessagesEnabled
        self.notifyRemindersEnabled = notifyRemindersEnabled
        self.linkedCompanyOptions = linkedCompanyOptions
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.guestUser = try container.decode(GuestUserModel.self, forKey: .guestUser)
        self.companyId = try container.decodeIfPresent(String.self, forKey: .companyId)
        self.companyName = try container.decodeIfPresent(String.self, forKey: .companyName)
        self.linkedCompanyId = try container.decodeIfPresent(String.self, forKey: .linkedCompanyId)
        self.linkedCompanyName = try container.decodeIfPresent(String.self, forKey: .linkedCompanyName)
        self.batchPaymentEnabled = try container.decodeIfPresent(Bool.self, forKey: .batchPaymentEnabled) ?? false
        self.notifyMessagesEnabled = try container.decodeIfPresent(Bool.self, forKey: .notifyMessagesEnabled) ?? true
        self.notifyRemindersEnabled = try container.decodeIfPresent(Bool.self, forKey: .notifyRemindersEnabled) ?? true
        self.linkedCompanyOptions = try container.decodeIfPresent([GuestLinkedCompanyOptionModel].self, forKey: .linkedCompanyOptions) ?? []
    }
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
    let notifyMessagesEnabled: Bool?
    let notifyRemindersEnabled: Bool?

    init(
        firstName: String,
        lastName: String,
        email: String,
        phone: String?,
        language: String,
        companyId: String?,
        linkedCompanyId: String?,
        batchPaymentEnabled: Bool?,
        notifyMessagesEnabled: Bool? = nil,
        notifyRemindersEnabled: Bool? = nil
    ) {
        self.firstName = firstName
        self.lastName = lastName
        self.email = email
        self.phone = phone
        self.language = language
        self.companyId = companyId
        self.linkedCompanyId = linkedCompanyId
        self.batchPaymentEnabled = batchPaymentEnabled
        self.notifyMessagesEnabled = notifyMessagesEnabled
        self.notifyRemindersEnabled = notifyRemindersEnabled
    }
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
    let totalUses: Int?
    let validUntil: String?
    let validityDays: Int?
    let status: String?
    let sessionTypeId: String?
    let sessionTypeName: String?
    let autoRenews: Bool?
    /// Short human-friendly ticket code like "CM8-425-001".
    let displayCode: String?
    let priceGross: Double?
    let currency: String?

    enum CodingKeys: String, CodingKey {
        case id = "entitlementId"
        case name = "productName"
        case type = "entitlementType"
        case remainingUses
        case totalUses
        case validUntil
        case validityDays
        case status
        case sessionTypeId
        case sessionTypeName
        case autoRenews
        case displayCode
        case priceGross
        case currency
    }
}

struct OrderModel: Identifiable, Codable, Hashable {
    let id: String
    let status: String
    let paymentMethod: String
    let totalGross: Double
    let currency: String?
    let paidAt: String?
    let createdAt: String?
    let referenceCode: String?
    let productName: String?
    let productType: String?
    /// Bill payment status: "PAID" / "PAYMENT_PENDING" / nil (no bill).
    let billPaymentStatus: String?

    enum CodingKeys: String, CodingKey {
        case id = "orderId"
        case status
        case paymentMethod = "paymentMethodType"
        case totalGross
        case currency
        case paidAt
        case createdAt
        case referenceCode
        case productName
        case productType
        case billPaymentStatus
    }
}

struct NotificationModel: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let body: String
    let notificationType: String?
    let readAt: String?
    let createdAt: String?
    let payloadJson: String?

    enum CodingKeys: String, CodingKey {
        case id = "notificationId"
        case title
        case body
        case notificationType
        case readAt
        case createdAt
        case payloadJson
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
    let promoText: String?
    let validityDays: Int?
    let usageLimit: Int?

    enum CodingKeys: String, CodingKey {
        case id = "productId"
        case name, productType, priceGross, currency, sessionTypeId, sessionTypeName, bookable, description, durationMinutes, promoText, validityDays, usageLimit
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


struct GuestInboxThreadModel: Codable, Hashable {
    let clientId: Int64
    let clientFirstName: String
    let clientLastName: String
    let lastPreview: String?
    let lastSenderName: String?
    let lastSentAt: String?
    let messageCount: Int64
    let unreadCount: Int64
}

struct GuestInboxAttachmentModel: Codable, Hashable {
    let id: Int64
    let clientFileId: Int64
    let fileName: String
    let contentType: String?
    let sizeBytes: Int64
    let uploadedAt: String?
}

extension GuestInboxAttachmentModel {
    var isImageAttachment: Bool {
        let lowercasedName = fileName.lowercased()
        return (contentType ?? "").lowercased().hasPrefix("image/") ||
            lowercasedName.hasSuffix(".png") ||
            lowercasedName.hasSuffix(".jpg") ||
            lowercasedName.hasSuffix(".jpeg") ||
            lowercasedName.hasSuffix(".gif") ||
            lowercasedName.hasSuffix(".webp") ||
            lowercasedName.hasSuffix(".bmp") ||
            lowercasedName.hasSuffix(".heic") ||
            lowercasedName.hasSuffix(".heif")
    }

    var isPdfAttachment: Bool {
        let lowercasedName = fileName.lowercased()
        return (contentType ?? "").lowercased().contains("pdf") || lowercasedName.hasSuffix(".pdf")
    }

    var fileTypeLabel: String {
        if isPdfAttachment { return "PDF" }
        if isImageAttachment { return "IMAGE" }
        let ext = fileName.split(separator: ".").last.map(String.init)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return ext.isEmpty ? "FILE" : ext.uppercased()
    }

    var formattedSize: String? {
        guard sizeBytes > 0 else { return nil }
        let bytes = Double(sizeBytes)
        let kb = 1024.0
        let mb = kb * 1024.0
        if bytes >= mb {
            return String(format: "%.1f MB", bytes / mb)
        }
        if bytes >= kb {
            return String(format: "%.0f KB", bytes / kb)
        }
        return "\(sizeBytes) B"
    }
}

struct GuestInboxMessageModel: Identifiable, Codable, Hashable {
    let id: Int64
    let clientId: Int64
    let clientFirstName: String
    let clientLastName: String
    let recipient: String
    let channel: String
    let direction: String
    let status: String
    let subject: String?
    let body: String
    let externalMessageId: String?
    let errorMessage: String?
    let senderName: String?
    let senderPhone: String?
    let sentAt: String?
    let createdAt: String
    let attachments: [GuestInboxAttachmentModel]?
}

struct GuestInboxSendPayload: Codable {
    let companyId: String
    let body: String
    let attachmentFileIds: [Int64]
}

struct GuestInboxUploadedAttachmentModel: Codable, Hashable {
    let id: Int64
    let fileName: String
    let contentType: String?
    let sizeBytes: Int64
    let uploadedAt: String?
}

struct DeviceTokenPayload: Codable {
    let platform: String
    let pushToken: String
    let locale: String?
}

struct DeviceTokenResponseModel: Codable {
    let registered: Bool
}

struct TenantDashboardModel: Hashable {
    let tenant: TenantModel
    let upcomingBookings: [BookingModel]
    let entitlements: [EntitlementModel]
    let orders: [OrderModel]
    let notifications: [NotificationModel]
    let products: [ProductModel]
    let inboxThread: GuestInboxThreadModel?
    let inboxMessages: [GuestInboxMessageModel]
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
    let entitlementId: String
    let name: String
    let type: String
    let tenantName: String
    let remainingUses: Int?
    let totalUses: Int?
    let validUntil: String?
    let validityDays: Int?
    let sessionTypeId: String?
    let autoRenews: Bool
    let displayCode: String?
    let priceGross: Double?
    let currency: String?
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
    let promoText: String?
    let validityDays: Int?
    let usageLimit: Int?
}

struct WalletOrderCardModel: Identifiable, Hashable {
    let id: String
    let companyId: String
    let orderId: String
    let tenantName: String
    let referenceCode: String?
    let productName: String?
    let productType: String?
    let paymentMethod: String
    let totalGross: Double
    let currency: String
    let status: String
    let billPaymentStatus: String?
    let createdAt: String?
    let paidAt: String?
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
