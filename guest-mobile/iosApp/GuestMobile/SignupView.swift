import SwiftUI
import UIKit

struct SignupView: View {
    @EnvironmentObject private var store: AppStore
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var repeatPassword = ""
    @State private var passwordVisible = false
    @State private var repeatPasswordVisible = false
    @State private var phone = ""
    @State private var isSendingConfirmationCode = false
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    let onBackToLogin: () -> Void
    let onContinueToVerification: () -> Void

    private let accentBlue = Color(red: 0.078, green: 0.467, blue: 1.0)
    private let buttonBlueStart = Color(red: 0.000, green: 0.400, blue: 0.957)
    private let buttonBlueEnd = Color(red: 0.000, green: 0.325, blue: 0.859)
    private let navy = Color(red: 0.024, green: 0.102, blue: 0.227)
    private let muted = Color(red: 0.397, green: 0.447, blue: 0.541)
    private let border = Color(red: 0.792, green: 0.831, blue: 0.886)

    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }
    private var passwordsMatch: Bool { password == repeatPassword }
    private var canSubmit: Bool {
        !isSendingConfirmationCode &&
        !store.isLoading &&
        !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !password.isEmpty &&
        !repeatPassword.isEmpty &&
        passwordsMatch
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Image("SignupBackground")
                    .resizable()
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .ignoresSafeArea()

                Text(isSl ? "USTVARI RAČUN" : "CREATE ACCOUNT")
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .kerning(2.2)
                    .foregroundStyle(accentBlue)
                    .frameRect(proxy: proxy, x: 124, y: 300, width: 520, height: 42, alignment: .leading)

                Menu {
                    Button("Slovenščina") { appUiLocaleStorage = "sl" }
                    Button("English") { appUiLocaleStorage = "en" }
                } label: {
                    Image(systemName: "globe")
                        .font(.system(size: proxy.size.width * 0.054, weight: .semibold))
                        .foregroundStyle(accentBlue)
                        .frame(width: proxy.size.width * 76 / 941, height: proxy.size.height * 76 / 1672)
                        .contentShape(Circle())
                }
                .accessibilityLabel(isSl ? "Jezik" : "Language")
                .frameRect(proxy: proxy, x: 748, y: 283, width: 76, height: 76)

                Text(isSl ? "Začnite s\nsvojimi podatki" : "Start with\nyour details")
                    .font(.system(size: titleSize(for: proxy.size.width), weight: .heavy, design: .rounded))
                    .foregroundStyle(navy)
                    .lineSpacing(1)
                    .tracking(-0.8)
                    .frameRect(proxy: proxy, x: 124, y: 380, width: 650, height: 170, alignment: .leading)

                SignupTextInput(
                    placeholder: isSl ? "Ime" : "First",
                    systemIcon: "person",
                    text: $firstName,
                    keyboardType: .default,
                    textContentType: .givenName,
                    autocapitalization: .words,
                    accentBlue: accentBlue,
                    navy: navy,
                    muted: muted,
                    border: border
                )
                .frameRect(proxy: proxy, x: 124, y: 624, width: 330, height: 104)

                SignupTextInput(
                    placeholder: isSl ? "Priimek" : "Last",
                    systemIcon: "person",
                    text: $lastName,
                    keyboardType: .default,
                    textContentType: .familyName,
                    autocapitalization: .words,
                    accentBlue: accentBlue,
                    navy: navy,
                    muted: muted,
                    border: border
                )
                .frameRect(proxy: proxy, x: 473, y: 624, width: 330, height: 104)

                SignupTextInput(
                    placeholder: isSl ? "E-pošta" : "Email",
                    systemIcon: "envelope",
                    text: $email,
                    keyboardType: .emailAddress,
                    textContentType: .emailAddress,
                    autocapitalization: .never,
                    accentBlue: accentBlue,
                    navy: navy,
                    muted: muted,
                    border: border
                )
                .frameRect(proxy: proxy, x: 124, y: 768, width: 680, height: 104)

                SignupPasswordInput(
                    placeholder: isSl ? "Geslo" : "Password",
                    text: $password,
                    isVisible: $passwordVisible,
                    accentBlue: accentBlue,
                    navy: navy,
                    muted: muted,
                    border: border
                )
                .frameRect(proxy: proxy, x: 124, y: 912, width: 680, height: 104)

                SignupPasswordInput(
                    placeholder: isSl ? "Ponovite geslo" : "Repeat password",
                    text: $repeatPassword,
                    isVisible: $repeatPasswordVisible,
                    accentBlue: accentBlue,
                    navy: navy,
                    muted: muted,
                    border: border
                )
                .frameRect(proxy: proxy, x: 124, y: 1056, width: 680, height: 104)

                SignupTextInput(
                    placeholder: isSl ? "Telefon (neobvezno)" : "Phone (optional)",
                    systemIcon: "phone",
                    text: $phone,
                    keyboardType: .phonePad,
                    textContentType: .telephoneNumber,
                    autocapitalization: .never,
                    accentBlue: accentBlue,
                    navy: navy,
                    muted: muted,
                    border: border
                )
                .frameRect(proxy: proxy, x: 124, y: 1198, width: 680, height: 104)

                Button {
                    guard canSubmit else { return }
                    isSendingConfirmationCode = true
                    Task { @MainActor in
                        defer { isSendingConfirmationCode = false }
                        await store.signupStart(
                            firstName: firstName.trimmingCharacters(in: .whitespacesAndNewlines),
                            lastName: lastName.trimmingCharacters(in: .whitespacesAndNewlines),
                            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                            password: password,
                            phone: phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : phone.trimmingCharacters(in: .whitespacesAndNewlines),
                            language: appUiLocaleStorage
                        )
                        if store.signupChallenge != nil {
                            onContinueToVerification()
                        }
                    }
                } label: {
                    ZStack {
                        LinearGradient(colors: [buttonBlueStart, buttonBlueEnd], startPoint: .leading, endPoint: .trailing)
                        Text(isSendingConfirmationCode ? (isSl ? "Pošiljanje…" : "Sending…") : (isSl ? "Pošlji potrditveno kodo" : "Send confirmation code"))
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frameRect(proxy: proxy, x: 124, y: 1338, width: 680, height: 112)

                HStack(spacing: 0) {
                    Text(isSl ? "Že imate račun? " : "Already have an account? ")
                        .foregroundStyle(muted)
                        .fontWeight(.medium)
                    Text(isSl ? "Prijava" : "Sign in")
                        .foregroundStyle(accentBlue)
                        .fontWeight(.black)
                }
                .font(.system(size: 13, weight: .regular, design: .rounded))
                .contentShape(Rectangle())
                .onTapGesture {
                    guard !isSendingConfirmationCode, !store.isLoading else { return }
                    onBackToLogin()
                }
                .frameRect(proxy: proxy, x: 188, y: 1464, width: 565, height: 60)
            }
        }
    }

    private func titleSize(for width: CGFloat) -> CGFloat {
        if width < 360 { return 31 }
        if width < 410 { return 34 }
        return 36
    }
}

