import Foundation
import ImageIO
import UIKit

@MainActor
final class AppStore: ObservableObject {
    @Published var user = GuestUserModel(id: "guest-1", email: "ana@example.com", firstName: "Ana", lastName: "Novak", phone: nil, language: "sl")
    @Published var currentTenant = TenantModel(id: "tenant-northside", name: "Northside Fitness", description: "Premium training studio", city: "Ljubljana", phone: nil, status: "ACTIVE", companyAddress: nil, requireOnlinePayment: true)
    @Published var linkedTenants: [TenantModel] = []
    @Published var selectedTenantId: String?
    @Published var tenantDashboards: [String: TenantDashboardModel] = [:]
    @Published var errorMessage: String?
    @Published var noticeMessage: String?
    @Published var isLoading = false
    @Published var didRequestLogout = false
    @Published var pendingInboxOpenCompanyId: String?

    private let api: GuestApiClient
    private let usePreviewData: Bool
    private let preview = PreviewStore()
    private var pendingPushToken: String?
    private var inboxAttachmentCache: [String: URL] = [:]

    init(environment: AppEnvironment = .shared) {
        self.api = GuestApiClient(baseURL: environment.baseURL)
        self.usePreviewData = environment.usePreviewData
        if environment.usePreviewData {
            applyPreview()
        }
    }

    var activeTenantIds: [String] {
        linkedTenants.map(\.id)
    }

    var bookingCards: [BookingCardModel] {
        activeTenantIds
            .flatMap { tenantId -> [BookingCardModel] in
                guard let dashboard = tenantDashboards[tenantId] else { return [] }
                return dashboard.upcomingBookings.map {
                    BookingCardModel(
                        id: "\(tenantId)-\($0.id)",
                        title: $0.title,
                        startsAt: $0.startsAt,
                        status: $0.status,
                        tenantName: dashboard.tenant.name,
                        tenantCity: dashboard.tenant.city,
                        tenantPhone: dashboard.tenant.phone
                    )
                }
            }
            .sorted { $0.startsAt < $1.startsAt }
    }

    var accessCards: [AccessCardModel] {
        activeTenantIds.flatMap { tenantId -> [AccessCardModel] in
            guard let dashboard = tenantDashboards[tenantId] else { return [] }
            return dashboard.entitlements.map {
                AccessCardModel(
                    id: "\(tenantId)-\($0.id)",
                    companyId: tenantId,
                    name: $0.name,
                    type: $0.type,
                    tenantName: dashboard.tenant.name,
                    remainingUses: $0.remainingUses,
                    validUntil: $0.validUntil,
                    sessionTypeId: $0.sessionTypeId,
                    autoRenews: $0.autoRenews ?? false
                )
            }
        }
    }

    var walletOffers: [WalletOfferModel] {
        activeTenantIds.flatMap { tenantId -> [WalletOfferModel] in
            guard let dashboard = tenantDashboards[tenantId] else { return [] }
            return dashboard.products
                .filter { !$0.bookable || $0.productType == "PACK" || $0.productType == "MEMBERSHIP" || $0.productType == "CLASS_TICKET" }
                .map {
                    WalletOfferModel(
                        id: "\(tenantId)-\($0.id)",
                        companyId: tenantId,
                        productId: $0.id,
                        name: $0.name,
                        productType: $0.productType,
                        priceGross: $0.priceGross,
                        currency: $0.currency,
                        description: $0.description,
                        sessionTypeName: $0.sessionTypeName
                    )
                }
        }
        .sorted { $0.name < $1.name }
    }

    var serviceOptions: [ServiceOptionModel] {
        activeTenantIds
            .flatMap { tenantId -> [ServiceOptionModel] in
                guard let dashboard = tenantDashboards[tenantId] else { return [] }
                return dashboard.products.compactMap { product in
                    guard product.bookable, let sessionTypeId = product.sessionTypeId else { return nil }
                    return ServiceOptionModel(
                        id: "\(tenantId)-\(product.id)",
                        companyId: tenantId,
                        tenantName: dashboard.tenant.name,
                        tenantCity: dashboard.tenant.city,
                        tenantPhone: dashboard.tenant.phone,
                        productId: product.id,
                        name: product.name,
                        description: product.description,
                        priceGross: product.priceGross,
                        currency: product.currency,
                        durationMinutes: product.durationMinutes,
                        sessionTypeId: sessionTypeId
                    )
                }
            }
            .sorted { $0.name < $1.name }
    }

    var entitlements: [EntitlementModel] {
        activeTenantIds.flatMap { tenantDashboards[$0]?.entitlements ?? [] }
    }

    var orders: [OrderModel] {
        activeTenantIds.flatMap { tenantDashboards[$0]?.orders ?? [] }
    }

