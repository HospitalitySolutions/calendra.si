import Foundation

@MainActor
final class AppStore: ObservableObject {
    @Published var user = GuestUserModel(id: "guest-1", email: "ana@example.com", firstName: "Ana", lastName: "Novak", phone: nil, language: "sl")
    @Published var currentTenant = TenantModel(id: "tenant-northside", name: "Northside Fitness", description: "Premium training studio", city: "Ljubljana", phone: nil, status: "ACTIVE", companyAddress: nil)
    @Published var linkedTenants: [TenantModel] = []
    @Published var selectedTenantId: String?
    @Published var tenantDashboards: [String: TenantDashboardModel] = [:]
    @Published var errorMessage: String?
    @Published var noticeMessage: String?
    @Published var isLoading = false
    @Published var didRequestLogout = false

    private let api: GuestApiClient
    private let usePreviewData: Bool
    private let preview = PreviewStore()

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

    func logout() {
        linkedTenants = []
        selectedTenantId = nil
        tenantDashboards = [:]
        didRequestLogout = true
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
        currentTenant = linkedTenants.first ?? dashboard.tenant
    }

    func refreshOnAppBecameActive() async {
        guard !usePreviewData, !linkedTenants.isEmpty else { return }
        await refreshAllTenants()
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
            response = CheckoutResponseModel(
                orderId: UUID().uuidString,
                paymentMethodType: paymentMethod,
                status: paymentMethod == "ENTITLEMENT" ? "PAID" : "PENDING",
                checkoutUrl: paymentMethod == "CARD" ? "https://checkout.stripe.example/session/mock" : (paymentMethod == "PAYPAL" ? "https://www.sandbox.paypal.com/checkoutnow?token=mock" : nil),
                bankTransfer: paymentMethod == "BANK_TRANSFER" ? BankTransferInstructionsModel(amount: 59, currency: "EUR", referenceCode: "ORD-2026-00014", instructions: "Use the reference code when paying.") : nil,
                nextAction: paymentMethod == "ENTITLEMENT" ? "COMPLETE" : ((paymentMethod == "CARD" || paymentMethod == "PAYPAL") ? "REDIRECT" : "SHOW_INSTRUCTIONS"),
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
        return TenantDashboardModel(
            tenant: home.tenant,
            upcomingBookings: home.upcomingBookings,
            entitlements: wallet.entitlements,
            orders: wallet.orders,
            notifications: feed.items,
            products: catalog
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
    }

    private func applySession(_ session: GuestSessionModel) {
        api.updateToken(session.token)
        user = session.guestUser
        linkedTenants = session.linkedTenants
        selectedTenantId = nil
        currentTenant = session.linkedTenants.first ?? currentTenant
        tenantDashboards = [:]
        didRequestLogout = false
    }

    private func applyPreview() {
        user = preview.user
        linkedTenants = preview.linkedTenants
        selectedTenantId = nil
        currentTenant = linkedTenants.first ?? currentTenant
        tenantDashboards = Dictionary(uniqueKeysWithValues: linkedTenants.map { ($0.id, preview.dashboard(for: $0.id)) })
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
