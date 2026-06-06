import SwiftUI
import UIKit
import AuthenticationServices
import CryptoKit



private struct GuestKeyboardDismissTapBridge: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        DispatchQueue.main.async {
            context.coordinator.attach(to: view.window)
        }
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            context.coordinator.attach(to: uiView.window)
        }
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        private weak var window: UIWindow?
        private weak var gesture: UITapGestureRecognizer?

        func attach(to newWindow: UIWindow?) {
            guard let newWindow else { return }
            guard window !== newWindow || gesture == nil else { return }
            detach()

            let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
            tapGesture.cancelsTouchesInView = false
            tapGesture.delegate = self
            newWindow.addGestureRecognizer(tapGesture)

            window = newWindow
            gesture = tapGesture
        }

        func detach() {
            if let gesture, let window {
                window.removeGestureRecognizer(gesture)
            }
            gesture = nil
            window = nil
        }

        @objc private func handleTap(_ sender: UITapGestureRecognizer) {
            guard sender.state == .ended else { return }
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            guard !isTextInput(touch.view) else { return false }
            guard !isInteractiveControl(touch.view) else { return false }
            return true
        }

        private func isTextInput(_ view: UIView?) -> Bool {
            var currentView = view
            while let candidate = currentView {
                if candidate is UITextField || candidate is UITextView || candidate is UISearchBar {
                    return true
                }
                currentView = candidate.superview
            }
            return false
        }

        private func isInteractiveControl(_ view: UIView?) -> Bool {
            var currentView = view
            while let candidate = currentView {
                if candidate is UIControl {
                    return true
                }
                let className = NSStringFromClass(type(of: candidate))
                if className.contains("Button") || className.contains("Menu") || className.contains("ASAuthorization") {
                    return true
                }
                currentView = candidate.superview
            }
            return false
        }
    }
}

extension View {
    func dismissKeyboardOnTap() -> some View {
        background(GuestKeyboardDismissTapBridge())
    }
}

enum GuestGoogleSignInError: LocalizedError {
    case missingClientId
    case missingRedirectScheme
    case failedToBuildAuthURL
    case cancelled
    case missingAuthorizationCode
    case invalidState
    case tokenExchangeFailed(String)
    case missingIdToken

    var errorDescription: String? {
        switch self {
        case .missingClientId:
            return "Google sign-in is not configured. Set GOOGLE_IOS_CLIENT_ID for the iOS target."
        case .missingRedirectScheme:
            return "Google sign-in is not configured. Set GOOGLE_REVERSED_CLIENT_ID as an iOS URL scheme."
        case .failedToBuildAuthURL:
            return "Could not start Google sign-in."
        case .cancelled:
            return "Google sign-in was cancelled."
        case .missingAuthorizationCode:
            return "Google sign-in did not return an authorization code."
        case .invalidState:
            return "Google sign-in returned an invalid state."
        case .tokenExchangeFailed(let message):
            return message.isEmpty ? "Google sign-in token exchange failed." : message
        case .missingIdToken:
            return "Google sign-in did not return an identity token."
        }
    }
}

