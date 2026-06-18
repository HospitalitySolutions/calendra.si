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

    func signupStart(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        phone: String?,
        language: String
    ) async throws -> SignupChallengeModel {
        try await post(
            path: "api/guest/auth/signup/start",
            body: SignupStartPayload(
                email: email,
                password: password,
                firstName: firstName,
                lastName: lastName,
                phone: phone,
                language: language
            )
        )
    }

    func verifySignupCode(challengeId: String, code: String) async throws -> GuestSessionModel {
        try await post(
            path: "api/guest/auth/signup/verify-code",
            body: VerifySignupCodePayload(challengeId: challengeId, code: code)
        )
    }

    func resendSignupCode(challengeId: String) async throws -> SignupChallengeModel {
        try await post(
            path: "api/guest/auth/signup/resend-code",
            body: ResendSignupCodePayload(challengeId: challengeId)
        )
    }

    func requestPasswordReset(email: String, locale: String) async throws {
        let _: EmptyResponse = try await post(
            path: "api/guest/auth/forgot-password",
            body: ForgotPasswordPayload(email: email, locale: locale, language: locale)
        )
    }

    func verifyPasswordResetCode(email: String, code: String) async throws -> ResetPasswordCodeModel {
        try await post(
            path: "api/guest/auth/forgot-password/verify-code",
            body: VerifyPasswordResetCodePayload(email: email, code: code)
        )
    }

    func validatePasswordResetToken(_ token: String) async throws -> ResetPasswordValidateModel {
        try await get(
            path: "api/guest/auth/reset-password/validate",
            query: [URLQueryItem(name: "token", value: token)]
        )
    }

    func resetPassword(token: String, password: String) async throws {
        let _: EmptyResponse = try await post(
            path: "api/guest/auth/reset-password",
            body: ResetPasswordPayload(token: token, password: password)
        )
    }

    func loginWithApple(idToken: String, firstName: String? = nil, lastName: String? = nil) async throws -> GuestSessionModel {
        try await post(
            path: "api/guest/auth/apple/token",
            body: SocialTokenPayload(idToken: idToken, firstName: firstName, lastName: lastName)
        )
    }

    func loginWithGoogle(idToken: String) async throws -> GuestSessionModel {
        try await post(
            path: "api/guest/auth/google/token",
            body: SocialTokenPayload(idToken: idToken)
        )
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

    func uploadProfilePicture(fileName: String, contentType: String?, data: Data) async throws -> GuestProfileSettingsModel {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/guest/profile/picture"))
        request.httpMethod = "POST"
        let boundary = "GuestMobileBoundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("native", forHTTPHeaderField: "X-App-Platform")
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        let safeFileName = fileName.replacingOccurrences(of: "\"", with: "")
        let mime = (contentType?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? contentType! : "application/octet-stream")
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(safeFileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        let (responseData, response) = try await performDataRequest(request)
        try validate(response: response, data: responseData)
        return try JSONDecoder().decode(GuestProfileSettingsModel.self, from: responseData)
    }

    func downloadProfilePicture() async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/guest/profile/picture"))
        request.httpMethod = "GET"
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        request.setValue("native", forHTTPHeaderField: "X-App-Platform")
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await performDataRequest(request)
        try validate(response: response, data: data)
        return data
    }

    func downloadOrderReceiptPdf(orderId: String, suggestedFileName: String?) async throws -> URL {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/guest/orders/\(orderId)/receipt.pdf"))
        request.httpMethod = "GET"
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        request.setValue("native", forHTTPHeaderField: "X-App-Platform")
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await performDataRequest(request)
        try validate(response: response, data: data)
        let rawName = suggestedFileName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallback = "receipt-\(orderId)"
        var fileName = (rawName?.isEmpty == false ? rawName! : fallback)
            .replacingOccurrences(of: "/", with: "-")
        if !fileName.lowercased().hasSuffix(".pdf") {
            fileName += ".pdf"
        }
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + fileName)
        try data.write(to: destination, options: .atomic)
        return destination
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

    func searchTenants(query: String, tenantType: String? = nil) async throws -> [TenantSummaryModel] {
        var queryItems = [URLQueryItem(name: "q", value: query)]
        if let tenantType, !tenantType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            queryItems.append(URLQueryItem(name: "type", value: tenantType))
        }
        return try await get(path: "api/guest/tenants/search", query: queryItems)
    }

    func joinPublicTenant(companyId: String) async throws {
        let _: EmptyResponse = try await post(
            path: "api/guest/tenants/join",
            body: JoinTenantPayload(joinMethod: "PUBLIC_SEARCH", tenantCode: nil, inviteCode: nil, companyId: companyId)
        )
    }

    func unsubscribeTenant(companyId: String) async throws {
        try await postEmpty(path: "api/guest/tenants/\(companyId)/unsubscribe")
    }

    func anonymizeTenant(companyId: String) async throws {
        try await postEmpty(path: "api/guest/tenants/\(companyId)/anonymize")
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

    func markNotificationRead(companyId: String, notificationId: String) async throws {
        _ = try await postEmpty(path: "api/guest/notifications/\(notificationId)/read", query: [URLQueryItem(name: "companyId", value: companyId)])
    }

    func markAllNotificationsRead(companyId: String) async throws {
        _ = try await postEmpty(path: "api/guest/notifications/read-all", query: [URLQueryItem(name: "companyId", value: companyId)])
    }

    func inboxThreads(companyId: String) async throws -> [GuestInboxThreadModel] {
        try await get(path: "api/guest/inbox/threads", query: [URLQueryItem(name: "companyId", value: companyId)])
    }

    func inboxMessages(companyId: String) async throws -> [GuestInboxMessageModel] {
        try await get(path: "api/guest/inbox/messages", query: [URLQueryItem(name: "companyId", value: companyId)])
    }

    func sendInboxMessage(
        companyId: String,
        body: String,
        attachmentFileIds: [Int64] = []
    ) async throws -> GuestInboxMessageModel {
        try await post(
            path: "api/guest/inbox/messages",
            body: GuestInboxSendPayload(companyId: companyId, body: body, attachmentFileIds: attachmentFileIds)
        )
    }

    func uploadInboxAttachment(
        companyId: String,
        fileName: String,
        contentType: String?,
        data: Data
    ) async throws -> GuestInboxUploadedAttachmentModel {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/guest/inbox/attachments"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [URLQueryItem(name: "companyId", value: companyId)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        let boundary = "GuestMobileBoundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("native", forHTTPHeaderField: "X-App-Platform")
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        let safeFileName = fileName.replacingOccurrences(of: "\"", with: "")
        let mime = (contentType?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false ? contentType! : "application/octet-stream")
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(safeFileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        let (responseData, response) = try await performDataRequest(request)
        try validate(response: response, data: responseData)
        return try JSONDecoder().decode(GuestInboxUploadedAttachmentModel.self, from: responseData)
    }

    func discardInboxAttachment(companyId: String, fileId: Int64) async throws {
        _ = try await postEmpty(
            path: "api/guest/inbox/attachments/\(fileId)/discard",
            query: [URLQueryItem(name: "companyId", value: companyId)]
        )
    }

    func downloadInboxAttachment(companyId: String, attachmentId: Int64, suggestedFileName: String) async throws -> URL {
        let query = [URLQueryItem(name: "companyId", value: companyId)]
        var components = URLComponents(url: baseURL.appendingPathComponent("api/guest/inbox/attachments/\(attachmentId)"), resolvingAgainstBaseURL: false)!
        components.queryItems = query
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        request.setValue("native", forHTTPHeaderField: "X-App-Platform")
        if let authToken {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await performDataRequest(request)
        try validate(response: response, data: data)
        let fileName = suggestedFileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "attachment-\(attachmentId)" : suggestedFileName
        let safeName = fileName.replacingOccurrences(of: "/", with: "-")
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + safeName)
        try data.write(to: destination, options: .atomic)
        return destination
    }


    func registerDeviceToken(platform: String, pushToken: String, locale: String? = nil) async throws -> DeviceTokenResponseModel {
        try await post(path: "api/guest/device-tokens", body: DeviceTokenPayload(platform: platform, pushToken: pushToken, locale: locale))
    }

    func listenForBookingUpdates(
        companyId: String,
        onBookingUpdated: @escaping @Sendable () async -> Void
    ) async {
        while !Task.isCancelled {
            do {
                let token = authToken
                guard let token, !token.isEmpty else {
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                    continue
                }
                var components = URLComponents(
                    url: baseURL.appendingPathComponent("api/guest/bookings/stream"),
                    resolvingAgainstBaseURL: false
                )!
                components.queryItems = [URLQueryItem(name: "companyId", value: companyId)]
                guard let url = components.url else {
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                    continue
                }

                var request = URLRequest(url: url)
                request.httpMethod = "GET"
                request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                request.setValue("native", forHTTPHeaderField: "X-App-Platform")
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                request.timeoutInterval = 65

                let (bytes, response) = try await session.bytes(for: request)
                guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                    try await Task.sleep(nanoseconds: 2_000_000_000)
                    continue
                }

                var eventName: String?
                for try await line in bytes.lines {
                    if Task.isCancelled { return }
                    if line.hasPrefix("event:") {
                        eventName = String(line.dropFirst("event:".count)).trimmingCharacters(in: .whitespaces)
                        continue
                    }
                    if line.isEmpty {
                        eventName = nil
                        continue
                    }
                    if line.hasPrefix("data:"), eventName == "booking-updated" {
                        await onBookingUpdated()
                    }
                }
            } catch {
                if Task.isCancelled { return }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }


    func rescheduleBooking(bookingId: String, newSlotId: String) async throws -> BookingActionResultModel {
        try await post(
            path: "api/guest/bookings/\(bookingId)/reschedule",
            body: RescheduleBookingPayload(newSlotId: newSlotId)
        )
    }

    func cancelBooking(bookingId: String) async throws -> BookingActionResultModel {
        try await post(
            path: "api/guest/bookings/\(bookingId)/cancel",
            body: CancelBookingPayload()
        )
    }

    func createOrder(companyId: String, productId: String, slotId: String?, paymentMethodType: String, consultantId: String? = nil, entitlementId: String? = nil) async throws -> CheckoutResponseModel {
        let order: CreateOrderEnvelope = try await post(
            path: "api/guest/orders",
            body: CreateOrderPayload(companyId: companyId, productId: productId, slotId: slotId, paymentMethodType: paymentMethodType, consultantId: consultantId, entitlementId: entitlementId)
        )
        return try await post(
            path: "api/guest/orders/\(order.order.orderId)/checkout",
            body: CheckoutPayload(paymentMethodType: paymentMethodType, saveCard: paymentMethodType == "CARD", useSavedPaymentMethodId: nil)
        )
    }

    func cancelExternalCheckout(orderId: String) async throws -> CheckoutResponseModel {
        try await post(
            path: "api/guest/orders/\(orderId)/checkout/cancel",
            body: EmptyPayload()
        )
    }

    private func get<T: Decodable>(path: String, query: [URLQueryItem] = []) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        components.queryItems = query.isEmpty ? nil : query
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        applyHeaders(to: &request)
        let (data, response) = try await performDataRequest(request)
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
        let (data, response) = try await performDataRequest(request)
        try validate(response: response, data: data)
        return try JSONDecoder().decode(T.self, from: data)
    }

    @discardableResult
    private func postEmpty(path: String, query: [URLQueryItem] = []) async throws -> Data {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        components.queryItems = query.isEmpty ? nil : query
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        applyHeaders(to: &request)
        let (data, response) = try await performDataRequest(request)
        try validate(response: response, data: data)
        return data
    }

    private func put<T: Decodable, Body: Encodable>(path: String, body: Body) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "PUT"
        request.httpBody = try JSONEncoder().encode(body)
        applyHeaders(to: &request)
        let (data, response) = try await performDataRequest(request)
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

    private func performDataRequest(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch let error as URLError {
            if isConnectivityError(error) {
                throw guestApiError(code: error.errorCode, message: backendUnavailableMessage())
            }
            throw error
        } catch {
            throw error
        }
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw guestApiError(code: -1, message: backendUnavailableMessage())
        }
        guard (200..<300).contains(http.statusCode) else {
            throw guestApiError(code: http.statusCode, message: errorMessage(for: http.statusCode, data: data))
        }
    }

    private func errorMessage(for statusCode: Int, data: Data) -> String {
        if isBackendUnavailableStatus(statusCode) {
            return backendUnavailableMessage(statusCode: statusCode)
        }

        if
            let apiError = try? JSONDecoder().decode(ApiErrorResponse.self, from: data),
            !apiError.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
            return apiError.message
        }

        let payload = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !payload.isEmpty { return payload }
        return "Request failed with status \(statusCode)"
    }

    private func isBackendUnavailableStatus(_ statusCode: Int) -> Bool {
        statusCode == 502 || statusCode == 503 || statusCode == 504 || statusCode == 522 || statusCode == 523 || statusCode == 524
    }

    private func isConnectivityError(_ error: URLError) -> Bool {
        switch error.code {
        case .notConnectedToInternet,
             .timedOut,
             .cannotFindHost,
             .cannotConnectToHost,
             .networkConnectionLost,
             .dnsLookupFailed,
             .internationalRoamingOff,
             .callIsActive,
             .dataNotAllowed,
             .secureConnectionFailed:
            return true
        default:
            return false
        }
    }

    private func backendUnavailableMessage(statusCode: Int? = nil) -> String {
        let message = "Calendra service is temporarily unavailable. Please check your internet connection and try again in a moment."
        if let statusCode { return "\(message) (HTTP \(statusCode))" }
        return message
    }

    private func guestApiError(code: Int, message: String) -> NSError {
        NSError(domain: "GuestApiClient", code: code, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

private struct ApiErrorResponse: Decodable {
    let message: String
}

private struct EmptyResponse: Decodable {}
private struct EmptyPayload: Encodable {}
private struct CreateOrderEnvelope: Decodable {
    struct OrderSummary: Decodable { let orderId: String }
    let order: OrderSummary
}
