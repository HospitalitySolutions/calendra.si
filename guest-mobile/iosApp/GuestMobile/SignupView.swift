import SwiftUI
import AuthenticationServices
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
    let onSocialAuthSuccess: () -> Void
    let onSocialAuthRequireJoin: () -> Void

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
            let width = proxy.size.width
            let height = proxy.size.height
            let horizontalInset = max(32, min(width * 0.15, 64))
            let contentWidth = width - (horizontalInset * 2)
            let fieldHeight = max(44, min(height * 0.052, 48))
            let buttonHeight = max(48, min(height * 0.058, 54))
            let socialButtonHeight = max(44, min(height * 0.054, 50))
            let topOffset = max(proxy.safeAreaInsets.top + 42, min(height * 0.12, 96))
            let socialSpacing: CGFloat = 14
            let socialButtonWidth = (contentWidth - socialSpacing) / 2

            ZStack(alignment: .topLeading) {
                Color.white.ignoresSafeArea()
                SignupFullScreenBackground(resourceName: "SignupBackground")

                Color.clear
                    .contentShape(Rectangle())
                    .ignoresSafeArea(.container, edges: .all)
                    .onTapGesture { dismissKeyboard() }

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        Color.clear.frame(height: topOffset)

                        HStack(alignment: .top) {
                            Text(isSl ? "USTVARI RAČUN" : "CREATE ACCOUNT")
                                 .font(.system(size: 11, weight: .black, design: .rounded))
                                 .kerning(2.0)
                                .foregroundStyle(accentBlue)
                                .frame(maxWidth: .infinity, alignment: .leading)

                            languageMenu(iconSize: width * 0.054, side: width * 0.112)
                                 .offset(y: 16)
                        }

                        Text(isSl ? "Začnite s..." : "Start with...")
                            .font(.system(size: titleSize(for: width), weight: .heavy, design: .rounded))
                            .foregroundStyle(navy)
                            .tracking(-0.8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                             .padding(.top, 14)

                        HStack(spacing: 16) {
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
                            .frame(width: (contentWidth - 16) / 2, height: fieldHeight)

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
                            .frame(width: (contentWidth - 16) / 2, height: fieldHeight)
                        }
                         .padding(.top, max(18, height * 0.024))

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
                        .frame(width: contentWidth, height: fieldHeight)
                         .padding(.top, 12)

                        SignupPasswordInput(
                            placeholder: isSl ? "Geslo" : "Password",
                            text: $password,
                            isVisible: $passwordVisible,
                            accentBlue: accentBlue,
                            navy: navy,
                            muted: muted,
                            border: border
                        )
                        .frame(width: contentWidth, height: fieldHeight)
                         .padding(.top, 12)

                        SignupPasswordInput(
                            placeholder: isSl ? "Ponovite geslo" : "Repeat password",
                            text: $repeatPassword,
                            isVisible: $repeatPasswordVisible,
                            accentBlue: accentBlue,
                            navy: navy,
                            muted: muted,
                            border: border
                        )
                        .frame(width: contentWidth, height: fieldHeight)
                         .padding(.top, 12)

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
                        .frame(width: contentWidth, height: fieldHeight)
                         .padding(.top, 12)

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
                                     .font(.system(size: 16, weight: .bold, design: .rounded))
                                    .foregroundStyle(.white)
                            }
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .contentShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .disabled(!canSubmit)
                        .opacity(canSubmit ? 1.0 : 0.68)
                        .frame(width: contentWidth, height: buttonHeight)
                         .padding(.top, 18)

                        HStack(spacing: 22) {
                            Rectangle().fill(Color(red: 0.84, green: 0.88, blue: 0.93)).frame(height: 1)
                            Text(isSl ? "ALI" : "OR")
                                 .font(.system(size: 13, weight: .semibold, design: .rounded))
                                .foregroundStyle(Color(red: 0.49, green: 0.54, blue: 0.64))
                            Rectangle().fill(Color(red: 0.84, green: 0.88, blue: 0.93)).frame(height: 1)
                        }
                        .frame(width: contentWidth)
                         .padding(.top, 14)

                        HStack(spacing: socialSpacing) {
                            GuestAppleSignInButton(
                                label: .signUp,
                                isDisabled: isSendingConfirmationCode || store.isLoading,
                                customTitle: "Sign up with Apple",
                                customTextSize: width < 380 ? 9 : 10,
                                onAuthorized: { idToken, firstName, lastName in
                                    await store.loginWithApple(idToken: idToken, firstName: firstName, lastName: lastName)
                                    guard store.errorMessage == nil else { return }
                                    if store.linkedTenants.isEmpty { onSocialAuthRequireJoin() } else { onSocialAuthSuccess() }
                                },
                                onError: { message in
                                    store.errorMessage = message
                                }
                            )
                            .frame(width: socialButtonWidth, height: socialButtonHeight)
                            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))

                            Button {
                                startGoogleSignIn()
                            } label: {
                                HStack(spacing: 8) {
                                    Image(guestBundleResource: "GoogleLogo")
                                        .resizable()
                                        .interpolation(.high)
                                        .scaledToFit()
                                         .frame(width: 18, height: 18)
                                        .offset(y: -2)
                                    Text("Sign up with Google")
                                        .font(.system(size: width < 380 ? 9 : 10, weight: .semibold, design: .rounded))
                                        .foregroundStyle(navy)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.78)
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                            .buttonStyle(SignupSocialHighlightButtonStyle(
                                isDisabled: isSendingConfirmationCode || store.isLoading,
                                highlightColor: accentBlue.opacity(0.14)
                            ))
                            .background(Color.white.opacity(0.82))
                            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(accentBlue, lineWidth: 1.5))
                            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                            .disabled(isSendingConfirmationCode || store.isLoading)
                            .opacity((isSendingConfirmationCode || store.isLoading) ? 0.55 : 1.0)
                            .frame(width: socialButtonWidth, height: socialButtonHeight)
                        }
                         .padding(.top, 12)

                        HStack(spacing: 0) {
                            Text(isSl ? "Že imate račun? " : "Already have an account? ")
                                .foregroundStyle(muted)
                                .fontWeight(.medium)
                            Text(isSl ? "Prijava" : "Sign in")
                                .foregroundStyle(accentBlue)
                                .fontWeight(.black)
                        }
                         .font(.system(size: 14, weight: .regular, design: .rounded))
                        .contentShape(Rectangle())
                        .onTapGesture {
                            guard !isSendingConfirmationCode, !store.isLoading else { return }
                            onBackToLogin()
                        }
                        .frame(width: contentWidth, alignment: .center)
                         .padding(.top, 18)
                        .padding(.bottom, max(proxy.safeAreaInsets.bottom + 32, 42))
                    }
                    .frame(maxWidth: .infinity, alignment: .top)
                    .padding(.horizontal, horizontalInset)
                }
                .scrollDismissesKeyboard(.interactively)
                .ignoresSafeArea(.keyboard, edges: .bottom)
            }
        }
        .dismissKeyboardOnTap()
    }

    private func titleSize(for width: CGFloat) -> CGFloat {
        if width < 360 { return 30 }
        if width < 410 { return 33 }
        return 36
    }

    @ViewBuilder
    private func languageMenu(iconSize: CGFloat, side: CGFloat) -> some View {
        Menu {
            Button("Slovenščina") { appUiLocaleStorage = "sl" }
            Button("English") { appUiLocaleStorage = "en" }
        } label: {
            Image(systemName: "globe")
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(accentBlue)
                .frame(width: side, height: side)
                .contentShape(Circle())
        }
        .accessibilityLabel(isSl ? "Jezik" : "Language")
    }

    private func startGoogleSignIn() {
        guard !isSendingConfirmationCode, !store.isLoading else { return }
        Task { @MainActor in
            do {
                let idToken = try await GuestGoogleSignInSession().signIn()
                await store.loginWithGoogle(idToken: idToken)
                guard store.errorMessage == nil else { return }
                if store.linkedTenants.isEmpty { onSocialAuthRequireJoin() } else { onSocialAuthSuccess() }
            } catch GuestGoogleSignInError.cancelled {
                return
            } catch {
                store.errorMessage = error.localizedDescription
            }
        }
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

private struct SignupSocialHighlightButtonStyle: ButtonStyle {
    let isDisabled: Bool
    let highlightColor: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(highlightColor.opacity(configuration.isPressed && !isDisabled ? 1.0 : 0.0))
            .scaleEffect(configuration.isPressed && !isDisabled ? 0.985 : 1.0)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

private struct SignupFullScreenBackground: View {
    let resourceName: String

    var body: some View {
        GeometryReader { backgroundProxy in
            Image(guestBundleResource: resourceName)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(
                    width: backgroundProxy.size.width,
                    height: backgroundProxy.size.height,
                    alignment: .bottom
                )
                .clipped()
        }
        .ignoresSafeArea(.container, edges: .all)
        .ignoresSafeArea(.keyboard, edges: .bottom)
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
        HStack(spacing: 14) {
            Image(systemName: systemIcon)
                 .font(.system(size: 21, weight: .regular, design: .rounded))
                .foregroundStyle(accentBlue)
                .frame(width: 28, height: 30)

            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(placeholder)
                         .font(.system(size: 14, weight: .regular, design: .rounded))
                        .foregroundStyle(Color(red: 0.68, green: 0.73, blue: 0.82))
                        .lineLimit(1)
                        .allowsHitTesting(false)
                }

                TextField("", text: $text)
                     .font(.system(size: 14, weight: .regular, design: .rounded))
                    .foregroundStyle(navy)
                    .tint(accentBlue)
                    .keyboardType(keyboardType)
                    .textContentType(textContentType)
                    .textInputAutocapitalization(autocapitalization)
                    .autocorrectionDisabled(true)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
         .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white.opacity(0.84))
        .overlay(
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .stroke(border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
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
        HStack(spacing: 14) {
            Image(systemName: "lock")
                 .font(.system(size: 21, weight: .regular, design: .rounded))
                .foregroundStyle(accentBlue)
                .frame(width: 28, height: 30)

            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(placeholder)
                         .font(.system(size: 14, weight: .regular, design: .rounded))
                        .foregroundStyle(Color(red: 0.68, green: 0.73, blue: 0.82))
                        .lineLimit(1)
                        .allowsHitTesting(false)
                }

                Group {
                    if isVisible {
                        TextField("", text: $text)
                    } else {
                        SecureField("", text: $text)
                    }
                }
                 .font(.system(size: 14, weight: .regular, design: .rounded))
                .foregroundStyle(navy)
                .tint(accentBlue)
                .textContentType(.newPassword)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .lineLimit(1)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

            Button {
                isVisible.toggle()
            } label: {
                Image(systemName: isVisible ? "eye.slash" : "eye")
                     .font(.system(size: 23, weight: .regular, design: .rounded))
                    .foregroundStyle(muted)
                    .frame(width: 32, height: 40)
            }
            .buttonStyle(.plain)
        }
         .padding(.leading, 16)
         .padding(.trailing, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white.opacity(0.84))
        .overlay(
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .stroke(border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}
