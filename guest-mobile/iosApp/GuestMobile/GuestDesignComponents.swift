import SwiftUI
import UIKit
import AuthenticationServices

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

    init(
        label: SignInWithAppleButton.Label = .signIn,
        isDisabled: Bool = false,
        onAuthorized: @escaping @MainActor (String, String?, String?) async -> Void,
        onError: @escaping @MainActor (String) -> Void
    ) {
        self.label = label
        self.isDisabled = isDisabled
        self.onAuthorized = onAuthorized
        self.onError = onError
    }

    var body: some View {
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
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.55 : 1.0)
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