    var notifications: [NotificationModel] {
        activeTenantIds.flatMap { tenantDashboards[$0]?.notifications ?? [] }
    }

    var upcomingBookings: [BookingModel] {
        activeTenantIds.flatMap { tenantDashboards[$0]?.upcomingBookings ?? [] }
    }

    func setTenantFilter(_ tenantId: String?) {
        selectedTenantId = tenantId
        currentTenant = linkedTenants.first(where: { $0.id == tenantId }) ?? linkedTenants.first ?? currentTenant
    }

    func consumePendingInboxOpen() {
        pendingInboxOpenCompanyId = nil
    }

    func logout() {
        linkedTenants = []
        selectedTenantId = nil
        tenantDashboards = [:]
        pendingInboxOpenCompanyId = nil
        didRequestLogout = true
    }

    func updatePushToken(_ token: String) async {
        guard !usePreviewData else { return }
        pendingPushToken = token
        await registerPushTokenIfPossible()
    }

    func login(email: String, password: String) async {
        guard !usePreviewData else { applyPreview(); return }
        await run {
            let session = try await self.api.login(email: email, password: password)
            self.applySession(session)
            try await self.refreshAllTenantsThrowing()
        }
    }

    func loginWithApple(idToken: String) async {
        guard !usePreviewData else { applyPreview(); return }
        await run {
            let session = try await self.api.loginWithApple(idToken: idToken)
            self.applySession(session)
            try await self.refreshAllTenantsThrowing()
        }
    }

    func joinTenant(code: String) async {
        guard !usePreviewData else { applyPreview(); return }
        await run {
            let tenant = try await self.api.resolveTenant(code: code)
            try await self.api.joinTenant(code: code)
            if self.linkedTenants.contains(where: { $0.id == tenant.companyId }) == false {
                self.linkedTenants.append(
                    TenantModel(
                        id: tenant.companyId,
                        name: tenant.companyName,
                        description: tenant.publicDescription,
                        city: tenant.publicCity,
                        phone: tenant.publicPhone,
                        status: "ACTIVE",
                        companyAddress: nil
                    )
                )
            }
            try await self.refreshTenant(companyId: tenant.companyId)
        }
    }

    func refreshAllTenants() async {
        await run {
            try await self.refreshAllTenantsThrowing()
        }
    }

    func refreshTenant(companyId: String) async throws {
        let dashboard = try await fetchTenantDashboard(companyId: companyId)
        tenantDashboards[companyId] = dashboard
        if let idx = linkedTenants.firstIndex(where: { $0.id == companyId }) {
            linkedTenants[idx] = dashboard.tenant
        } else {
            linkedTenants.append(dashboard.tenant)
        }
        currentTenant = linkedTenants.first(where: { $0.id == selectedTenantId }) ?? linkedTenants.first(where: { $0.id == companyId }) ?? linkedTenants.first ?? dashboard.tenant
    }


    func loadInboxMessages(companyId: String) async {
        guard !usePreviewData else { return }
        await run {
            let items = try await api.inboxMessages(companyId: companyId)
            let refreshedThread = (try await api.inboxThreads(companyId: companyId)).first
            if let dashboard = tenantDashboards[companyId] {
                tenantDashboards[companyId] = TenantDashboardModel(
                    tenant: dashboard.tenant,
                    upcomingBookings: dashboard.upcomingBookings,
                    entitlements: dashboard.entitlements,
                    orders: dashboard.orders,
                    notifications: dashboard.notifications,
                    products: dashboard.products,
                    inboxThread: refreshedThread ?? dashboard.inboxThread.map { GuestInboxThreadModel(clientId: $0.clientId, clientFirstName: $0.clientFirstName, clientLastName: $0.clientLastName, lastPreview: $0.lastPreview, lastSenderName: $0.lastSenderName, lastSentAt: $0.lastSentAt, messageCount: $0.messageCount, unreadCount: 0) },
                    inboxMessages: items
                )
            }
        }
    }

    func sendInboxMessage(companyId: String, body: String) async {
        guard !usePreviewData else { return }
        await run {
            _ = try await api.sendInboxMessage(companyId: companyId, body: body)
            try await refreshTenant(companyId: companyId)
            let items = try await api.inboxMessages(companyId: companyId)
            let refreshedThread = (try await api.inboxThreads(companyId: companyId)).first
            if let dashboard = tenantDashboards[companyId] {
                tenantDashboards[companyId] = TenantDashboardModel(
                    tenant: dashboard.tenant,
                    upcomingBookings: dashboard.upcomingBookings,
                    entitlements: dashboard.entitlements,
                    orders: dashboard.orders,
                    notifications: dashboard.notifications,
                    products: dashboard.products,
                    inboxThread: refreshedThread ?? dashboard.inboxThread,
                    inboxMessages: items
                )
            }
        }
    }

