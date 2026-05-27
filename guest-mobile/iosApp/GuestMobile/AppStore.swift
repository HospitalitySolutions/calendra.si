import Foundation
import ImageIO
import UIKit

@MainActor
final class AppStore: ObservableObject {
    @Published var user = GuestUserModel(id: "guest-1", email: "ana@example.com", firstName: "Ana", lastName: "Novak", phone: nil, language: "sl", profilePicturePath: nil)
    @Published var currentTenant = TenantModel(id: "tenant-northside", name: "Northside Fitness", description: "Premium training studio", city: "Ljubljana", phone: nil, status: "ACTIVE", companyAddress: nil, requireOnlinePayment: true)
    @Published var linkedTenants: [TenantModel] = []
    @Published var selectedTenantId: String?
    @Published var walletSelectedTenantId: String?
    @Published var tenantDashboards: [String: TenantDashboardModel] = [:]
    @Published var errorMessage: String?
    @Published var noticeMessage: String?
    @Published var isLoading = false
    @Published var didRequestLogout = false
    @Published var pendingInboxOpenCompanyId: String?
    @Published var signupChallenge: SignupChallengeModel?
    @Published var lastPaymentReturnOrderId: String?
    @Published var lastPaymentReturnStatus: String?
    @Published var paymentReturnSequence: Int = 0

    private static let guestAppBellNotificationTypes: Set<String> = [
        "BOOKING_CONFIRMED",
        "BOOKING_RESCHEDULED",
        "BOOKING_CANCELLED",
        "BOOKING_REMINDER",
        "BOOKING_FOLLOW_UP"
    ]

    private let api: GuestApiClient
    private let usePreviewData: Bool
    private let preview = PreviewStore()
    private let authStore = GuestAuthKeychainStore()
    private var pendingPushToken: String?
    private var inboxAttachmentCache: [String: URL] = [:]
    private var bookingRealtimeTasks: [String: Task<Void, Never>] = [:]

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

    var guestAppNotificationUnreadCount: Int {
        activeTenantIds.reduce(into: 0) { partial, tenantId in
            let tenantUnread = tenantDashboards[tenantId]?.notifications.filter { notification in
                guard notification.readAt == nil else { return false }
                let type = notification.notificationType?.uppercased() ?? ""
                return Self.guestAppBellNotificationTypes.contains(type)
            }.count ?? 0
            partial += tenantUnread
        }
    }

    var inboxUnreadCount: Int {
        activeTenantIds.reduce(into: 0) { partial, tenantId in
            let tenantUnread = Int(tenantDashboards[tenantId]?.inboxThread?.unreadCount ?? 0)
            partial += max(0, tenantUnread)
        }
    }

