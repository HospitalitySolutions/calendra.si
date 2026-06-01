import SwiftUI

struct ResetPasswordView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    let token: String
    let initialEmail: String?
    let onBackToLogin: () -> Void

    @State private var email: String = ""
    @State private var password: String = ""
    @State private var confirmPassword: String = ""
    @State private var passwordVisible = false
    @State private var confirmVisible = false
    @State private var validating = true
    @State private var valid = false
    @State private var submitting = false
    @State private var success = false
    @State private var errorText: String?

    private var isSl: Bool { appUiLocaleStorage.lowercased() == "sl" }
    private let blue = Color(red: 0.02, green: 0.41, blue: 0.96)
    private let dark = Color(red: 0.03, green: 0.09, blue: 0.21)
    private let muted = Color(red: 0.38, green: 0.45, blue: 0.57)

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

                if validating {
                    ProgressView()
                        .position(x: width / 2, y: height * 0.50)
                } else if success {
                    successState(width: width, height: height, inset: inset, contentWidth: contentWidth, buttonHeight: buttonHeight)
                } else if !valid {
                    invalidState(width: width, height: height, inset: inset, contentWidth: contentWidth, buttonHeight: buttonHeight)
                } else {
                    formState(width: width, height: height, inset: inset, contentWidth: contentWidth, fieldHeight: fieldHeight, buttonHeight: buttonHeight)
                }
            }
        }
        .task { await validateToken() }
    }

    private func formState(width: CGFloat, height: CGFloat, inset: CGFloat, contentWidth: CGFloat, fieldHeight: CGFloat, buttonHeight: CGFloat) -> some View {
        Group {
            Text(isSl ? "NASTAVITE NOVO GESLO" : "SET NEW PASSWORD")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(blue)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.253)

            Text(isSl ? "Novo geslo" : "New password")
                .font(.system(size: 34, weight: .heavy, design: .rounded))
                .foregroundStyle(dark)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.302)

            Text(isSl ? "Vnesite in potrdite novo geslo za\nsvoj račun." : "Enter and confirm a new password\nfor your account.")
                .font(.system(size: 15, weight: .regular, design: .rounded))
                .lineSpacing(5)
                .foregroundStyle(muted)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.385)

            AuthResetTextField(
                placeholder: isSl ? "Novo geslo" : "New password",
                systemIcon: "lock",
                text: $password,
                secure: true,
                visible: $passwordVisible
            )
            .frame(width: contentWidth, height: fieldHeight)
            .position(x: inset + contentWidth / 2, y: height * 0.484 + fieldHeight / 2)

            HStack(spacing: 8) {
                Image(systemName: "shield")
                Text(isSl ? "Vsaj 8 znakov, velika in mala črka ter številka" : "At least 8 characters, uppercase, lowercase and number")
            }
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(muted)
            .frame(width: contentWidth, alignment: .leading)
            .position(x: inset + contentWidth / 2, y: height * 0.586)

            AuthResetTextField(
                placeholder: isSl ? "Potrdite novo geslo" : "Confirm new password",
                systemIcon: "lock",
                text: $confirmPassword,
                secure: true,
                visible: $confirmVisible
            )
            .frame(width: contentWidth, height: fieldHeight)
            .position(x: inset + contentWidth / 2, y: height * 0.624 + fieldHeight / 2)

            if let errorText = errorText {
                Text(errorText)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.red)
                    .frame(width: contentWidth, alignment: .leading)
                    .position(x: inset + contentWidth / 2, y: height * 0.714)
            }

            Button(action: submit) {
                Text(submitting ? (isSl ? "Shranjevanje…" : "Saving…") : (isSl ? "Shrani novo geslo" : "Save new password"))
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.plain)
            .disabled(submitting)
            .foregroundStyle(Color.white)
            .background(blue.opacity(submitting ? 0.65 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .frame(width: contentWidth, height: buttonHeight)
            .position(x: inset + contentWidth / 2, y: height * 0.742 + buttonHeight / 2)

            Button(action: onBackToLogin) {
                Text(isSl ? "←  Nazaj na prijavo" : "←  Back to login")
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .foregroundStyle(blue)
            }
            .buttonStyle(.plain)
            .frame(width: contentWidth)
            .position(x: inset + contentWidth / 2, y: height * 0.846)
        }
    }

    private func successState(width: CGFloat, height: CGFloat, inset: CGFloat, contentWidth: CGFloat, buttonHeight: CGFloat) -> some View {
        Group {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 92, weight: .bold, design: .rounded))
                .foregroundStyle(Color.green)
                .position(x: width / 2, y: height * 0.37)
            Text(isSl ? "Geslo je shranjeno" : "Password saved")
                .font(.system(size: 32, weight: .heavy, design: .rounded))
                .foregroundStyle(dark)
                .frame(width: contentWidth, alignment: .center)
                .position(x: inset + contentWidth / 2, y: height * 0.50)
            Text(isSl ? "Zdaj se lahko prijavite z novim geslom." : "You can now sign in with your new password.")
                .font(.system(size: 15, weight: .regular, design: .rounded))
                .foregroundStyle(muted)
                .multilineTextAlignment(.center)
                .frame(width: contentWidth)
                .position(x: inset + contentWidth / 2, y: height * 0.56)
            Button(action: onBackToLogin) {
                Text(isSl ? "Nazaj na prijavo" : "Back to login")
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.white)
            .background(blue)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .frame(width: contentWidth, height: buttonHeight)
            .position(x: inset + contentWidth / 2, y: height * 0.66 + buttonHeight / 2)
        }
    }

    private func invalidState(width: CGFloat, height: CGFloat, inset: CGFloat, contentWidth: CGFloat, buttonHeight: CGFloat) -> some View {
        Group {
            Text(isSl ? "POVEZAVA NI VELJAVNA" : "LINK INVALID")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(blue)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.253)
            Text(isSl ? "Povezava je potekla" : "Link expired")
                .font(.system(size: 34, weight: .heavy, design: .rounded))
                .foregroundStyle(dark)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.31)
            Text(errorText ?? (isSl ? "Zahtevajte novo povezavo za ponastavitev gesla." : "Request a new password reset link."))
                .font(.system(size: 15, weight: .regular, design: .rounded))
                .lineSpacing(5)
                .foregroundStyle(muted)
                .frame(width: contentWidth, alignment: .leading)
                .position(x: inset + contentWidth / 2, y: height * 0.40)
            Button(action: onBackToLogin) {
                Text(isSl ? "Nazaj na prijavo" : "Back to login")
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.white)
            .background(blue)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .frame(width: contentWidth, height: buttonHeight)
            .position(x: inset + contentWidth / 2, y: height * 0.55 + buttonHeight / 2)
        }
    }

    private func validateToken() async {
        email = initialEmail ?? ""
        do {
            let result = try await store.validatePasswordResetToken(token)
            await MainActor.run {
                valid = result.valid
                if let resultEmail = result.email, !resultEmail.isEmpty { email = resultEmail }
                errorText = result.valid ? nil : (isSl ? "Povezava ni veljavna ali je potekla." : "The reset link is invalid or expired.")
                validating = false
            }
        } catch {
            await MainActor.run {
                valid = false
                errorText = error.localizedDescription
                validating = false
            }
        }
    }

    private func submit() {
        let validation = passwordValidationMessage()
        if let validation = validation {
            errorText = validation
            return
        }
        submitting = true
        Task {
            do {
                try await store.resetPassword(token: token, password: password)
                await MainActor.run {
                    success = true
                    submitting = false
                }
            } catch {
                await MainActor.run {
                    errorText = error.localizedDescription
                    submitting = false
                }
            }
        }
    }

    private func passwordValidationMessage() -> String? {
        if password.count < 8 { return isSl ? "Geslo mora imeti vsaj 8 znakov." : "Password must contain at least 8 characters." }
        if !password.contains(where: { $0.isNumber }) { return isSl ? "Geslo mora vsebovati vsaj eno številko." : "Password must contain at least one number." }
        if !password.contains(where: { $0.isUppercase }) { return isSl ? "Geslo mora vsebovati vsaj eno veliko črko." : "Password must contain at least one uppercase letter." }
        if !password.contains(where: { $0.isLowercase }) { return isSl ? "Geslo mora vsebovati vsaj eno malo črko." : "Password must contain at least one lowercase letter." }
        if password != confirmPassword { return isSl ? "Gesli se ne ujemata." : "Passwords do not match." }
        return nil
    }
}
