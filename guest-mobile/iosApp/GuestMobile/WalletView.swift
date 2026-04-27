import SwiftUI

enum WalletSubTab: String, CaseIterable, Identifiable {
    case entitlements
    case buy
    case orders

    var id: String { rawValue }

    var iconName: String {
        switch self {
        case .entitlements: return "rosette"
        case .buy: return "bag"
        case .orders: return "list.clipboard"
        }
    }

    func localizedTitle(languageCode: String) -> String {
        let sl = languageCode.lowercased() == "sl"
        switch self {
        case .entitlements: return sl ? "Vstopnice" : "Entitlements"
        case .buy: return sl ? "Nakup" : "Buy"
        case .orders: return sl ? "Naročila" : "Orders"
        }
    }
}

private let walletBlue = Color(red: 0.07, green: 0.30, blue: 0.62) // #124C9D
private let walletBlueSoft = Color(red: 0.18, green: 0.40, blue: 0.70)
private let walletGreen = Color(red: 0.12, green: 0.62, blue: 0.35)
private let walletGreenSoft = Color(red: 0.90, green: 0.96, blue: 0.93)
private let walletAmber = Color(red: 0.90, green: 0.54, blue: 0.18)
private let walletAmberSoft = Color(red: 1.0, green: 0.95, blue: 0.88)
private let walletSurfaceTint = Color(red: 0.956, green: 0.968, blue: 0.988)

