import SwiftUI

struct AuthResetTextField: View {
    let placeholder: String
    let systemIcon: String
    @Binding var text: String
    var secure: Bool = false
    @Binding var visible: Bool

    private let dark = Color(red: 0.03, green: 0.09, blue: 0.21)
    private let placeholderColor = Color(red: 0.40, green: 0.46, blue: 0.58)
    private let borderColor = Color(red: 0.83, green: 0.87, blue: 0.93)

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: systemIcon)
                .font(.system(size: 22, weight: .regular, design: .rounded))
                .foregroundStyle(Color(red: 0.14, green: 0.23, blue: 0.37))
                .frame(width: 24)

            Group {
                if secure && !visible {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundStyle(dark)
            .tint(dark)

            if secure {
                Button(action: { visible.toggle() }) {
                    Image(systemName: visible ? "eye.slash" : "eye")
                        .font(.system(size: 24, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color(red: 0.14, green: 0.23, blue: 0.37))
                }
            }
        }
        .padding(.horizontal, 16)
        .background(Color.white.opacity(0.72))
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(borderColor, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

struct ForgotPasswordView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    @State private var email: String
    @State private var code: String = ""
    @State private var submitting = false
    @State private var codeSent = false
    @State private var hidden = false
    @State private var errorText: String?
    let onCodeVerified: (String, String?) -> Void
    let onBackToLogin: () -> Void

    private var isSl: Bool { appUiLocaleStorage.lowercased() == "sl" }
    private let blue = Color(red: 0.02, green: 0.41, blue: 0.96)
    private let dark = Color(red: 0.03, green: 0.09, blue: 0.21)
    private let muted = Color(red: 0.38, green: 0.45, blue: 0.57)

    init(initialEmail: String = "", onCodeVerified: @escaping (String, String?) -> Void, onBackToLogin: @escaping () -> Void) {
        _email = State(initialValue: initialEmail)
        self.onCodeVerified = onCodeVerified
        self.onBackToLogin = onBackToLogin
    }

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = proxy.size.height
            let inset = width * 0.17
            let contentWidth = width - (inset * 2)
            let fieldHeight = height * 0.074
            let buttonHeight = height * 0.069

            ZStack(alignment: .topLeading) {
                Image("SigninBackground")
                    .resizable()
                    .scaledToFill()
                    .frame(width: width, height: height)
                    .clipped()
                    .ignoresSafeArea()

                if codeSent {
                    codeState(width: width, height: height, inset: inset, contentWidth: contentWidth, fieldHeight: fieldHeight, buttonHeight: buttonHeight)
                } else {
                    requestState(width: width, height: height, inset: inset, contentWidth: contentWidth, fieldHeight: fieldHeight, buttonHeight: buttonHeight)
                }
            }
        }
    }

    private func requestState(width: CGFloat, height: CGFloat, inset: CGFloat, contentWidth: CGFloat, fieldHeight: CGFloat, buttonHeight: CGFloat) -> some View {
        Group {
            Text(isSl ? "PONASTAVITEV GESLA" : "PASSWORD RESET")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(blue)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.253)

            Text(isSl ? "Pozabljeno geslo" : "Forgot password")
                .font(.system(size: 33, weight: .heavy, design: .rounded))
                .foregroundStyle(dark)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.302)

            Text(isSl ? "Vnesite e-poštni naslov, povezan z vašim\nračunom. Poslali vam bomo 6-mestno\nkodo za ponastavitev gesla." : "Enter the email address connected to\nyour account. We will send you a 6-digit\ncode to reset your password.")
                .font(.system(size: 15, weight: .regular, design: .rounded))
                .lineSpacing(5)
                .foregroundStyle(muted)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.392)

            AuthResetTextField(
                placeholder: isSl ? "E-pošta" : "Email",
                systemIcon: "envelope",
                text: $email,
                visible: $hidden
            )
            .keyboardType(.emailAddress)
            .frame(width: contentWidth, height: fieldHeight)
            .position(x: inset + contentWidth / 2, y: height * 0.508 + fieldHeight / 2)

            if let errorText {
                Text(errorText)
                    .font(.system(size: 12, weight: .regular, design: .rounded))
                    .foregroundStyle(Color.red)
                    .frame(width: contentWidth, alignment: .leading)
                    .position(x: inset + contentWidth / 2, y: height * 0.59)
            }

            Button {
                submitEmail()
            } label: {
                Text(submitting ? (isSl ? "Pošiljanje…" : "Sending…") : (isSl ? "Pošlji kodo" : "Send code"))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.plain)
            .disabled(submitting || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .foregroundStyle(Color.white)
            .background(blue.opacity(submitting ? 0.65 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .frame(width: contentWidth, height: buttonHeight)
            .position(x: inset + contentWidth / 2, y: height * 0.628 + buttonHeight / 2)

            Button(action: onBackToLogin) {
                Text(isSl ? "Nazaj na prijavo" : "Back to login")
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .foregroundStyle(blue)
            }
            .buttonStyle(.plain)
            .frame(width: contentWidth)
            .position(x: inset + contentWidth / 2, y: height * 0.748)
        }
    }

    private func codeState(width: CGFloat, height: CGFloat, inset: CGFloat, contentWidth: CGFloat, fieldHeight: CGFloat, buttonHeight: CGFloat) -> some View {
        Group {
            Text(isSl ? "PREVERJANJE KODE" : "CODE VERIFICATION")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(blue)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.253)

            Text(isSl ? "Vnesite kodo" : "Enter code")
                .font(.system(size: 34, weight: .heavy, design: .rounded))
                .foregroundStyle(dark)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.302)

            Text((isSl ? "6-mestno kodo za ponastavitev gesla smo\nposlali na\n" : "We sent a 6-digit password reset code to\n") + email.trimmingCharacters(in: .whitespacesAndNewlines))
                .font(.system(size: 15, weight: .regular, design: .rounded))
                .lineSpacing(5)
                .foregroundStyle(muted)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.395)

            AuthResetTextField(
                placeholder: isSl ? "Potrditvena koda" : "Verification code",
                systemIcon: "lock",
                text: $code,
                visible: $hidden
            )
            .keyboardType(.numberPad)
            .onChange(of: code) { value in
                let digits = value.filter { $0.isNumber }
                if digits != value || digits.count > 6 {
                    code = String(digits.prefix(6))
                }
            }
            .frame(width: contentWidth, height: fieldHeight)
            .position(x: inset + contentWidth / 2, y: height * 0.512 + fieldHeight / 2)

            Text(isSl ? "Koda velja 15 minut. Če je ne vidite, preverite mapo z vsiljeno pošto." : "The code is valid for 15 minutes. If you do not see it, check your spam folder.")
                .font(.system(size: 12, weight: .regular, design: .rounded))
                .foregroundStyle(muted)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.625)

            if let errorText {
                Text(errorText)
                    .font(.system(size: 12, weight: .regular, design: .rounded))
                    .foregroundStyle(Color.red)
                    .frame(width: contentWidth, alignment: .leading)
                    .position(x: inset + contentWidth / 2, y: height * 0.675)
            }

            Button {
                verifyCode()
            } label: {
                Text(submitting ? (isSl ? "Preverjanje…" : "Checking…") : (isSl ? "Potrdi kodo" : "Confirm code"))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.plain)
            .disabled(submitting || code.trimmingCharacters(in: .whitespacesAndNewlines).count != 6)
            .foregroundStyle(Color.white)
            .background(blue.opacity(submitting ? 0.65 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .frame(width: contentWidth, height: buttonHeight)
            .position(x: inset + contentWidth / 2, y: height * 0.704 + buttonHeight / 2)

            Button(action: submitEmail) {
                Text(isSl ? "Niste prejeli kode? Pošlji znova" : "Did not receive the code? Send again")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(blue)
            }
            .buttonStyle(.plain)
            .disabled(submitting)
            .frame(width: contentWidth)
            .position(x: inset + contentWidth / 2, y: height * 0.82)

            Button(action: onBackToLogin) {
                Text(isSl ? "Nazaj na prijavo" : "Back to login")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(blue)
            }
            .buttonStyle(.plain)
            .frame(width: contentWidth)
            .position(x: inset + contentWidth / 2, y: height * 0.865)
        }
    }

    private func submitEmail() {
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return }
        submitting = true
        errorText = nil
        Task {
            do {
                try await store.requestPasswordReset(email: normalized, locale: appUiLocaleStorage)
                await MainActor.run {
                    email = normalized
                    code = ""
                    codeSent = true
                    submitting = false
                }
            } catch {
                await MainActor.run {
                    errorText = error.localizedDescription
                    store.errorMessage = error.localizedDescription
                    submitting = false
                }
            }
        }
    }

    private func verifyCode() {
        let normalized = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty, normalizedCode.count == 6 else { return }
        submitting = true
        errorText = nil
        Task {
            do {
                let result = try await store.verifyPasswordResetCode(email: normalized, code: normalizedCode)
                await MainActor.run {
                    submitting = false
                    if result.verified, let token = result.resetToken, !token.isEmpty {
                        onCodeVerified(token, result.email ?? normalized)
                    } else {
                        errorText = isSl ? "Koda ni veljavna ali je potekla." : "The code is invalid or expired."
                    }
                }
            } catch {
                await MainActor.run {
                    errorText = isSl ? "Koda ni veljavna ali je potekla." : "The code is invalid or expired."
                    store.errorMessage = errorText
                    submitting = false
                }
            }
        }
    }
}
