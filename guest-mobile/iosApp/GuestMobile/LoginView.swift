import SwiftUI
import AuthenticationServices
import UIKit

private struct GoogleLogoMark: View {
    var size: CGFloat = 28

    var body: some View {
        Canvas { context, canvasSize in
            let strokeWidth = min(canvasSize.width, canvasSize.height) * 0.24
            let inset = strokeWidth / 2
            let rect = CGRect(x: inset, y: inset, width: canvasSize.width - strokeWidth, height: canvasSize.height - strokeWidth)
            let style = StrokeStyle(lineWidth: strokeWidth, lineCap: .butt)

            func arc(_ start: Double, _ end: Double, color: Color) {
                var path = Path()
                path.addArc(
                    center: CGPoint(x: rect.midX, y: rect.midY),
                    radius: rect.width / 2,
                    startAngle: .degrees(start),
                    endAngle: .degrees(end),
                    clockwise: false
                )
                context.stroke(path, with: .color(color), style: style)
            }

            arc(-38, 36, color: Color(red: 0.26, green: 0.52, blue: 0.96))
            arc(36, 128, color: Color(red: 0.92, green: 0.26, blue: 0.21))
            arc(128, 214, color: Color(red: 0.98, green: 0.74, blue: 0.02))
            arc(214, 326, color: Color(red: 0.20, green: 0.66, blue: 0.33))

            let centerDot = Path(ellipseIn: CGRect(
                x: rect.midX - rect.width * 0.26,
                y: rect.midY - rect.height * 0.26,
                width: rect.width * 0.52,
                height: rect.height * 0.52
            ))
            context.fill(centerDot, with: .color(.white))

            var bar = Path()
            let y = rect.midY + 0.04 * rect.height
            bar.move(to: CGPoint(x: rect.midX + rect.width * 0.05, y: y))
            bar.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.01, y: y))
            context.stroke(bar, with: .color(Color(red: 0.26, green: 0.52, blue: 0.96)), style: style)
        }
        .frame(width: size, height: size)
    }
}

private struct LoginField: View {
    let placeholder: String
    let systemIcon: String
    @Binding var text: String
    var isSecure = false
    @Binding var passwordVisible: Bool

    private let dark = Color(red: 0.03, green: 0.09, blue: 0.21)
    private let placeholderColor = Color(red: 0.68, green: 0.73, blue: 0.82)
    private let borderColor = Color(red: 0.78, green: 0.84, blue: 0.92)
    private let iconColor = Color(red: 0.14, green: 0.23, blue: 0.37)

    var body: some View {
        HStack(spacing: 18) {
            Image(systemName: systemIcon)
                .font(.system(size: 23, weight: .regular, design: .rounded))
                .foregroundStyle(iconColor)
                .frame(width: 28, height: 30)

            fieldBody
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

            if isSecure {
                Button(action: { passwordVisible.toggle() }) {
                    Image(systemName: passwordVisible ? "eye.slash" : "eye")
                        .font(.system(size: 26, weight: .regular, design: .rounded))
                        .foregroundStyle(iconColor)
                        .frame(width: 34, height: 40)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(passwordVisible ? "Hide password" : "Show password")
            }
        }
        .padding(.leading, 18)
        .padding(.trailing, isSecure ? 14 : 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white.opacity(0.82))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(borderColor, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    @ViewBuilder
    private var fieldBody: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .foregroundStyle(placeholderColor)
                    .allowsHitTesting(false)
            }

            Group {
                if isSecure && !passwordVisible {
                    SecureField("", text: $text)
                        .textContentType(.password)
                } else {
                    TextField("", text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .textContentType(isSecure ? .password : .emailAddress)
                        .keyboardType(isSecure ? .default : .emailAddress)
                }
            }
            .font(.system(size: 15, weight: .regular, design: .rounded))
            .foregroundStyle(dark)
            .tint(dark)
            .lineLimit(1)
            .submitLabel(isSecure ? .done : .next)
        }
    }
}

private struct LoginFullScreenBackground: View {
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

struct LoginView: View {
    @EnvironmentObject private var store: AppStore
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var passwordVisible = false
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    let onLoginSuccess: () -> Void
    let onRequireJoin: () -> Void
    let onCreateAccount: () -> Void
    let onForgotPassword: (String) -> Void
    private var isSl: Bool { appUiLocaleStorage.lowercased() == "sl" }

    private let blue = Color(red: 0.02, green: 0.41, blue: 0.96)
    private let dark = Color(red: 0.03, green: 0.09, blue: 0.21)
    private let muted = Color(red: 0.38, green: 0.45, blue: 0.57)

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = proxy.size.height
            let horizontalInset = max(38, min(width * 0.17, 74))
            let contentWidth = width - (horizontalInset * 2)
            let fieldHeight = max(46, min(height * 0.056, 52))
            let buttonHeight = max(48, min(height * 0.056, 52))
            let topOffset = max(proxy.safeAreaInsets.top + 64, min(height * 0.145, 134))

            ZStack(alignment: .topLeading) {
                Color.white.ignoresSafeArea()
                LoginFullScreenBackground(resourceName: "SigninBackground")

                Color.clear
                    .contentShape(Rectangle())
                    .ignoresSafeArea(.container, edges: .all)
                    .onTapGesture { dismissKeyboard() }

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        Color.clear.frame(height: topOffset)

                        Text(isSl ? "DOBRODOŠLI NAZAJ" : "WELCOME BACK")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .kerning(1.1)
                            .foregroundStyle(blue)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .overlay(alignment: .topTrailing) {
                                languageMenu(iconSize: width * 0.054, side: width * 0.112)
                                    .offset(y: 32)
                            }

                        Text(isSl ? "Prijava" : "Sign in")
                            .font(.system(size: 38, weight: .heavy, design: .rounded))
                            .tracking(-0.8)
                            .foregroundStyle(dark)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 22)