final class GuestGoogleSignInSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var authSession: ASWebAuthenticationSession?

    func signIn() async throws -> String {
        let clientId = AppEnvironment.shared.googleClientId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clientId.isEmpty, !clientId.contains("YOUR_GOOGLE") else {
            throw GuestGoogleSignInError.missingClientId
        }

        let redirectScheme = AppEnvironment.shared.googleReversedClientId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !redirectScheme.isEmpty, !redirectScheme.contains("$(") else {
            throw GuestGoogleSignInError.missingRedirectScheme
        }

        let redirectURI = "\(redirectScheme):/oauth2redirect/google"
        let state = UUID().uuidString
        let nonce = UUID().uuidString
        let codeVerifier = Self.makeCodeVerifier()
        let codeChallenge = Self.makeCodeChallenge(from: codeVerifier)

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "prompt", value: "select_account")
        ]

        guard let authURL = components?.url else {
            throw GuestGoogleSignInError.failedToBuildAuthURL
        }

        let callbackURL = try await startAuthentication(url: authURL, callbackScheme: redirectScheme)
        let callbackComponents = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
        let returnedState = callbackComponents?.queryItems?.first(where: { $0.name == "state" })?.value
        guard returnedState == state else {
            throw GuestGoogleSignInError.invalidState
        }
        guard let code = callbackComponents?.queryItems?.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
            throw GuestGoogleSignInError.missingAuthorizationCode
        }

        return try await exchangeCodeForIdToken(
            code: code,
            clientId: clientId,
            redirectURI: redirectURI,
            codeVerifier: codeVerifier
        )
    }

    private func startAuthentication(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { callbackURL, error in
                self.authSession = nil
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                    return
                }
                if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                    continuation.resume(throwing: GuestGoogleSignInError.cancelled)
                    return
                }
                continuation.resume(throwing: error ?? GuestGoogleSignInError.failedToBuildAuthURL)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.authSession = session
            if !session.start() {
                self.authSession = nil
                continuation.resume(throwing: GuestGoogleSignInError.failedToBuildAuthURL)
            }
        }
    }

    private func exchangeCodeForIdToken(code: String, clientId: String, redirectURI: String, codeVerifier: String) async throws -> String {
        guard let tokenURL = URL(string: "https://oauth2.googleapis.com/token") else {
            throw GuestGoogleSignInError.tokenExchangeFailed("")
        }

        var request = URLRequest(url: tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Self.formEncodedBody([
            "client_id": clientId,
            "code": code,
            "code_verifier": codeVerifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirectURI
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? ""
            throw GuestGoogleSignInError.tokenExchangeFailed(message)
        }

        let tokenResponse = try JSONDecoder().decode(GoogleOAuthTokenResponse.self, from: data)
        guard !tokenResponse.idToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw GuestGoogleSignInError.missingIdToken
        }
        return tokenResponse.idToken
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for scene in scenes where scene.activationState == .foregroundActive {
            if let keyWindow = scene.windows.first(where: { $0.isKeyWindow }) {
                return keyWindow
            }
            if let window = scene.windows.first {
                return window
            }
        }
        return ASPresentationAnchor()
    }

    private static func makeCodeVerifier() -> String {
        let characters = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        var generator = SystemRandomNumberGenerator()
        return String((0..<64).map { _ in characters.randomElement(using: &generator)! })
    }

    private static func makeCodeChallenge(from verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncodedString()
    }

    private static func formEncodedBody(_ values: [String: String]) -> Data {
        values
            .map { key, value in
                "\(Self.formEncode(key))=\(Self.formEncode(value))"
            }
            .joined(separator: "&")
            .data(using: .utf8) ?? Data()
    }

    private static func formEncode(_ value: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: ":#[]@!$&'()*+,;=")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}

private struct GoogleOAuthTokenResponse: Decodable {
    let idToken: String

    enum CodingKeys: String, CodingKey {
        case idToken = "id_token"
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension Image {
    /// Loads PNGs copied into the app target (Copy Bundle Resources).
    /// SwiftUI `Image(_:)` only resolves Asset Catalog images; loose bundle files need a path lookup.
    init(guestBundleResource name: String, fileExtension: String = "png") {
        if let path = Bundle.main.path(forResource: name, ofType: fileExtension),
           let uiImage = UIImage(contentsOfFile: path) {
            self.init(uiImage: uiImage)
        } else if let uiImage = UIImage(named: name, in: .main, compatibleWith: nil) {
            self.init(uiImage: uiImage)
        } else {
            self.init(systemName: "photo")
        }
    }
}


struct GuestAppleSignInButton: View {
    let label: SignInWithAppleButton.Label
    let isDisabled: Bool
    let onAuthorized: @MainActor (String, String?, String?) async -> Void
    let onError: @MainActor (String) -> Void
    let customTitle: String?
    let customTextSize: CGFloat?

