import SwiftUI

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
    private let placeholderColor = Color(red: 0.40, green: 0.46, blue: 0.58)
    private let borderColor = Color(red: 0.83, green: 0.87, blue: 0.93)

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: systemIcon)
                .font(.system(size: 22, weight: .regular, design: .rounded))
                .foregroundStyle(Color(red: 0.14, green: 0.23, blue: 0.37))
                .frame(width: 24)

            Group {
                if isSecure && !passwordVisible {
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

            if isSecure {
                Button(action: { passwordVisible.toggle() }) {
                    Image(systemName: passwordVisible ? "eye.slash" : "eye")
                        .font(.system(size: 24, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color(red: 0.14, green: 0.23, blue: 0.37))
                }
            }
        }
        .padding(.horizontal, 16)
        .background(Color.white.opacity(0.72))
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(borderColor, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 4))
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

                Menu {
                    Button("Slovenščina") { appUiLocaleStorage = "sl" }
                    Button("English") { appUiLocaleStorage = "en" }
                } label: {
                    Image(systemName: "globe")
                        .font(.system(size: width * 0.054, weight: .semibold))
                        .foregroundStyle(blue)
                        .frame(width: width * 0.112, height: width * 0.112)
                        .contentShape(Circle())
                }
                .accessibilityLabel(isSl ? "Jezik" : "Language")
                .position(x: width * 0.76 + (width * 0.112 / 2), y: height * 0.198 + (width * 0.112 / 2))

                Text(isSl ? "DOBRODOŠLI NAZAJ" : "WELCOME BACK")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(blue)
                    .frame(width: contentWidth, alignment: .leading)
                    .position(x: inset + contentWidth / 2, y: height * 0.211 + 7)

                Text(isSl ? "Prijava" : "Sign in")
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundStyle(dark)
                    .frame(width: contentWidth, alignment: .leading)
                    .position(x: inset + contentWidth / 2, y: height * 0.253 + 22)

                Text(isSl ? "Uporabite e-pošto ali nadaljujte\nz Googlom." : "Use your email or continue\nwith Google.")
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .lineSpacing(5)
                    .foregroundStyle(muted)
                    .frame(width: contentWidth, alignment: .leading)
                    .position(x: inset + contentWidth / 2, y: height * 0.329 + 22)

                LoginField(
                    placeholder: isSl ? "E-pošta" : "Email",
                    systemIcon: "envelope",
                    text: $email,
                    passwordVisible: $passwordVisible
                )
                .keyboardType(.emailAddress)
                .frame(width: contentWidth, height: fieldHeight)
                .position(x: inset + contentWidth / 2, y: height * 0.407 + fieldHeight / 2)

                LoginField(
                    placeholder: isSl ? "Geslo" : "Password",
                    systemIcon: "lock",
                    text: $password,
                    isSecure: true,
                    passwordVisible: $passwordVisible
                )
                .frame(width: contentWidth, height: fieldHeight)
                .position(x: inset + contentWidth / 2, y: height * 0.508 + fieldHeight / 2)

                Button {
                    onForgotPassword(email.trimmingCharacters(in: .whitespacesAndNewlines))
                } label: {
                    Text(isSl ? "Ste pozabili geslo?" : "Forgot password?")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(blue)
                }
                .buttonStyle(.plain)
                .frame(width: contentWidth, alignment: .trailing)
                .position(x: inset + contentWidth / 2, y: height * 0.596)

                Button {
                    Task {
                        await store.login(email: email, password: password)
                        if store.linkedTenants.isEmpty { onRequireJoin() } else { onLoginSuccess() }
                    }
                } label: {
                    Text(isSl ? "Prijava" : "Sign in")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.white)
                .background(blue)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .frame(width: contentWidth, height: buttonHeight)
                .position(x: inset + contentWidth / 2, y: height * 0.628 + buttonHeight / 2)

                HStack(spacing: 22) {
                    Rectangle().fill(Color(red: 0.87, green: 0.90, blue: 0.94)).frame(height: 1)
                    Text(isSl ? "ALI" : "OR")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color(red: 0.49, green: 0.54, blue: 0.64))
                    Rectangle().fill(Color(red: 0.87, green: 0.90, blue: 0.94)).frame(height: 1)
                }
                .frame(width: contentWidth)
                .position(x: inset + contentWidth / 2, y: height * 0.724 + 12)

                Button {
                } label: {
                    HStack(spacing: 14) {
                        Image("GoogleLogo")
                            .resizable()
                            .interpolation(.high)
                            .frame(width: 24, height: 24)
                            .offset(y: -3)
                        Text(isSl ? "Nadaljuj z Google" : "Continue with Google")
                            .font(.system(size: 15, weight: .regular, design: .rounded))
                            .foregroundStyle(dark)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .buttonStyle(.plain)
                .background(Color.white.opacity(0.78))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(blue, lineWidth: 1.5))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .frame(width: contentWidth, height: buttonHeight)
                .position(x: inset + contentWidth / 2, y: height * 0.753 + buttonHeight / 2)

                HStack(spacing: 0) {
                    Text(isSl ? "Nimate računa? " : "No account? ")
                        .foregroundStyle(Color(red: 0.41, green: 0.47, blue: 0.58))
                    Text(isSl ? "Ustvarite ga" : "Create one")
                        .foregroundStyle(blue)
                        .fontWeight(.bold)
                }
                .font(.system(size: 15, weight: .regular, design: .rounded))
                .onTapGesture { onCreateAccount() }
                .frame(width: contentWidth, alignment: .center)
                .position(x: inset + contentWidth / 2, y: height * 0.852 + 12)
            }
        }
    }
}
