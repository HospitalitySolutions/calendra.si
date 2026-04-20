import Foundation

final class GuestApiClient {
    private let baseURL: URL
    private let session: URLSession
    private var authToken: String?

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func updateToken(_ token: String?) {
        authToken = token
    }

    func login(email: String, password: String) async throws -> GuestSessionModel {
        try await post(path: "api/guest/auth/login", body: LoginPayload(email: email, password: password))
    }

    func loginWithApple(idToken: String) async throws -> GuestSessionModel {
        try await post(path: "api/guest/auth/apple/token", body: SocialTokenPayload(idToken: idToken))
    }

    func me() async throws -> GuestProfileModel {
        try await get(path: "api/guest/me")
    }

    func profileSettings(companyId: String?) async throws -> GuestProfileSettingsModel {
        var query: [URLQueryItem] = []
        if let companyId, !companyId.isEmpty {
            query.append(URLQueryItem(name: "companyId", value: companyId))
        }
        return try await get(path: "api/guest/profile/settings", query: query)
    }

    func updateProfileSettings(_ payload: UpdateGuestProfileSettingsPayload) async throws -> GuestProfileSettingsModel {
        try await put(path: "api/guest/profile/settings", body: payload)
    }

    func resolveTenant(code: String) async throws -> TenantLookupModel {
        try await post(path: "api/guest/tenants/resolve-code", body: TenantCodePayload(tenantCode: code))
    }

    func joinTenant(code: String) async throws {
        let _: EmptyResponse = try await post(
            path: "api/guest/tenants/join",
            body: JoinTenantPayload(joinMethod: "TENANT_CODE", tenantCode: code, inviteCode: nil, companyId: nil)
        )
    }

    func home(companyId: String) async throws -> HomePayloadModel {
        try await get(path: "api/guest/home", query: [URLQueryItem(name: "companyId", value: companyId)])
    }

    func products(companyId: String) async throws -> [ProductModel] {
        try await get(path: "api/guest/products", query: [URLQueryItem(name: "companyId", value: companyId)])
    }

    func availability(companyId: String, sessionTypeId: String, date: String, consultantId: String? = nil) async throws -> AvailabilityResponseModel {
        var query: [URLQueryItem] = [
            URLQueryItem(name: "companyId", value: companyId),
            URLQueryItem(name: "sessionTypeId", value: sessionTypeId),
            URLQueryItem(name: "date", value: date)
        ]
        if let consultantId, !consultantId.isEmpty {
            query.append(URLQueryItem(name: "consultantId", value: consultantId))
        }
        return try await get(path: "api/guest/availability", query: query)
    }

    func consultants(companyId: String, sessionTypeId: String) async throws -> [ConsultantSummaryModel] {
        try await get(
            path: "api/guest/consultants",
            query: [
                URLQueryItem(name: "companyId", value: companyId),
                URLQueryItem(name: "sessionTypeId", value: sessionTypeId)
            ]
        )
    }

    func wallet(companyId: String) async throws -> WalletPayloadModel {
        try await get(path: "api/guest/wallet", query: [URLQueryItem(name: "companyId", value: companyId)])
    }

    func toggleAutoRenew(companyId: String, entitlementId: String, autoRenews: Bool) async throws -> ToggleAutoRenewResponseModel {
        try await post(
            path: "api/guest/wallet/entitlements/\(entitlementId)/auto-renew",
            query: [URLQueryItem(name: "companyId", value: companyId)],
            body: ToggleAutoRenewPayload(autoRenews: autoRenews)
        )
    }

    func history(companyId: String) async throws -> [BookingModel] {
        try await get(path: "api/guest/bookings/history", query: [URLQueryItem(name: "companyId", value: companyId)])
    }

    func notifications(companyId: String) async throws -> NotificationsPayloadModel {
        try await get(path: "api/guest/notifications", query: [URLQueryItem(name: "companyId", value: companyId)])
    }

    func createOrder(companyId: String, productId: String, slotId: String?, paymentMethodType: String, consultantId: String? = nil) async throws -> CheckoutResponseModel {
        let order: CreateOrderEnvelope = try await post(
            path: "api/guest/orders",
            body: CreateOrderPayload(companyId: companyId, productId: productId, slotId: slotId, paymentMethodType: paymentMethodType, consultantId: consultantId)
        )
        return try await post(
            path: "api/guest/orders/\(order.order.orderId)/checkout",
            body: CheckoutPayload(paymentMethodType: paymentMethodType, saveCard: paymentMethodType == "CARD", useSavedPaymentMethodId: nil)
        )
    }

    private func get<T: Decodable>(path: String, query: [URLQueryItem] = []) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        components.queryItems = query.isEmpty ? nil : query
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post<T: Decodable, Body: Encodable>(path: String, body: Body) async throws -> T {
        try await post(path: path, query: [], body: body)
    }

    private func post<T: Decodable, Body: Encodable>(path: String, query: [URLQueryItem], body: Body) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        components.queryItems = query.isEmpty ? nil : query
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(body)
        applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func put<T: Decodable, Body: Encodable>(path: String, body: Body) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "PUT"
        request.httpBody = try JSONEncoder().encode(body)
        applyHeaders(to: &request)
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }


    private func applyHeaders(to request: inout URLRequest) {
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("native", forHTTPHeaderField: "X-App-Platform")
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Request failed"
            throw NSError(domain: "GuestApiClient", code: (response as? HTTPURLResponse)?.statusCode ?? -1, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
}

private struct EmptyResponse: Decodable {}
private struct CreateOrderEnvelope: Decodable {
    struct OrderSummary: Decodable { let orderId: String }
    let order: OrderSummary
}