                        Text(isSl ? "Uporabite e-pošto ali nadaljujte\nz Applom ali Googlom." : "Use your email or continue\nwith Apple or Google.")
                            .font(.system(size: 17, weight: .regular, design: .rounded))
                            .lineSpacing(6)
                            .foregroundStyle(muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 22)

                        LoginField(
                            placeholder: isSl ? "E-pošta" : "Email",
                            systemIcon: "envelope",
                            text: $email,
                            passwordVisible: $passwordVisible
                        )
                        .frame(width: contentWidth, height: fieldHeight)
                        .padding(.top, 30)

                        LoginField(
                            placeholder: isSl ? "Geslo" : "Password",
                            systemIcon: "lock",
                            text: $password,
                            isSecure: true,
                            passwordVisible: $passwordVisible
                        )
                        .frame(width: contentWidth, height: fieldHeight)
                        .padding(.top, 16)

                        Button {
                            onForgotPassword(email.trimmingCharacters(in: .whitespacesAndNewlines))
                        } label: {
                            Text(isSl ? "Ste pozabili geslo?" : "Forgot password?")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                                .foregroundStyle(blue)
                        }
                        .buttonStyle(.plain)
                        .frame(width: contentWidth, alignment: .trailing)
                        .padding(.top, 14)

                        Button {
                            Task {
                                await store.login(email: email, password: password)
                                if store.linkedTenants.isEmpty { onRequireJoin() } else { onLoginSuccess() }
                            }
                        } label: {
                            Text(isSl ? "Prijava" : "Sign in")
                                .font(.system(size: 18, weight: .semibold, design: .rounded))
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.white)
                        .background(blue)
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                        .frame(width: contentWidth, height: buttonHeight)
                        .padding(.top, 24)

                        HStack(spacing: 22) {
                            Rectangle().fill(Color(red: 0.84, green: 0.88, blue: 0.93)).frame(height: 1)
                            Text(isSl ? "ALI" : "OR")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                                .foregroundStyle(Color(red: 0.49, green: 0.54, blue: 0.64))
                            Rectangle().fill(Color(red: 0.84, green: 0.88, blue: 0.93)).frame(height: 1)
                        }
                        .frame(width: contentWidth)
                        .padding(.top, 22)

                        GuestAppleSignInButton(
                            label: .signIn,
                            isDisabled: store.isLoading,
                            customTitle: "Sign in with Apple",
                            customTextSize: 14,
                            onAuthorized: { idToken, firstName, lastName in
                                await store.loginWithApple(idToken: idToken, firstName: firstName, lastName: lastName)
                                guard store.errorMessage == nil else { return }
                                if store.linkedTenants.isEmpty { onRequireJoin() } else { onLoginSuccess() }
                            },
                            onError: { message in
                                store.errorMessage = message
                            }
                        )
                        .frame(width: contentWidth, height: buttonHeight)
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                        .padding(.top, 18)

                        Button {
                            startGoogleSignIn()
                        } label: {
                            HStack(spacing: 16) {
                                Image(guestBundleResource: "GoogleLogo")
                                    .resizable()
                                    .interpolation(.high)
                                    .scaledToFit()
                                    .frame(width: 24, height: 24)
                                    .offset(y: -2)
                                Text(isSl ? "Nadaljuj z Google" : "Continue with Google")
                                    .font(.system(size: 16, weight: .regular, design: .rounded))
                                    .foregroundStyle(dark)
                            }
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                        .buttonStyle(.plain)
                        .background(Color.white.opacity(0.82))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(blue, lineWidth: 1.5))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .frame(width: contentWidth, height: buttonHeight)
                        .disabled(store.isLoading)
                        .opacity(store.isLoading ? 0.55 : 1.0)
                        .padding(.top, 14)

                        HStack(spacing: 0) {
                            Text(isSl ? "Nimate računa? " : "No account? ")
                                .foregroundStyle(Color(red: 0.41, green: 0.47, blue: 0.58))
                            Text(isSl ? "Ustvarite ga" : "Create one")
                                .foregroundStyle(blue)
                                .fontWeight(.bold)
                        }
                        .font(.system(size: 16, weight: .regular, design: .rounded))
                        .contentShape(Rectangle())
                        .onTapGesture { onCreateAccount() }
                        .frame(width: contentWidth, alignment: .center)
                        .padding(.top, 32)
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

    @ViewBuilder
    private func languageMenu(iconSize: CGFloat, side: CGFloat) -> some View {
        Menu {
            Button("Slovenščina") { appUiLocaleStorage = "sl" }
            Button("English") { appUiLocaleStorage = "en" }
        } label: {
            Image(systemName: "globe")
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(blue)
                .frame(width: side, height: side)
                .contentShape(Circle())
        }
        .accessibilityLabel(isSl ? "Jezik" : "Language")
    }

    private func startGoogleSignIn() {
        guard !store.isLoading else { return }
        Task { @MainActor in
            do {
                let idToken = try await GuestGoogleSignInSession().signIn()
                await store.loginWithGoogle(idToken: idToken)
                guard store.errorMessage == nil else { return }
                if store.linkedTenants.isEmpty { onRequireJoin() } else { onLoginSuccess() }
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
