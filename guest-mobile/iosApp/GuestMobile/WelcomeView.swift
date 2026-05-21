import SwiftUI

private struct WelcomeCopy {
    let eyebrow: String
    let headline: String
    let fastBooking: String
    let fastBookingDescription: String
    let wallet: String
    let walletDescription: String
    let notifications: String
    let notificationsDescription: String
    let secureLogin: String
    let secureLoginDescription: String
    let continueCta: String
    let alreadyHaveAccount: String

    static func forLanguageCode(_ code: String) -> WelcomeCopy {
        if code.lowercased() == "sl" {
            return WelcomeCopy(
                eyebrow: "GOSTOVSKA APLIKACIJA",
                headline: "Rezervirajte.\nUpravljajte.\nUživajte.",
                fastBooking: "Hitra rezervacija",
                fastBookingDescription: "Poiščite termin in rezervirajte\nv nekaj klikih.",
                wallet: "Denarnica",
                walletDescription: "Upravljajte plačila hitro in varno.",
                notifications: "Pametna obvestila",
                notificationsDescription: "Prejemajte obvestila o vaših\nrezervacijah.",
                secureLogin: "Bodi varen",
                secureLoginDescription: "Vaši podatki so zaščiteni.",
                continueCta: "Nadaljuj",
                alreadyHaveAccount: "Že imam račun"
            )
        }
        return WelcomeCopy(
            eyebrow: "GUEST APP",
            headline: "Book.\nManage.\nEnjoy.",
            fastBooking: "Fast booking",
            fastBookingDescription: "Find a time and book\nin a few taps.",
            wallet: "Wallet",
            walletDescription: "Manage payments quickly and safely.",
            notifications: "Smart notifications",
            notificationsDescription: "Receive updates about\nyour bookings.",
            secureLogin: "Stay safe",
            secureLoginDescription: "Your data is protected.",
            continueCta: "Continue",
            alreadyHaveAccount: "I already have an account"
        )
    }
}

private struct WelcomeMetrics {
    let horizontalPadding: CGFloat
    let topPadding: CGFloat
    let eyebrowFontSize: CGFloat
    let eyebrowHorizontalPadding: CGFloat
    let eyebrowVerticalPadding: CGFloat
    let headlineTopPadding: CGFloat
    let headlineSize: CGFloat
    let headlineLineSpacing: CGFloat
    let featuresTopPadding: CGFloat
    let featureSpacing: CGFloat
    let iconSize: CGFloat
    let iconSymbolSize: CGFloat
    let featureTitleSize: CGFloat
    let featureDescriptionSize: CGFloat
    let featureDescriptionSpacing: CGFloat
    let featureWidth: CGFloat
    let featureLabelWidth: CGFloat
    let contentSpacer: CGFloat
    let ctaSpacing: CGFloat
    let buttonHeight: CGFloat
    let buttonTextSize: CGFloat
    let secondaryCtaSize: CGFloat
    let secondaryCtaVerticalPadding: CGFloat
    let bottomPadding: CGFloat
}

struct WelcomeView: View {
    let onContinue: () -> Void
    let onAlreadyHaveAccount: () -> Void

    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    private let accentBlue = Color(red: 0.071, green: 0.451, blue: 1.0)
    private let ctaBlue = Color(red: 0.070, green: 0.333, blue: 0.780)
    private let navy = Color(red: 0.027, green: 0.100, blue: 0.225)
    private let muted = Color(red: 0.306, green: 0.372, blue: 0.494)
    private let iconBackground = Color(red: 0.918, green: 0.957, blue: 1.0)

    private var languageCode: String {
        let v = appUiLocaleStorage.lowercased()
        return (v == "en" || v == "sl") ? v : "sl"
    }

    private var copy: WelcomeCopy {
        WelcomeCopy.forLanguageCode(languageCode)
    }

