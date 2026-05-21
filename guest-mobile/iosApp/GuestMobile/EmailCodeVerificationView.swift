import SwiftUI

struct EmailCodeVerificationView: View {
    @EnvironmentObject private var store: AppStore
    @State private var code = ""
    let onBackToLogin: () -> Void
    let onVerificationSuccess: () -> Void
    let onRequireJoin: () -> Void

    private let accentBlue = Color(red: 0.078, green: 0.467, blue: 1.0)
    private let buttonBlueStart = Color(red: 0.000, green: 0.400, blue: 0.957)
    private let buttonBlueEnd = Color(red: 0.000, green: 0.325, blue: 0.859)
    private let navy = Color(red: 0.024, green: 0.102, blue: 0.227)
    private let muted = Color(red: 0.397, green: 0.447, blue: 0.541)
    private let bodyText = Color(red: 0.373, green: 0.435, blue: 0.549)
    private let helperText = Color(red: 0.322, green: 0.388, blue: 0.478)
    private let border = Color(red: 0.792, green: 0.831, blue: 0.886)

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Image("SignupBackground")
                    .resizable()
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .ignoresSafeArea()

                Text("CHECK YOUR EMAIL")
                    .font(.system(size: 9, weight: .black, design: .rounded))
                    .kerning(2.2)
                    .foregroundStyle(accentBlue)
                    .verificationFrameRect(proxy: proxy, x: 124, y: 260, width: 680, height: 42, alignment: .leading)

                Text("Confirm to\nfinish")
                    .font(.system(size: titleSize(for: proxy.size.width), weight: .heavy, design: .rounded))
                    .foregroundStyle(navy)
                    .lineSpacing(1)
                    .tracking(-0.8)
                    .verificationFrameRect(proxy: proxy, x: 124, y: 340, width: 560, height: 130, alignment: .leading)

                Text("Enter the 6-digit verification code sent to\n\(store.signupChallenge?.email ?? "your email").")
                    .font(.system(size: 13, weight: .regular, design: .rounded))
                    .foregroundStyle(bodyText)
                    .lineSpacing(5)
                    .verificationFrameRect(proxy: proxy, x: 124, y: 518, width: 680, height: 96, alignment: .leading)

                VerificationCodeInput(
                    text: $code,
                    accentBlue: accentBlue,
                    navy: navy,
                    muted: muted,
                    border: border
                )
                .verificationFrameRect(proxy: proxy, x: 124, y: 662, width: 680, height: 104)

                Text("We keep this page simple and focused.")
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundStyle(helperText)
                    .verificationFrameRect(proxy: proxy, x: 124, y: 792, width: 680, height: 40, alignment: .leading)

                Button {
                    Task {
                        await store.verifySignupCode(code)
                        if store.linkedTenants.isEmpty {
                            onRequireJoin()
                        } else if store.errorMessage == nil {
                            onVerificationSuccess()
                        }
                    }
                } label: {
                    ZStack {
                        LinearGradient(colors: [buttonBlueStart, buttonBlueEnd], startPoint: .leading, endPoint: .trailing)
                        Text("Verify code")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .verificationFrameRect(proxy: proxy, x: 124, y: 860, width: 680, height: 112)

                Button {
                    Task { await store.resendSignupCode() }
                } label: {
                    Text("Resend code")
                        .font(.system(size: 15, weight: .black, design: .rounded))
                        .foregroundStyle(accentBlue)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .verificationFrameRect(proxy: proxy, x: 124, y: 1048, width: 320, height: 52, alignment: .leading)

                Button(action: onBackToLogin) {
                    Text("Back to login")
                        .font(.system(size: 13, weight: .regular, design: .rounded))
                        .foregroundStyle(muted)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .verificationFrameRect(proxy: proxy, x: 124, y: 1128, width: 320, height: 52, alignment: .leading)
            }
        }
    }

    private func titleSize(for width: CGFloat) -> CGFloat {
        if width < 360 { return 28 }
        if width < 410 { return 30 }
        return 32
    }
}

private struct VerificationCodeInput: View {
    @Binding var text: String
    let accentBlue: Color
    let navy: Color
    let muted: Color
    let border: Color

    var body: some View {
        HStack(spacing: 20) {
            Image(systemName: "lock")
                .font(.system(size: 22, weight: .regular, design: .rounded))
                .foregroundStyle(accentBlue)
                .frame(width: 28)

            TextField("Verification code", text: Binding(
                get: { text },
                set: { text = String($0.filter(\.isNumber).prefix(6)) }
            ))
            .font(.system(size: 13, weight: .regular, design: .rounded))
            .foregroundStyle(navy)
            .tint(accentBlue)
            .keyboardType(.numberPad)
            .textContentType(.oneTimeCode)
            .autocorrectionDisabled(true)
            .lineLimit(1)
        }
        .padding(.horizontal, 22)
        .background(Color.white.opacity(0.82))
        .overlay(Rectangle().stroke(border, lineWidth: 0.8))
    }
}

private extension View {
    func verificationFrameRect(
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