struct WalletView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL

    @State private var subTab: WalletSubTab = .entitlements
    @State private var focusedEntitlementId: String? = nil
    @State private var pendingOffer: WalletOfferModel? = nil
    @State private var statusMessage: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            segmentedControl
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 8)

            Group {
                switch subTab {
                case .entitlements:
                    entitlementsPanel
                case .buy:
                    buyPanel
                case .orders:
                    ordersPanel
                }
            }
            .animation(.easeInOut(duration: 0.2), value: subTab)
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .sheet(item: $pendingOffer) { offer in
            BuyPaymentSheet(
                offer: offer,
                availableMethods: store.tenantPaymentMethods(companyId: offer.companyId),
                onCancel: { pendingOffer = nil },
                onConfirm: { method in
                    pendingOffer = nil
                    Task { await performPurchase(offer: offer, paymentMethod: method) }
                }
            )
            .presentationDetents([.medium])
        }
        .overlay(alignment: .bottom) {
            if let message = statusMessage {
                Text(message)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.black.opacity(0.8), in: RoundedRectangle(cornerRadius: 10))
                    .padding(.bottom, 140)
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
                            if statusMessage == message { statusMessage = nil }
                        }
                    }
            }
        }
    }

    // MARK: Segmented control

    private var segmentedControl: some View {
        HStack(spacing: 4) {
            ForEach(WalletSubTab.allCases) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) { subTab = tab }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: tab.iconName)
                            .font(.system(size: 14, weight: .semibold))
                        Text(tab.localizedTitle(languageCode: store.user.language ?? "en"))
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.88)
                    }
                    .foregroundColor(subTab == tab ? Color.white : Color(.secondaryLabel))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .padding(.horizontal, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(subTab == tab ? walletBlue : Color.clear)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(walletSurfaceTint, in: RoundedRectangle(cornerRadius: 14))
    }

    // MARK: Entitlements

    private var entitlementsPanel: some View {
        let raw = store.accessCards
        let ordered: [AccessCardModel] = {
            guard let focus = focusedEntitlementId,
                  let target = raw.first(where: { $0.id == focus }) else { return raw }
            return [target] + raw.filter { $0.id != focus }
        }()

        return ScrollView {
            VStack(spacing: 10) {
                if raw.isEmpty {
                    emptyState(
                        iconName: "ticket",
                        title: "No entitlements yet",
                        subtitle: "Purchases from the Buy tab will show up here as tickets, packs and memberships."
                    )
                    .padding(.top, 64)
                } else if let top = ordered.first {
                    EntitlementTicketCard(
                        entitlement: top,
                        onToggleAutoRenew: { newValue in
                            Task {
                                try? await store.toggleAutoRenew(
                                    companyId: top.companyId,
                                    entitlementId: top.entitlementId,
                                    autoRenews: newValue
                                )
                            }
                        },
                        onTap: { focusedEntitlementId = top.id }
                    )
                    .padding(.bottom, 6)
                    ForEach(ordered.dropFirst()) { ent in
                        EntitlementCompactRow(entitlement: ent)
                            .onTapGesture {
                                withAnimation(.easeInOut(duration: 0.22)) {
                                    focusedEntitlementId = ent.id
                                }
                            }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 140)
        }
    }

    // MARK: Buy

    private var buyPanel: some View {
        ScrollView {
            VStack(spacing: 16) {
                if store.walletOffers.isEmpty {
                    emptyState(
                        iconName: "creditcard",
                        title: "Nothing to buy yet",
                        subtitle: "Your tenant has not published any tickets, packs, or memberships."
                    )
                    .padding(.top, 64)
                } else {
                    ForEach(store.walletOffers) { offer in
                        BuyOfferCard(offer: offer) { pendingOffer = offer }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 140)
        }
    }

    // MARK: Orders

    private var ordersPanel: some View {
        ScrollView {
            VStack(spacing: 12) {
                if store.walletOrderCards.isEmpty {
                    emptyState(
                        iconName: "list.bullet.rectangle",
                        title: "No orders yet",
                        subtitle: "Purchases made on the Buy tab will appear here with their invoice status."
                    )
                    .padding(.top, 64)
                } else {
                    HStack {
                        Text("Recent orders")
                            .font(.headline)
                        Spacer()
                        Text("View all orders")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(walletBlue)
                    }
                    .padding(.bottom, 2)

                    ForEach(store.walletOrderCards) { order in
                        OrderRow(order: order)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 140)
        }
    }

    // MARK: Purchase

    @MainActor
    private func performPurchase(offer: WalletOfferModel, paymentMethod: String) async {
        do {
            let checkout = try await store.createOrder(
                companyId: offer.companyId,
                productId: offer.productId,
                slotId: nil,
                paymentMethod: paymentMethod
            )
            switch paymentMethod {
            case "BANK_TRANSFER":
                if let bt = checkout.bankTransfer {
                    statusMessage = "Reference \(bt.referenceCode) • \(String(format: "%.2f", bt.amount)) \(bt.currency)"
                } else {
                    statusMessage = "Bank transfer instructions issued"
                }
            case "CARD", "PAYPAL":
                if let urlString = checkout.checkoutUrl, let url = URL(string: urlString) {
                    openURL(url)
                } else if checkout.status.uppercased() == "PAID" {
                    statusMessage = "Purchase complete"
                }
            default:
                break
            }
            subTab = .orders
        } catch {
            statusMessage = "Purchase failed: \(error.localizedDescription)"
        }
    }

    // MARK: Empty state

    private func emptyState(iconName: String, title: String, subtitle: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: iconName)
                .font(.system(size: 42))
                .foregroundColor(Color(.secondaryLabel))
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(subtitle)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 12)
    }
}

// MARK: - Store helper

extension AppStore {
    /// For now returns the standard three-method fallback; will become tenant-driven once the backend exposes it.
    func tenantPaymentMethods(companyId: String) -> [String] {
        ["CARD", "BANK_TRANSFER", "PAYPAL"]
    }
}

// MARK: - Entitlement ticket card

private struct EntitlementTicketCard: View {
    let entitlement: AccessCardModel
    let onToggleAutoRenew: (Bool) -> Void
    let onTap: () -> Void

    private let notchFractionX: CGFloat = 0.62

    var body: some View {
        VStack(spacing: 8) {
            Button(action: onTap) {
                ticketBody
            }
            .buttonStyle(.plain)

            if entitlement.type == "MEMBERSHIP" {
                HStack {
                    Text("Auto-renew").font(.subheadline.weight(.medium))
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { entitlement.autoRenews },
                        set: { onToggleAutoRenew($0) }
                    ))
                    .labelsHidden()
                    .tint(walletBlue)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }

    @ViewBuilder
    private var ticketBody: some View {
        let shape = TicketShape(cornerRadius: 28, notchRadius: 14, notchFractionX: notchFractionX)
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                entitlementIconBadge(type: entitlement.type, size: 52, background: Color.white.opacity(0.18), tint: .white)
                Text(entitlement.name)
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.leading)
                Text(priceLine)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white.opacity(0.88))
                HStack(spacing: 10) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.white.opacity(0.18))
                        Image(systemName: "ticket")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    .frame(width: 36, height: 36)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(accessHeadline)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                        if let accessSub {
                            Text(accessSub)
                                .font(.caption)
                                .foregroundColor(.white.opacity(0.75))
                        }
                    }
                }
            }
            .padding(.leading, 20)
            .padding(.trailing, 14)
            .padding(.vertical, 20)
            .frame(maxWidth: .infinity, alignment: .leading)

            verticalDashedDivider
                .padding(.vertical, 20)

            VStack(alignment: .leading, spacing: 6) {
                Text("TICKET ID")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.white.opacity(0.65))
                    .tracking(0.5)
                Text(entitlement.displayCode ?? "—")
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.white)
                if let validUntilText {
                    Spacer().frame(height: 2)
                    horizontalDashedDivider
                    Spacer().frame(height: 2)
                    Text("VALID UNTIL")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white.opacity(0.65))
                        .tracking(0.5)
                    Text(validUntilText)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)
                }
                Spacer(minLength: 0)
            }
            .padding(.leading, 14)
            .padding(.trailing, 20)
            .padding(.vertical, 20)
            .frame(width: 128, alignment: .leading)
        }
        .background(
            shape.fill(LinearGradient(colors: [walletBlue, walletBlueSoft], startPoint: .topLeading, endPoint: .bottomTrailing))
        )
        .clipShape(shape)
        .shadow(color: walletBlue.opacity(0.25), radius: 8, y: 4)
    }

    private var priceLine: String {
        var parts: [String] = []
        if let price = entitlement.priceGross {
            parts.append(String(format: "%.2f %@", price, entitlement.currency ?? "EUR"))
        }
        parts.append(productTypeLabel(entitlement.type))
        return parts.joined(separator: " • ")
    }

    private var accessHeadline: String {
        switch entitlement.type {
        case "PACK": return "Event access"
        case "CLASS_TICKET": return "Single entry"
        case "MEMBERSHIP": return "Event access"
        default: return "Access"
        }
    }

    private var accessSub: String? {
        guard entitlement.type == "PACK" else { return nil }
        if let remaining = entitlement.remainingUses, let total = entitlement.totalUses {
            return "\(remaining) of \(total) tickets remaining"
        }
        if let remaining = entitlement.remainingUses {
            return "\(remaining) remaining"
        }
        if let total = entitlement.totalUses {
            return "Valid for \(total) entries"
        }
        return nil
    }

    private var validUntilText: String? {
        guard entitlement.validityDays != nil else { return nil }
        return formatLongDate(entitlement.validUntil)
    }

    private var verticalDashedDivider: some View {
        GeometryReader { proxy in
            Path { path in
                let x = proxy.size.width / 2
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: proxy.size.height))
            }
            .stroke(style: StrokeStyle(lineWidth: 1.2, dash: [5, 5]))
            .foregroundColor(.white.opacity(0.45))
        }
        .frame(width: 1)
    }

    private var horizontalDashedDivider: some View {
        GeometryReader { proxy in
            Path { path in
                let y = proxy.size.height / 2
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: proxy.size.width, y: y))
            }
            .stroke(style: StrokeStyle(lineWidth: 1.2, dash: [5, 5]))
            .foregroundColor(.white.opacity(0.45))
        }
        .frame(height: 1)
    }
}