    func downloadInboxAttachment(companyId: String, attachment: GuestInboxAttachmentModel) async throws -> URL {
        let cacheKey = inboxAttachmentCacheKey(companyId: companyId, attachment: attachment)
        if let cached = inboxAttachmentCache[cacheKey], FileManager.default.fileExists(atPath: cached.path) {
            return cached
        }
        if usePreviewData {
            let name = attachment.fileName.isEmpty ? "attachment-\(attachment.id).txt" : attachment.fileName
            let target = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + name)
            let previewText = "Preview attachment for \(name)"
            if let data = previewText.data(using: .utf8) {
                try data.write(to: target)
            }
            inboxAttachmentCache[cacheKey] = target
            return target
        }
        let url = try await api.downloadInboxAttachment(companyId: companyId, attachmentId: attachment.id, suggestedFileName: attachment.fileName)
        inboxAttachmentCache[cacheKey] = url
        return url
    }

    func loadInboxAttachmentThumbnail(companyId: String, attachment: GuestInboxAttachmentModel, maxPixelSize: CGFloat = 720) async throws -> UIImage? {
        guard attachment.isImageAttachment else { return nil }
        let url = try await downloadInboxAttachment(companyId: companyId, attachment: attachment)
        return try await Task.detached(priority: .utility) {
            let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
            guard let source = CGImageSourceCreateWithURL(url as CFURL, sourceOptions) else {
                return UIImage(contentsOfFile: url.path)
            }
            let thumbnailOptions = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
            ] as CFDictionary
            guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions) else {
                return UIImage(contentsOfFile: url.path)
            }
            return UIImage(cgImage: cgImage)
        }.value
    }

    private func inboxAttachmentCacheKey(companyId: String, attachment: GuestInboxAttachmentModel) -> String {
        "\(companyId)|\(attachment.id)|\(attachment.fileName)|\(attachment.sizeBytes)"
    }

    func refreshOnAppBecameActive() async {
        guard !usePreviewData, !linkedTenants.isEmpty else { return }
        await refreshAllTenants()
    }

    func openInboxFromPush(companyId: String) async {
        let normalized = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return }
        selectedTenantId = normalized
        if let tenant = linkedTenants.first(where: { $0.id == normalized }) {
            currentTenant = tenant
        }
        pendingInboxOpenCompanyId = normalized
        guard linkedTenants.contains(where: { $0.id == normalized }) else { return }
        do {
            try await refreshTenant(companyId: normalized)
            await loadInboxMessages(companyId: normalized)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func handlePaymentReturn(url: URL) {
        guard url.scheme == "calendra-guest", url.host == "paypal" else { return }
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let status = components?.queryItems?.first(where: { $0.name == "status" })?.value?.lowercased()
        let message = components?.queryItems?.first(where: { $0.name == "message" })?.value

        switch status {
        case "success":
            noticeMessage = "PayPal payment confirmed."
            Task { await refreshOnAppBecameActive() }
        case "cancelled", "canceled":
            noticeMessage = "PayPal checkout canceled."
        case "error":
            errorMessage = message ?? "PayPal payment failed."
        default:
            break
        }
    }

    func loadAvailability(companyId: String, sessionTypeId: String, date: Date, consultantId: String? = nil) async throws -> [AvailabilitySlotModel] {
        let day = Self.dayFormatter.string(from: date)
        if usePreviewData { return preview.availability(for: sessionTypeId, date: day) }
        return try await api.availability(companyId: companyId, sessionTypeId: sessionTypeId, date: day, consultantId: consultantId).slots
    }

    func loadConsultants(companyId: String, sessionTypeId: String) async throws -> [ConsultantSummaryModel] {
        if usePreviewData { return [] }
        return try await api.consultants(companyId: companyId, sessionTypeId: sessionTypeId)
    }

    func createOrder(companyId: String, productId: String, slotId: String?, paymentMethod: String, consultantId: String? = nil) async throws -> CheckoutResponseModel {
        let response: CheckoutResponseModel
        if usePreviewData {
            let completeImmediately = paymentMethod == "ENTITLEMENT" || paymentMethod == "PAY_AT_VENUE"
            response = CheckoutResponseModel(
                orderId: UUID().uuidString,
                paymentMethodType: paymentMethod,
                status: completeImmediately ? "PAID" : "PENDING",
                checkoutUrl: paymentMethod == "CARD" ? "https://checkout.stripe.example/session/mock" : (paymentMethod == "PAYPAL" ? "https://www.sandbox.paypal.com/checkoutnow?token=mock" : nil),
                bankTransfer: paymentMethod == "BANK_TRANSFER" ? BankTransferInstructionsModel(amount: 59, currency: "EUR", referenceCode: "ORD-2026-00014", instructions: "Use the reference code when paying.") : nil,
                nextAction: completeImmediately ? "COMPLETE" : ((paymentMethod == "CARD" || paymentMethod == "PAYPAL") ? "REDIRECT" : "SHOW_INSTRUCTIONS"),
                paymentIntentClientSecret: nil,
                customerId: nil,
                customerEphemeralKeySecret: nil,
                merchantDisplayName: nil
            )
        } else {
            response = try await api.createOrder(companyId: companyId, productId: productId, slotId: slotId, paymentMethodType: paymentMethod, consultantId: consultantId)
        }
        try await refreshTenant(companyId: companyId)
        return response
    }

    func loadProfileSettings(companyId: String?) async throws -> GuestProfileSettingsModel {
        let settings: GuestProfileSettingsModel
        if usePreviewData {
            settings = preview.profileSettings(companyId: companyId)
        } else {
            settings = try await api.profileSettings(companyId: companyId)
        }
        user = settings.guestUser
        return settings
    }

    func updateProfileSettings(_ payload: UpdateGuestProfileSettingsPayload) async throws -> GuestProfileSettingsModel {
        let settings: GuestProfileSettingsModel
        if usePreviewData {
            settings = preview.updateProfileSettings(payload)
        } else {
            settings = try await api.updateProfileSettings(payload)
        }
        user = settings.guestUser
        return settings
    }

    func toggleAutoRenew(companyId: String, entitlementId: String, autoRenews: Bool) async throws {
        guard !usePreviewData else { return }
        _ = try await api.toggleAutoRenew(companyId: companyId, entitlementId: entitlementId, autoRenews: autoRenews)
        try await refreshTenant(companyId: companyId)
    }

    func matchingEntitlements(companyId: String, sessionTypeId: String) -> [AccessCardModel] {
        accessCards.filter { $0.companyId == companyId && ($0.sessionTypeId == nil || $0.sessionTypeId == sessionTypeId) }
    }

    private func fetchTenantDashboard(companyId: String) async throws -> TenantDashboardModel {
        if usePreviewData {
            return preview.dashboard(for: companyId)
        }
        let home = try await api.home(companyId: companyId)
        let wallet = try await api.wallet(companyId: companyId)
        let history = try await api.history(companyId: companyId)
        let feed = try await api.notifications(companyId: companyId)
        let catalog = try await api.products(companyId: companyId)
        _ = history
        let inboxThread = (try await api.inboxThreads(companyId: companyId)).first
        return TenantDashboardModel(
            tenant: home.tenant,
            upcomingBookings: home.upcomingBookings,
            entitlements: wallet.entitlements,
            orders: wallet.orders,
            notifications: feed.items,
            products: catalog,
            inboxThread: inboxThread,
            inboxMessages: tenantDashboards[companyId]?.inboxMessages ?? []
        )
    }

    private func refreshAllTenantsThrowing() async throws {
        if !usePreviewData {
            let profile = try await api.me()
            user = profile.guestUser
            linkedTenants = profile.linkedTenants
        }
        for tenant in linkedTenants {
            try await refreshTenant(companyId: tenant.id)
        }
        if let selectedTenantId, let tenant = linkedTenants.first(where: { $0.id == selectedTenantId }) {
            currentTenant = tenant
        }
    }

    private func applySession(_ session: GuestSessionModel) {
        api.updateToken(session.token)
        user = session.guestUser
        linkedTenants = session.linkedTenants
        currentTenant = session.linkedTenants.first(where: { $0.id == selectedTenantId }) ?? session.linkedTenants.first ?? currentTenant
        tenantDashboards = [:]
        pendingInboxOpenCompanyId = selectedTenantId
        didRequestLogout = false
        Task { await registerPushTokenIfPossible() }
    }

    private func registerPushTokenIfPossible() async {
        guard !usePreviewData else { return }
        guard let token = pendingPushToken, !token.isEmpty else { return }
        do {
            let locale = Locale.current.language.languageCode?.identifier ?? Locale.current.identifier
            _ = try await api.registerDeviceToken(platform: "IOS", pushToken: token, locale: locale)
        } catch {
            // Keep the token cached and try again after the next successful session refresh.
        }
    }

    private func applyPreview() {
        user = preview.user
        linkedTenants = preview.linkedTenants
        currentTenant = linkedTenants.first(where: { $0.id == selectedTenantId }) ?? linkedTenants.first ?? currentTenant
        tenantDashboards = Dictionary(uniqueKeysWithValues: linkedTenants.map { ($0.id, preview.dashboard(for: $0.id)) })
        pendingInboxOpenCompanyId = selectedTenantId
        didRequestLogout = false
    }

    private func run(_ operation: @escaping @MainActor () async throws -> Void) async {
        isLoading = true
        defer { isLoading = false }
        do {
            try await operation()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