    init(
        label: SignInWithAppleButton.Label = .signIn,
        isDisabled: Bool = false,
        customTitle: String? = nil,
        customTextSize: CGFloat? = nil,
        onAuthorized: @escaping @MainActor (String, String?, String?) async -> Void,
        onError: @escaping @MainActor (String) -> Void
    ) {
        self.label = label
        self.isDisabled = isDisabled
        self.customTitle = customTitle
        self.customTextSize = customTextSize
        self.onAuthorized = onAuthorized
        self.onError = onError
    }

    var body: some View {
        if let customTitle, let customTextSize {
            appleAuthorizationButton
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay {
                    ZStack {
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(Color.black)

                        HStack(spacing: 10) {
                            Image(systemName: "applelogo")
                                .font(.system(size: max(customTextSize + 2, 14), weight: .semibold, design: .rounded))
                            Text(customTitle)
                                .font(.system(size: customTextSize, weight: .semibold, design: .rounded))
                        }
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    .allowsHitTesting(false)
                }
                .disabled(isDisabled)
                .opacity(isDisabled ? 0.55 : 1.0)
        } else {
            appleAuthorizationButton
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .disabled(isDisabled)
                .opacity(isDisabled ? 0.55 : 1.0)
        }
    }

    private var appleAuthorizationButton: some View {
        SignInWithAppleButton(label) { request in
            request.requestedScopes = [.fullName, .email]
        } onCompletion: { result in
            switch result {
            case .success(let authorization):
                handleAuthorization(authorization)
            case .failure(let error):
                if let authError = error as? ASAuthorizationError, authError.code == .canceled {
                    return
                }
                Task { @MainActor in
                    onError(error.localizedDescription)
                }
            }
        }
        .signInWithAppleButtonStyle(.black)
    }

    private func handleAuthorization(_ authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            Task { @MainActor in onError("Apple sign-in did not return a valid credential.") }
            return
        }
        guard
            let tokenData = credential.identityToken,
            let idToken = String(data: tokenData, encoding: .utf8),
            !idToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            Task { @MainActor in onError("Apple sign-in did not return an identity token.") }
            return
        }

        let firstName = credential.fullName?.givenName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let lastName = credential.fullName?.familyName?.trimmingCharacters(in: .whitespacesAndNewlines)
        Task { @MainActor in
            await onAuthorized(
                idToken,
                firstName?.isEmpty == false ? firstName : nil,
                lastName?.isEmpty == false ? lastName : nil
            )
        }
    }
}

struct GuestSurfaceCard<Content: View>: View {
    var background: Color = Color(.systemBackground)
    var contentPadding: CGFloat = 18
    var cornerRadius: CGFloat = 28
    @ViewBuilder let content: Content

    init(
        background: Color = Color(.systemBackground),
        contentPadding: CGFloat = 18,
        cornerRadius: CGFloat = 28,
        @ViewBuilder content: () -> Content
    ) {
        self.background = background
        self.contentPadding = contentPadding
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        content
            .padding(contentPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(background)
                    .shadow(color: .black.opacity(0.05), radius: 18, x: 0, y: 10)
            )
    }
}

struct GuestPill: View {
    let title: String
    var dark: Bool = false
    /// Calendra accent orange on blue booking header (company name).
    var companyAccent: Bool = false

    var body: some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundColor(foreground)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule(style: .continuous)
                    .fill(
                        dark
                            ? Color.white.opacity(companyAccent ? 0.14 : 0.16)
                            : Color(.secondarySystemBackground)
                    )
            )
    }

    private var foreground: Color {
        if dark && companyAccent {
            return Color(red: 0.902, green: 0.537, blue: 0.176)
        }
        if dark { return .white }
        return Color.primary
    }
}

struct GuestSectionHeader: View {
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 28, weight: .bold))
            if let subtitle {
                Text(subtitle)
                    .foregroundColor(.secondary)
            }
        }
    }
}