    var bookingCards: [BookingCardModel] {
        activeTenantIds
            .flatMap { tenantId -> [BookingCardModel] in
                guard let dashboard = tenantDashboards[tenantId] else { return [] }
                func toCard(_ booking: BookingModel) -> BookingCardModel {
                    let selectedPhone = (dashboard.tenant.useEmployeeContact == true && (booking.employeePhone?.isEmpty == false))
                        ? booking.employeePhone
                        : dashboard.tenant.phone
                    return BookingCardModel(
                        id: "\(tenantId)-\(booking.id)",
                        bookingId: booking.id,
                        companyId: tenantId,
                        title: booking.title,
                        startsAt: booking.startsAt,
                        status: booking.status,
                        tenantName: dashboard.tenant.name,
                        tenantCity: dashboard.tenant.city,
                        tenantPhone: selectedPhone,
                        cardImageUrl: dashboard.tenant.cardImageUrl,
                        logoImageUrl: dashboard.tenant.logoImageUrl,
                        iconImageUrl: dashboard.tenant.iconImageUrl,
                        endsAt: booking.endsAt,
                        consultantName: booking.consultantName,
                        sessionTypeId: booking.sessionTypeId
                    )
                }
                var seen = Set<String>()
                return (dashboard.upcomingBookings + dashboard.bookingHistory)
                    .map(toCard)
                    .filter { seen.insert($0.bookingId).inserted }
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
                    entitlementId: $0.id,
                    name: $0.name,
                    type: $0.type,
                    tenantName: dashboard.tenant.name,
                    entitlementCode: $0.entitlementCode,
                    remainingUses: $0.remainingUses,
                    visitCount: $0.visitCount,
                    totalUses: $0.totalUses,
                    validUntil: $0.validUntil,
                    validityDays: $0.validityDays,
                    sessionTypeId: $0.sessionTypeId,
                    autoRenews: $0.autoRenews ?? false,
                    displayCode: $0.displayCode,
                    priceGross: $0.priceGross,
                    remainingValueGross: $0.remainingValueGross,
                    currency: $0.currency,
                    status: $0.status ?? "ACTIVE"
                )
            }
        }
    }

    var walletScopedTenantId: String? {
        if let walletSelectedTenantId, linkedTenants.contains(where: { $0.id == walletSelectedTenantId }) {
            return walletSelectedTenantId
        }
        return linkedTenants.first?.id
    }

    var walletScopedTenantName: String {
        guard
            let tenantId = walletScopedTenantId,
            let tenant = linkedTenants.first(where: { $0.id == tenantId })
        else { return "Wallet" }
        return tenant.name
    }

    var walletAccessCards: [AccessCardModel] {
        guard let tenantId = walletScopedTenantId else { return [] }
        guard let dashboard = tenantDashboards[tenantId] else { return [] }
        return dashboard.entitlements.map {
            AccessCardModel(
                id: "\(tenantId)-\($0.id)",
                companyId: tenantId,
                entitlementId: $0.id,
                name: $0.name,
                type: $0.type,
                tenantName: dashboard.tenant.name,
                entitlementCode: $0.entitlementCode,
                remainingUses: $0.remainingUses,
                visitCount: $0.visitCount,
                totalUses: $0.totalUses,
                validUntil: $0.validUntil,
                validityDays: $0.validityDays,
                sessionTypeId: $0.sessionTypeId,
                autoRenews: $0.autoRenews ?? false,
                displayCode: $0.displayCode,
                priceGross: $0.priceGross,
                remainingValueGross: $0.remainingValueGross,
                currency: $0.currency,
                status: $0.status ?? "ACTIVE"
            )
        }
    }

    var walletScopedOffers: [WalletOfferModel] {
        guard let tenantId = walletScopedTenantId else { return [] }
        guard let dashboard = tenantDashboards[tenantId] else { return [] }
        guard dashboard.tenant.billingEnabled != false else { return [] }
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
                    sessionTypeName: $0.sessionTypeName,
                    promoText: $0.promoText,
                    validityDays: $0.validityDays,
                    usageLimit: $0.usageLimit
                )
            }
            .sorted { $0.name < $1.name }
    }

    var walletScopedOrderCards: [WalletOrderCardModel] {
        guard let tenantId = walletScopedTenantId else { return [] }
        guard let dashboard = tenantDashboards[tenantId] else { return [] }
        return dashboard.orders.map { order in
            WalletOrderCardModel(
                id: "\(tenantId)-\(order.id)",
                companyId: tenantId,
                orderId: order.id,
                invoiceOrderId: order.invoiceOrderId,
                tenantName: dashboard.tenant.name,
                referenceCode: order.referenceCode,
                productName: order.productName,
                productType: order.productType,
                paymentMethod: order.paymentMethod,
                totalGross: order.totalGross,
                currency: order.currency ?? "EUR",
                status: order.status,
                billPaymentStatus: order.billPaymentStatus,
                createdAt: order.createdAt,
                paidAt: order.paidAt,
                paymentCompanyName: order.paymentCompanyName,
                paymentCompanyAddress: order.paymentCompanyAddress,
                paymentIban: order.paymentIban
            )
        }
        .sorted {
            ($0.createdAt ?? "") > ($1.createdAt ?? "")
        }
    }

    var walletOffers: [WalletOfferModel] {
        activeTenantIds.flatMap { tenantId -> [WalletOfferModel] in
            guard let dashboard = tenantDashboards[tenantId] else { return [] }
            guard dashboard.tenant.billingEnabled != false else { return [] }
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
                        sessionTypeName: $0.sessionTypeName,
                        promoText: $0.promoText,
                        validityDays: $0.validityDays,
                        usageLimit: $0.usageLimit
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

    var walletOrderCards: [WalletOrderCardModel] {
        activeTenantIds.flatMap { tenantId -> [WalletOrderCardModel] in
            guard let dashboard = tenantDashboards[tenantId] else { return [] }
            return dashboard.orders.map { order in
                WalletOrderCardModel(
                    id: "\(tenantId)-\(order.id)",
                    companyId: tenantId,
                    orderId: order.id,
                    invoiceOrderId: order.invoiceOrderId,
                    tenantName: dashboard.tenant.name,
                    referenceCode: order.referenceCode,
                    productName: order.productName,
                    productType: order.productType,
                    paymentMethod: order.paymentMethod,
                    totalGross: order.totalGross,
                    currency: order.currency ?? "EUR",
                    status: order.status,
                    billPaymentStatus: order.billPaymentStatus,
                    createdAt: order.createdAt,
                    paidAt: order.paidAt,
                    paymentCompanyName: order.paymentCompanyName,
                    paymentCompanyAddress: order.paymentCompanyAddress,
                    paymentIban: order.paymentIban
                )
            }
        }
        .sorted {
            ($0.createdAt ?? "") > ($1.createdAt ?? "")
        }
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

    func setWalletTenantFilter(_ tenantId: String?) {
        walletSelectedTenantId = tenantId
    }

    func consumePendingInboxOpen() {
        pendingInboxOpenCompanyId = nil
    }

    func logout() {
        stopBookingRealtimeStreams()
        api.updateToken(nil)
        authStore.clearToken()
        linkedTenants = []
        selectedTenantId = nil
        walletSelectedTenantId = nil
        tenantDashboards = [:]
        pendingInboxOpenCompanyId = nil
        signupChallenge = nil
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

    func signupStart(
        firstName: String,
        lastName: String,
        email: String,
        password: String,
        phone: String?,
        language: String = "sl"
    ) async {
        guard !usePreviewData else {
            signupChallenge = SignupChallengeModel(
                challengeId: "preview-signup-challenge",
                email: email,
                expiresAt: "2099-01-01T00:00:00Z"
            )
            return
        }
        await run {
            let challenge = try await self.api.signupStart(
                email: email,
                password: password,
                firstName: firstName,
                lastName: lastName,
                phone: phone,
                language: language
            )
            self.signupChallenge = challenge
        }
    }

    func verifySignupCode(_ code: String) async {
        guard let challenge = signupChallenge else {
            errorMessage = "Signup challenge expired. Please start again."
            return
        }
        guard !usePreviewData else {
            applyPreview()
            signupChallenge = nil
            return
        }
        await run {
            let session = try await self.api.verifySignupCode(challengeId: challenge.challengeId, code: code)
            self.applySession(session)
            self.signupChallenge = nil
            try await self.refreshAllTenantsThrowing()
        }
    }

    func resendSignupCode() async {
        guard let challenge = signupChallenge else {
            errorMessage = "Signup challenge expired. Please start again."
            return
        }
        guard !usePreviewData else { return }
        await run {
            let refreshed = try await self.api.resendSignupCode(challengeId: challenge.challengeId)
            self.signupChallenge = refreshed
            self.noticeMessage = "A new verification code was sent."
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

    func restoreSessionIfPossible() async -> Bool {
        if usePreviewData {
            applyPreview()
            return true
        }
        guard let token = authStore.loadToken() else {
            api.updateToken(nil)
            return false
        }
        do {
            api.updateToken(token)
            try await refreshAllTenantsThrowing()
            didRequestLogout = false
            return true
        } catch {
            api.updateToken(nil)
            authStore.clearToken()
            linkedTenants = []
            selectedTenantId = nil
            walletSelectedTenantId = nil
            tenantDashboards = [:]
            pendingInboxOpenCompanyId = nil
            stopBookingRealtimeStreams()
            return false
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


    func markNotificationRead(companyId: String, notificationId: String) async {
        guard !usePreviewData else {
            applyReadState(companyId: companyId, notificationId: notificationId, readAt: isoNow())
            return
        }
        await run {
            try await self.api.markNotificationRead(companyId: companyId, notificationId: notificationId)
            self.applyReadState(companyId: companyId, notificationId: notificationId, readAt: self.isoNow())
        }
    }

    func markAllNotificationsRead(companyId: String) async {
        guard !usePreviewData else {
            applyReadStateAll(companyId: companyId, readAt: isoNow())
            return
        }
        await run {
            try await self.api.markAllNotificationsRead(companyId: companyId)
            self.applyReadStateAll(companyId: companyId, readAt: self.isoNow())
        }
    }

    private func isoNow() -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: Date())
    }

    private func applyReadState(companyId: String, notificationId: String, readAt: String) {
        guard let dashboard = tenantDashboards[companyId] else { return }
        let updated = dashboard.notifications.map { n -> NotificationModel in
            guard n.id == notificationId, n.readAt == nil else { return n }
            return NotificationModel(
                id: n.id,
                title: n.title,
                body: n.body,
                notificationType: n.notificationType,
                readAt: readAt,
                createdAt: n.createdAt,
                payloadJson: n.payloadJson
            )
        }
        tenantDashboards[companyId] = TenantDashboardModel(
            tenant: dashboard.tenant,
            upcomingBookings: dashboard.upcomingBookings,
            bookingHistory: dashboard.bookingHistory,
            entitlements: dashboard.entitlements,
            orders: dashboard.orders,
            notifications: updated,
            products: dashboard.products,
            inboxThread: dashboard.inboxThread,
            inboxMessages: dashboard.inboxMessages
        )
    }

    private func applyReadStateAll(companyId: String, readAt: String) {
        guard let dashboard = tenantDashboards[companyId] else { return }
        let updated = dashboard.notifications.map { n -> NotificationModel in
            guard n.readAt == nil else { return n }
            return NotificationModel(
                id: n.id,
                title: n.title,
                body: n.body,
                notificationType: n.notificationType,
                readAt: readAt,
                createdAt: n.createdAt,
                payloadJson: n.payloadJson
            )
        }
        tenantDashboards[companyId] = TenantDashboardModel(
            tenant: dashboard.tenant,
            upcomingBookings: dashboard.upcomingBookings,
            bookingHistory: dashboard.bookingHistory,
            entitlements: dashboard.entitlements,
            orders: dashboard.orders,
            notifications: updated,
            products: dashboard.products,
            inboxThread: dashboard.inboxThread,
            inboxMessages: dashboard.inboxMessages
        )
    }

    func loadInboxMessages(companyId: String) async {
        guard !usePreviewData else { return }
        await run {
            let items = try await self.api.inboxMessages(companyId: companyId)
            let refreshedThread = (try await self.api.inboxThreads(companyId: companyId)).first
            if let dashboard = self.tenantDashboards[companyId] {
                self.tenantDashboards[companyId] = TenantDashboardModel(
                    tenant: dashboard.tenant,
                    upcomingBookings: dashboard.upcomingBookings,
                    bookingHistory: dashboard.bookingHistory,
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

    func sendInboxMessage(companyId: String, body: String, attachmentFileIds: [Int64] = []) async {
        guard !usePreviewData else { return }
        await run {
            _ = try await self.api.sendInboxMessage(companyId: companyId, body: body, attachmentFileIds: attachmentFileIds)
            try await self.refreshTenant(companyId: companyId)
            let items = try await self.api.inboxMessages(companyId: companyId)
            let refreshedThread = (try await self.api.inboxThreads(companyId: companyId)).first
            if let dashboard = self.tenantDashboards[companyId] {
                self.tenantDashboards[companyId] = TenantDashboardModel(
                    tenant: dashboard.tenant,
                    upcomingBookings: dashboard.upcomingBookings,
                    bookingHistory: dashboard.bookingHistory,
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

    func uploadInboxAttachment(
        companyId: String,
        fileName: String,
        contentType: String?,
        data: Data
    ) async throws -> GuestInboxUploadedAttachmentModel {
        if usePreviewData {
            return GuestInboxUploadedAttachmentModel(
                id: Int64.random(in: 1_000_000...9_999_999),
                fileName: fileName,
                contentType: contentType,
                sizeBytes: Int64(data.count),
                uploadedAt: nil
            )
        }
        return try await api.uploadInboxAttachment(
            companyId: companyId,
            fileName: fileName,
            contentType: contentType,
            data: data
        )
    }

    func discardInboxAttachment(companyId: String, fileId: Int64) async {
        guard !usePreviewData else { return }
        try? await api.discardInboxAttachment(companyId: companyId, fileId: fileId)
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
        return await Task.detached(priority: .utility) {
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

    func handleBookingChangedPush(companyId: String) async {
        let normalized = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return }
        guard linkedTenants.contains(where: { $0.id == normalized }) else { return }
        do {
            try await refreshTenant(companyId: normalized)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func handlePaymentReturn(url: URL) {
        guard url.scheme == "calendra-guest" else { return }
        let provider = (url.host ?? "").lowercased()
        guard provider == "paypal" || provider == "stripe" else { return }
        let providerLabel = provider == "stripe" ? "Stripe" : "PayPal"
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let status = components?.queryItems?.first(where: { $0.name == "status" })?.value?.lowercased()
        let message = components?.queryItems?.first(where: { $0.name == "message" })?.value
        lastPaymentReturnOrderId = components?.queryItems?.first(where: { $0.name == "orderId" })?.value
        lastPaymentReturnStatus = status
        paymentReturnSequence += 1

        switch status {
        case "success":
            noticeMessage = "\(providerLabel) payment completed."
            Task { await refreshOnAppBecameActive() }
        case "cancelled", "canceled":
            noticeMessage = "\(providerLabel) checkout canceled."
            Task { await refreshOnAppBecameActive() }
        case "error":
            errorMessage = message ?? "\(providerLabel) payment failed."
            Task { await refreshOnAppBecameActive() }
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

    func createOrder(companyId: String, productId: String, slotId: String?, paymentMethod: String, consultantId: String? = nil, entitlementId: String? = nil) async throws -> CheckoutResponseModel {
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
            response = try await api.createOrder(companyId: companyId, productId: productId, slotId: slotId, paymentMethodType: paymentMethod, consultantId: consultantId, entitlementId: entitlementId)
        }
        try await refreshTenant(companyId: companyId)
        return response
    }

    func cancelExternalCheckout(companyId: String, orderId: String) async throws {
        if usePreviewData {
            try await refreshTenant(companyId: companyId)
            return
        }
        _ = try await api.cancelExternalCheckout(orderId: orderId)
        try await refreshTenant(companyId: companyId)
    }


    func rescheduleBooking(companyId: String, bookingId: String, newSlotId: String) async throws -> BookingActionResultModel {
        let result: BookingActionResultModel
        if usePreviewData {
            result = BookingActionResultModel(
                bookingId: bookingId,
                bookingStatus: "CONFIRMED",
                creditConsumed: false,
                startsAt: nil,
                endsAt: nil
            )
        } else {
            result = try await api.rescheduleBooking(bookingId: bookingId, newSlotId: newSlotId)
        }
        try await refreshTenant(companyId: companyId)
        return result
    }

    func cancelBooking(companyId: String, bookingId: String) async throws -> BookingActionResultModel {
        let result: BookingActionResultModel
        if usePreviewData {
            result = BookingActionResultModel(
                bookingId: bookingId,
                bookingStatus: "CANCELLED",
                creditConsumed: false,
                startsAt: nil,
                endsAt: nil
            )
        } else {
            result = try await api.cancelBooking(bookingId: bookingId)
        }
        try await refreshTenant(companyId: companyId)
        return result
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

    func uploadProfilePicture(fileName: String, contentType: String?, data: Data) async throws -> GuestProfileSettingsModel {
        let settings: GuestProfileSettingsModel
        if usePreviewData {
            settings = preview.uploadProfilePicture()
        } else {
            settings = try await api.uploadProfilePicture(fileName: fileName, contentType: contentType, data: data)
        }
        user = settings.guestUser
        return settings
    }

    func downloadProfilePicture() async throws -> Data {
        if usePreviewData {
            return preview.downloadProfilePicturePreview()
        }
        return try await api.downloadProfilePicture()
    }

    func toggleAutoRenew(companyId: String, entitlementId: String, autoRenews: Bool) async throws {
        guard !usePreviewData else { return }
        _ = try await api.toggleAutoRenew(companyId: companyId, entitlementId: entitlementId, autoRenews: autoRenews)
        try await refreshTenant(companyId: companyId)
    }

    func downloadOrderReceipt(orderId: String, referenceCode: String?) async throws -> URL {
        if usePreviewData {
            let fileName = (referenceCode?.isEmpty == false ? "receipt-\(referenceCode!)" : "receipt-\(orderId)") + ".pdf"
            let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + fileName)
            let previewText = "Preview receipt for order \(orderId)"
            if let data = previewText.data(using: .utf8) {
                try data.write(to: destination, options: .atomic)
            }
            return destination
        }
        return try await api.downloadOrderReceiptPdf(orderId: orderId, suggestedFileName: referenceCode)
    }

    func matchingEntitlements(companyId: String, sessionTypeId: String) -> [AccessCardModel] {
        accessCards.filter { card in
            guard card.companyId == companyId && (card.sessionTypeId == nil || card.sessionTypeId == sessionTypeId) else { return false }
            let s = card.status.uppercased()
            return s == "ACTIVE" || s == "PENDING"
        }
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
        let inboxThread = (try await api.inboxThreads(companyId: companyId)).first
        return TenantDashboardModel(
            tenant: home.tenant,
            upcomingBookings: home.upcomingBookings,
            bookingHistory: history,
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
        if let walletSelectedTenantId, linkedTenants.contains(where: { $0.id == walletSelectedTenantId }) == false {
            self.walletSelectedTenantId = linkedTenants.first?.id
        } else if self.walletSelectedTenantId == nil {
            self.walletSelectedTenantId = linkedTenants.first?.id
        }
        for tenant in linkedTenants {
            try await refreshTenant(companyId: tenant.id)
        }
        restartBookingRealtimeStreams()
        if let selectedTenantId, let tenant = linkedTenants.first(where: { $0.id == selectedTenantId }) {
            currentTenant = tenant
        }
    }

    private func applySession(_ session: GuestSessionModel) {
        api.updateToken(session.token)
        authStore.saveToken(session.token)
        user = session.guestUser
        linkedTenants = session.linkedTenants
        if let walletSelectedTenantId, session.linkedTenants.contains(where: { $0.id == walletSelectedTenantId }) == false {
            self.walletSelectedTenantId = session.linkedTenants.first?.id
        } else if self.walletSelectedTenantId == nil {
            self.walletSelectedTenantId = session.linkedTenants.first?.id
        }
        signupChallenge = nil
        currentTenant = session.linkedTenants.first(where: { $0.id == selectedTenantId }) ?? session.linkedTenants.first ?? currentTenant
        tenantDashboards = [:]
        pendingInboxOpenCompanyId = selectedTenantId
        didRequestLogout = false
        restartBookingRealtimeStreams()
        Task { await registerPushTokenIfPossible() }
    }

    private func stopBookingRealtimeStreams() {
        bookingRealtimeTasks.values.forEach { $0.cancel() }
        bookingRealtimeTasks.removeAll()
    }

    private func restartBookingRealtimeStreams() {
        stopBookingRealtimeStreams()
        guard !usePreviewData else { return }
        for tenant in linkedTenants {
            let companyId = tenant.id
            bookingRealtimeTasks[companyId] = Task { [weak self] in
                guard let self else { return }
                await self.api.listenForBookingUpdates(companyId: companyId) { [weak self] in
                    await MainActor.run {
                        guard let self else { return }
                        Task { [weak self] in
                            guard let self else { return }
                            try? await self.refreshTenant(companyId: companyId)
                        }
                    }
                }
            }
        }
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
        if let walletSelectedTenantId, linkedTenants.contains(where: { $0.id == walletSelectedTenantId }) == false {
            self.walletSelectedTenantId = linkedTenants.first?.id
        } else if self.walletSelectedTenantId == nil {
            self.walletSelectedTenantId = linkedTenants.first?.id
        }
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