/// Rounded rectangle with circular notches cut from the top and bottom edges at `notchFractionX`.
/// Produces the classic ticket silhouette. Used by the focused entitlement card.
private struct TicketShape: Shape {
    var cornerRadius: CGFloat
    var notchRadius: CGFloat
    var notchFractionX: CGFloat

    func path(in rect: CGRect) -> Path {
        let r = min(cornerRadius, min(rect.width, rect.height) / 2)
        let nr = min(notchRadius, min(rect.width, rect.height) / 3)
        let cx = rect.minX + rect.width * notchFractionX
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + r, y: rect.minY))
        path.addLine(to: CGPoint(x: cx - nr, y: rect.minY))
        // Top notch (concave, opens downward into the card)
        path.addArc(
            center: CGPoint(x: cx, y: rect.minY),
            radius: nr,
            startAngle: .degrees(180),
            endAngle: .degrees(0),
            clockwise: true
        )
        path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        path.addArc(
            center: CGPoint(x: rect.maxX - r, y: rect.minY + r),
            radius: r,
            startAngle: .degrees(-90),
            endAngle: .degrees(0),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        path.addArc(
            center: CGPoint(x: rect.maxX - r, y: rect.maxY - r),
            radius: r,
            startAngle: .degrees(0),
            endAngle: .degrees(90),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: cx + nr, y: rect.maxY))
        // Bottom notch (concave, opens upward into the card)
        path.addArc(
            center: CGPoint(x: cx, y: rect.maxY),
            radius: nr,
            startAngle: .degrees(0),
            endAngle: .degrees(180),
            clockwise: true
        )
        path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        path.addArc(
            center: CGPoint(x: rect.minX + r, y: rect.maxY - r),
            radius: r,
            startAngle: .degrees(90),
            endAngle: .degrees(180),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        path.addArc(
            center: CGPoint(x: rect.minX + r, y: rect.minY + r),
            radius: r,
            startAngle: .degrees(180),
            endAngle: .degrees(270),
            clockwise: false
        )
        path.closeSubpath()
        return path
    }
}