    var body: some View {
        GeometryReader { proxy in
            let metrics = layoutMetrics(for: proxy.size)

            ZStack {
                Image("WelcomeBookingBackground")
                    .resizable()
                    .scaledToFill()
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()
                    .ignoresSafeArea()

                LinearGradient(
                    stops: [
                        .init(color: Color(red: 0.973, green: 0.988, blue: 1.0).opacity(0.97), location: 0.0),
                        .init(color: Color(red: 0.973, green: 0.988, blue: 1.0).opacity(0.90), location: 0.38),
                        .init(color: Color.white.opacity(0.30), location: 0.58),
                        .init(color: Color.white.opacity(0.0), location: 1.0)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .ignoresSafeArea()

                LinearGradient(
                    stops: [
                        .init(color: Color(red: 0.91, green: 0.96, blue: 1.0).opacity(0.48), location: 0.0),
                        .init(color: Color.clear, location: 0.22),
                        .init(color: Color.clear, location: 0.70),
                        .init(color: Color(red: 0.965, green: 0.984, blue: 1.0).opacity(0.97), location: 1.0)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(copy.eyebrow)
                            .font(.system(size: metrics.eyebrowFontSize, weight: .black))
                            .kerning(1.0)
                            .foregroundStyle(accentBlue)
                            .padding(.horizontal, metrics.eyebrowHorizontalPadding)
                            .padding(.vertical, metrics.eyebrowVerticalPadding)
                            .overlay(
                                Rectangle()
                                    .stroke(accentBlue, lineWidth: 1)
                            )
                            .padding(.top, metrics.topPadding)

                        Text(copy.headline)
                            .font(.system(size: metrics.headlineSize, weight: .black, design: .rounded))
                            .lineSpacing(metrics.headlineLineSpacing)
                            .foregroundStyle(navy)
                            .minimumScaleFactor(0.88)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, metrics.headlineTopPadding)

                        VStack(alignment: .leading, spacing: metrics.featureSpacing) {
                            featureLine(symbol: "calendar.badge.checkmark", title: copy.fastBooking, description: copy.fastBookingDescription, metrics: metrics)
                            featureLine(symbol: "creditcard", title: copy.wallet, description: copy.walletDescription, metrics: metrics)
                            featureLine(symbol: "bell", title: copy.notifications, description: copy.notificationsDescription, metrics: metrics)
                            featureLine(symbol: "lock.shield", title: copy.secureLogin, description: copy.secureLoginDescription, metrics: metrics)
                        }
                        .padding(.top, metrics.featuresTopPadding)
                    }

                    Spacer(minLength: metrics.contentSpacer)

                    VStack(spacing: metrics.ctaSpacing) {
                        Button(action: onContinue) {
                            Text(copy.continueCta)
                                .font(.system(size: metrics.buttonTextSize, weight: .bold))
                            .frame(maxWidth: .infinity)
                            .frame(height: metrics.buttonHeight)
                            .foregroundStyle(.white)
                            .background(
                                LinearGradient(
                                    colors: [ctaBlue, accentBlue],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                        }
                        .buttonStyle(.plain)

                        Text(copy.alreadyHaveAccount)
                            .font(.system(size: metrics.secondaryCtaSize, weight: .bold))
                            .foregroundStyle(accentBlue)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .contentShape(Rectangle())
                            .onTapGesture { onAlreadyHaveAccount() }
                            .padding(.vertical, metrics.secondaryCtaVerticalPadding)
                    }
                    .padding(.bottom, metrics.bottomPadding)
                }
                .padding(.horizontal, metrics.horizontalPadding)
                .padding(.top, proxy.safeAreaInsets.top)
                .padding(.bottom, proxy.safeAreaInsets.bottom)
                .frame(width: proxy.size.width, height: proxy.size.height, alignment: .top)
            }
        }
    }

    private func featureLine(symbol: String, title: String, description: String, metrics: WelcomeMetrics) -> some View {
        HStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(iconBackground)
                Image(systemName: symbol)
                    .font(.system(size: metrics.iconSymbolSize, weight: .medium))
                    .foregroundStyle(accentBlue)
            }
            .frame(width: metrics.iconSize, height: metrics.iconSize)

            VStack(alignment: .leading, spacing: metrics.featureDescriptionSpacing) {
                Text(title)
                    .font(.system(size: metrics.featureTitleSize, weight: .bold))
                    .foregroundStyle(navy)
                    .lineLimit(1)
                    .minimumScaleFactor(0.86)

                Text(description)
                    .font(.system(size: metrics.featureDescriptionSize, weight: .medium))
                    .foregroundStyle(muted)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: metrics.featureLabelWidth, alignment: .leading)
        }
        .frame(maxWidth: metrics.featureWidth, alignment: .leading)
    }

    private func layoutMetrics(for size: CGSize) -> WelcomeMetrics {
        let compactHeight = size.height <= 820
        let veryCompactHeight = size.height <= 760
        let narrowWidth = size.width < 380
        let featureWidth = min(size.width * 0.86, 350)
        let featureLabelWidth = featureWidth - (veryCompactHeight ? 66 : 72)

        return WelcomeMetrics(
            horizontalPadding: narrowWidth ? 28 : 32,
            topPadding: veryCompactHeight ? 46 : (compactHeight ? 56 : 70),
            eyebrowFontSize: 12,
            eyebrowHorizontalPadding: 12,
            eyebrowVerticalPadding: 7,
            headlineTopPadding: veryCompactHeight ? 22 : 28,
            headlineSize: veryCompactHeight ? 31 : (compactHeight ? 34 : 38),
            headlineLineSpacing: veryCompactHeight ? -1 : -2,
            featuresTopPadding: veryCompactHeight ? 24 : 28,
            featureSpacing: veryCompactHeight ? 18 : 22,
            iconSize: veryCompactHeight ? 50 : 54,
            iconSymbolSize: veryCompactHeight ? 22 : 24,
            featureTitleSize: veryCompactHeight ? 15 : 16,
            featureDescriptionSize: veryCompactHeight ? 13 : 14,
            featureDescriptionSpacing: veryCompactHeight ? 4 : 5,
            featureWidth: featureWidth,
            featureLabelWidth: featureLabelWidth,
            contentSpacer: veryCompactHeight ? 18 : (compactHeight ? 26 : 38),
            ctaSpacing: veryCompactHeight ? 10 : 14,
            buttonHeight: veryCompactHeight ? 52 : 56,
            buttonTextSize: veryCompactHeight ? 18 : 19,
            secondaryCtaSize: veryCompactHeight ? 16 : 17,
            secondaryCtaVerticalPadding: 6,
            bottomPadding: 8
        )
    }
}