private struct SignupTextInput: View {
    let placeholder: String
    let systemIcon: String
    @Binding var text: String
    let keyboardType: UIKeyboardType
    let textContentType: UITextContentType?
    let autocapitalization: TextInputAutocapitalization
    let accentBlue: Color
    let navy: Color
    let muted: Color
    let border: Color

    var body: some View {
        HStack(spacing: 20) {
            Image(systemName: systemIcon)
                .font(.system(size: 22, weight: .regular, design: .rounded))
                .foregroundStyle(accentBlue)
                .frame(width: 26)

            TextField(placeholder, text: $text)
                .font(.system(size: 13, weight: .regular, design: .rounded))
                .foregroundStyle(navy)
                .tint(accentBlue)
                .keyboardType(keyboardType)
                .textContentType(textContentType)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled(true)
                .lineLimit(1)
        }
        .padding(.horizontal, 22)
        .background(Color.white.opacity(0.82))
        .overlay(Rectangle().stroke(border, lineWidth: 0.8))
    }
}

private struct SignupPasswordInput: View {
    let placeholder: String
    @Binding var text: String
    @Binding var isVisible: Bool
    let accentBlue: Color
    let navy: Color
    let muted: Color
    let border: Color

    var body: some View {
        HStack(spacing: 20) {
            Image(systemName: "lock")
                .font(.system(size: 22, weight: .regular, design: .rounded))
                .foregroundStyle(accentBlue)
                .frame(width: 26)

            Group {
                if isVisible {
                    TextField(placeholder, text: $text)
                } else {
                    SecureField(placeholder, text: $text)
                }
            }
            .font(.system(size: 13, weight: .regular, design: .rounded))
            .foregroundStyle(navy)
            .tint(accentBlue)
            .textContentType(.newPassword)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled(true)
            .lineLimit(1)

            Button {
                isVisible.toggle()
            } label: {
                Image(systemName: isVisible ? "eye.slash" : "eye")
                    .font(.system(size: 27, weight: .regular, design: .rounded))
                    .foregroundStyle(muted)
                    .frame(width: 34, height: 44)
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, 22)
        .padding(.trailing, 22)
        .background(Color.white.opacity(0.82))
        .overlay(Rectangle().stroke(border, lineWidth: 0.8))
    }
}

private extension View {
    func frameRect(
        proxy: GeometryProxy,
        x: CGFloat,
        y: CGFloat,
        width: CGFloat,
        height: CGFloat,
        alignment: Alignment = .center
    ) -> some View {
        self
            .frame(width: proxy.size.width * width / 941, height: proxy.size.height * height / 1672, alignment: alignment)
            .position(
                x: proxy.size.width * (x + width / 2) / 941,
                y: proxy.size.height * (y + height / 2) / 1672
            )
    }
}