private struct EntitlementCompactRow: View {
    let entitlement: AccessCardModel

    var body: some View {
        let shape = CompactTicketShape(cornerRadius: 18, notchRadius: 10)
        HStack(alignment: .center, spacing: 0) {
            HStack(spacing: 12) {
                entitlementIconBadge(type: entitlement.type, size: 44, background: walletBlue.opacity(0.12), tint: walletBlue)
                VStack(alignment: .leading, spacing: 2) {
                    Text(entitlement.name)
                        .font(.body.weight(.bold))
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(.leading, 14)
            .padding(.trailing, 10)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)

            verticalDashedDivider
                .padding(.vertical, 14)

            Text(priceLabel)
                .font(.body.weight(.bold))
                .foregroundColor(walletBlue)
                .frame(width: 120, alignment: .center)
                .padding(.vertical, 14)
        }
        .background(shape.fill(Color(.systemBackground)))
        .clipShape(shape)
        .shadow(color: Color.black.opacity(0.04), radius: 2, y: 1)
    }

    private var subtitle: String {
        switch entitlement.type {
        case "CLASS_TICKET": return "Single entry"
        case "MEMBERSHIP": return "Event access"
        case "PACK":
            if let remaining = entitlement.remainingUses {
                return "Event access • \(remaining) left"
            }
            return "Event access"
        default: return productTypeLabel(entitlement.type)
        }
    }

    private var priceLabel: String {
        guard let price = entitlement.priceGross else { return "—" }
        return String(format: "%.2f %@", price, entitlement.currency ?? "EUR")
    }

    private var verticalDashedDivider: some View {
        GeometryReader { proxy in
            Path { path in
                let x = proxy.size.width / 2
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: proxy.size.height))
            }
            .stroke(style: StrokeStyle(lineWidth: 1.2, dash: [4, 4]))
            .foregroundColor(walletBlue.opacity(0.35))
        }
        .frame(width: 1)
    }
}

/// Horizontal ticket silhouette: rounded rectangle with concave circular notches cut from the
/// left and right edges at `notchFractionY`. Used for the stacked entitlement rows.
private struct CompactTicketShape: Shape {
    var cornerRadius: CGFloat
    var notchRadius: CGFloat
    var notchFractionY: CGFloat = 0.5

    func path(in rect: CGRect) -> Path {
        let r = min(cornerRadius, min(rect.width, rect.height) / 2)
        let nr = min(notchRadius, rect.height / 3)
        let cy = rect.minY + rect.height * notchFractionY
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + r, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        path.addArc(
            center: CGPoint(x: rect.maxX - r, y: rect.minY + r),
            radius: r,
            startAngle: .degrees(-90),
            endAngle: .degrees(0),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: cy - nr))
        // Right notch (concave, opens leftward into the card)
        path.addArc(
            center: CGPoint(x: rect.maxX, y: cy),
            radius: nr,
            startAngle: .degrees(-90),
            endAngle: .degrees(90),
            clockwise: true
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        path.addArc(
            center: CGPoint(x: rect.maxX - r, y: rect.maxY - r),
            radius: r,
            startAngle: .degrees(0),
            endAngle: .degrees(90),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        path.addArc(
            center: CGPoint(x: rect.minX + r, y: rect.maxY - r),
            radius: r,
            startAngle: .degrees(90),
            endAngle: .degrees(180),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.minX, y: cy + nr))
        // Left notch (concave, opens rightward into the card)
        path.addArc(
            center: CGPoint(x: rect.minX, y: cy),
            radius: nr,
            startAngle: .degrees(90),
            endAngle: .degrees(-90),
            clockwise: true
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        path.addArc(
            center: CGPoint(x: rect.minX + r, y: rect.minY + r),
            radius: r,
            startAngle: .degrees(180),
            endAngle: .degrees(-90),
            clockwise: false
        )
        path.closeSubpath()
        return path
    }
}

@ViewBuilder
private func entitlementIconBadge(type: String, size: CGFloat, background: Color, tint: Color) -> some View {
    ZStack {
        RoundedRectangle(cornerRadius: 14, style: .continuous).fill(background)
        switch type {
        case "PACK":
            ZStack {
                Image(systemName: "ticket")
                    .font(.system(size: size * 0.48, weight: .semibold))
                    .foregroundColor(tint.opacity(0.55))
                    .rotationEffect(.degrees(14))
                    .offset(x: size * 0.09, y: -size * 0.06)
                Image(systemName: "ticket")
                    .font(.system(size: size * 0.48, weight: .semibold))
                    .foregroundColor(tint)
                    .rotationEffect(.degrees(-8))
                    .offset(x: -size * 0.06, y: size * 0.06)
            }
        case "MEMBERSHIP":
            Image(systemName: "rosette")
                .font(.system(size: size * 0.46, weight: .semibold))
                .foregroundColor(tint)
        default:
            Image(systemName: "ticket")
                .font(.system(size: size * 0.52, weight: .semibold))
                .foregroundColor(tint)
        }
    }
    .frame(width: size, height: size)
}

private func productTypeLabel(_ type: String) -> String {
    switch type {
    case "PACK": return "Pack"
    case "MEMBERSHIP": return "Membership"
    case "CLASS_TICKET": return "Class ticket"
    default: return type.capitalized
    }
}

// MARK: - Buy offer card

private struct BuyOfferCard: View {
    let offer: WalletOfferModel
    let onTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 14) {
                entitlementIconBadge(type: offer.productType, size: 96, background: walletBlue, tint: .white)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .top) {
                        Text(offer.name)
                            .font(.headline)
                            .multilineTextAlignment(.leading)
                        Spacer()
                        if let promo = offer.promoText, !promo.isEmpty {
                            Text(promo)
                                .font(.caption.weight(.semibold))
                                .foregroundColor(walletGreen)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(walletGreenSoft, in: Capsule())
                        }
                    }
                    Text(productTypeLabel(offer.productType))
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.secondary)
                    if let description = offer.description, !description.isEmpty {
                        Text(description)
                            .font(.footnote)
                            .foregroundColor(.secondary)
                            .padding(.top, 2)
                    }
                    Text(String(format: "%.2f %@", offer.priceGross, offer.currency))
                        .font(.title3.weight(.bold))
                        .padding(.top, 4)
                }
            }
            Button(action: onTap) {
                HStack {
                    Image(systemName: "creditcard.fill")
                    Text("Buy")
                        .font(.body.weight(.semibold))
                }
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundColor(.white)
                .background(walletBlue, in: RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color(.separator).opacity(0.2), lineWidth: 0.5)
        )
    }
}

// MARK: - Payment sheet

private struct BuyPaymentSheet: View {
    let offer: WalletOfferModel
    let availableMethods: [String]
    let onCancel: () -> Void
    let onConfirm: (String) -> Void

    @State private var selected: String

    init(offer: WalletOfferModel, availableMethods: [String], onCancel: @escaping () -> Void, onConfirm: @escaping (String) -> Void) {
        self.offer = offer
        self.availableMethods = availableMethods
        self.onCancel = onCancel
        self.onConfirm = onConfirm
        _selected = State(initialValue: availableMethods.first ?? "CARD")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Choose a payment method")
                .font(.title3.weight(.bold))
            Text("\(offer.name) • \(String(format: "%.2f %@", offer.priceGross, offer.currency))")
                .font(.subheadline)
                .foregroundColor(.secondary)

            ForEach(availableMethods, id: \.self) { method in
                PaymentMethodRow(
                    method: method,
                    selected: selected == method,
                    onSelect: { selected = method }
                )
            }

            Button {
                onConfirm(selected)
            } label: {
                Text("Continue")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .foregroundColor(.white)
                    .background(walletBlue, in: RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .padding(.top, 8)

            Button(action: onCancel) {
                Text("Cancel")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            .foregroundColor(walletBlue)
        }
        .padding(20)
    }
}

private struct PaymentMethodRow: View {
    let method: String
    let selected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .stroke(selected ? walletBlue : Color(.separator), lineWidth: 1.5)
                        .frame(width: 22, height: 22)
                    if selected {
                        Circle().fill(walletBlue).frame(width: 12, height: 12)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.subheadline.weight(.semibold))
                    Text(helper).font(.footnote).foregroundColor(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(selected ? walletBlue.opacity(0.08) : walletSurfaceTint)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(selected ? walletBlue : .clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }

    private var label: String {
        switch method {
        case "CARD": return "Credit or debit card"
        case "PAYPAL": return "PayPal"
        case "BANK_TRANSFER": return "Bank transfer"
        default: return method
        }
    }

    private var helper: String {
        switch method {
        case "CARD": return "Instant confirmation"
        case "PAYPAL": return "Redirects to PayPal"
        case "BANK_TRANSFER": return "Pay with reference code; activated after reconciliation"
        default: return ""
        }
    }
}

// MARK: - Orders

private struct OrderRow: View {
    let order: WalletOrderCardModel

    var body: some View {
        HStack(spacing: 12) {
            entitlementIconBadge(type: order.productType ?? "CLASS_TICKET", size: 44, background: walletBlue.opacity(0.12), tint: walletBlue)
            VStack(alignment: .leading, spacing: 2) {
                Text(order.productName ?? "Order")
                    .font(.subheadline.weight(.semibold))
                Text(referenceLabel)
                    .font(.caption)
                    .foregroundColor(.secondary)
                if !createdLabel.isEmpty {
                    Text(createdLabel)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                Text(String(format: "%.2f %@", order.totalGross, order.currency))
                    .font(.subheadline.weight(.semibold))
                StatusChip(status: chipStatus)
            }
        }
        .padding(14)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color(.separator).opacity(0.25), lineWidth: 0.5)
        )
    }

    private var referenceLabel: String {
        if let reference = order.referenceCode, !reference.isEmpty {
            return "Order #\(reference)"
        }
        return "Order \(order.orderId)"
    }

    private var createdLabel: String {
        guard let iso = order.createdAt else { return "" }
        return formatOrderDate(iso)
    }

    private enum ChipStatus { case completed, pending, refunded }

    private var chipStatus: ChipStatus {
        let bill = order.billPaymentStatus?.uppercased()
        let status = order.status.uppercased()
        if status == "REFUNDED" { return .refunded }
        if status == "PAID" && bill == "PAID" { return .completed }
        if order.paymentMethod.uppercased() == "BANK_TRANSFER" && bill == "PAYMENT_PENDING" { return .pending }
        if status == "PAID" { return .completed }
        return .pending
    }

    private struct StatusChip: View {
        let status: ChipStatus

        var body: some View {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundColor(fg)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(bg, in: Capsule())
        }

        private var label: String {
            switch status {
            case .completed: return "Completed"
            case .pending: return "Pending"
            case .refunded: return "Refunded"
            }
        }

        private var fg: Color {
            switch status {
            case .completed: return walletGreen
            case .pending: return walletAmber
            case .refunded: return Color(red: 0.33, green: 0.38, blue: 0.48)
            }
        }

        private var bg: Color {
            switch status {
            case .completed: return walletGreenSoft
            case .pending: return walletAmberSoft
            case .refunded: return Color(red: 0.93, green: 0.94, blue: 0.95)
            }
        }
    }
}

// MARK: - Formatters

private let _longDateFormatter: DateFormatter = {
    let df = DateFormatter()
    df.dateFormat = "dd MMM yyyy"
    df.locale = Locale.current
    return df
}()

private let _orderDateFormatter: DateFormatter = {
    let df = DateFormatter()
    df.dateFormat = "MMM d, yyyy • HH:mm"
    df.locale = Locale.current
    return df
}()

private let _iso8601: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()

private let _iso8601Fallback: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

private func parseISO(_ iso: String) -> Date? {
    _iso8601.date(from: iso) ?? _iso8601Fallback.date(from: iso)
}

private func formatLongDate(_ iso: String?) -> String {
    guard let iso, let date = parseISO(iso) else { return iso?.prefix(10).description ?? "—" }
    return _longDateFormatter.string(from: date)
}

private func formatOrderDate(_ iso: String) -> String {
    guard let date = parseISO(iso) else { return iso.prefix(16).description }
    return _orderDateFormatter.string(from: date)
}
