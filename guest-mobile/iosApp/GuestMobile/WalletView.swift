import SwiftUI
import CoreImage.CIFilterBuiltins
import QuickLook
import UIKit

enum WalletSubTab: String, CaseIterable, Identifiable {
    case entitlements
    case orders
    case buy

    var id: String { rawValue }

    var iconName: String {
        switch self {
        case .entitlements: return "rosette"
        case .orders: return "list.clipboard"
        case .buy: return "bag"
        }
    }

    func localizedTitle(languageCode: String) -> String {
        let sl = languageCode.lowercased() == "sl"
        switch self {
        case .entitlements: return sl ? "Ugodnosti" : "Entitlements"
        case .orders: return sl ? "Naročila" : "Orders"
        case .buy: return sl ? "Nakup" : "Buy"
        }
    }
}

private struct WalletReceiptPreviewItem: Identifiable {
    let id = UUID()
    let url: URL
    let title: String
}

private struct PendingWalletExternalCheckout: Codable, Equatable {
    let orderId: String
    let companyId: String
    let paymentMethod: String
    let openedAt: Date
    var wasBackgrounded: Bool

    init(orderId: String, companyId: String, paymentMethod: String, openedAt: Date = Date(), wasBackgrounded: Bool = false) {
        self.orderId = orderId
        self.companyId = companyId
        self.paymentMethod = paymentMethod
        self.openedAt = openedAt
        self.wasBackgrounded = wasBackgrounded
    }

    private static let storageKey = "guest_pending_external_checkout"

    static func load() -> PendingWalletExternalCheckout? {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return nil }
        return try? JSONDecoder().decode(PendingWalletExternalCheckout.self, from: data)
    }

    static func save(_ pending: PendingWalletExternalCheckout?) {
        guard let pending else {
            UserDefaults.standard.removeObject(forKey: storageKey)
            return
        }
        if let data = try? JSONEncoder().encode(pending) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }
}

private struct WalletReceiptPreviewController: UIViewControllerRepresentable {
    let item: WalletReceiptPreviewItem

    func makeCoordinator() -> Coordinator { Coordinator(item: item) }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        controller.title = item.title
        return controller
    }

    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {
        context.coordinator.item = item
        uiViewController.reloadData()
    }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        var item: WalletReceiptPreviewItem

        init(item: WalletReceiptPreviewItem) {
            self.item = item
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            item.url as NSURL
        }
    }
}

private let walletInk = Color(red: 0.12, green: 0.16, blue: 0.27)
private let walletMuted = Color(red: 0.48, green: 0.53, blue: 0.62)
private let walletGold = Color(red: 0.90, green: 0.54, blue: 0.18)
private let walletGoldSoft = Color(red: 1.00, green: 0.95, blue: 0.88)
private let walletLine = Color(red: 0.83, green: 0.88, blue: 0.95)
private let walletBlue = Color(red: 0.07, green: 0.30, blue: 0.62) // #124C9D
private let walletBlueSoft = Color(red: 0.05, green: 0.38, blue: 0.83)
private let walletGreen = Color(red: 0.12, green: 0.62, blue: 0.35)
private let walletGreenSoft = Color(red: 0.90, green: 0.96, blue: 0.93)
private let walletAmber = Color(red: 0.90, green: 0.54, blue: 0.18)
private let walletAmberSoft = Color(red: 1.0, green: 0.95, blue: 0.88)
private let walletSurfaceTint = Color(red: 0.96, green: 0.98, blue: 1.00)
private let walletCardCream = Color(red: 1.0, green: 0.968, blue: 0.925)
private let walletCardMint = Color(red: 0.945, green: 0.972, blue: 0.935)
private let walletCardLavender = Color(red: 0.965, green: 0.941, blue: 1.0)
private let walletCardBlue = Color(red: 0.937, green: 0.973, blue: 1.0)
private let walletCardRose = Color(red: 1.0, green: 0.948, blue: 0.925)

private func walletIsSl(_ languageCode: String) -> Bool {
    languageCode.lowercased().hasPrefix("sl")
}

private func walletTr(_ languageCode: String, _ en: String, _ sl: String) -> String {
    walletIsSl(languageCode) ? sl : en
}

private func walletFilterTitle(_ label: String, languageCode: String) -> String {
    switch label {
    case "All": return walletTr(languageCode, "All", "Vse")
    case "Tickets": return walletTr(languageCode, "Tickets", "Vstopnice")
    case "Memberships": return walletTr(languageCode, "Memberships", "Članarine")
    case "Courses": return walletTr(languageCode, "Courses", "Tečaji")
    case "Paid": return walletTr(languageCode, "Paid", "Plačano")
    case "Pending": return walletTr(languageCode, "Pending", "V čakanju")
    case "Refunded": return walletTr(languageCode, "Refunded", "Vrnjeno")
    case "Cancelled": return walletTr(languageCode, "Cancelled", "Preklicano")
    case "Inactive": return walletTr(languageCode, "Inactive", "Neaktivno")
    case "Active": return walletTr(languageCode, "Active", "Aktivno")
    default: return label
    }
}

private func walletProductTypeLabel(_ type: String, languageCode: String) -> String {
    switch type.uppercased() {
    case "PACK": return walletTr(languageCode, "Pack", "Paket")
    case "MEMBERSHIP": return walletTr(languageCode, "Membership", "Članarina")
    case "CLASS_TICKET": return walletTr(languageCode, "Class ticket", "Vstopnica")
    case "GIFT_CARD", "GIFT_CARD_PRODUCT": return walletTr(languageCode, "Gift card", "Darilna kartica")
    case "COURSE": return walletTr(languageCode, "Course access", "Dostop do tečaja")
    case "ORDER": return walletTr(languageCode, "Order", "Naročilo")
    default: return type.capitalized
    }
}

private enum WalletBuyCategory: CaseIterable, Identifiable {
    case all
    case memberships
    case classPacks
    case courses
    case giftCards

    var id: String { title }

    var title: String {
        switch self {
        case .all: return "All"
        case .memberships: return "Memberships"
        case .classPacks: return "Cards"
        case .courses: return "Courses"
        case .giftCards: return "Gift Cards"
        }
    }

    func localizedTitle(languageCode: String) -> String {
        switch self {
        case .all: return walletTr(languageCode, "All", "Vse")
        case .memberships: return walletTr(languageCode, "Memberships", "Članarine")
        case .classPacks: return walletTr(languageCode, "Cards", "Karte")
        case .courses: return walletTr(languageCode, "Courses", "Tečaji")
        case .giftCards: return walletTr(languageCode, "Gift Cards", "Darilne kartice")
        }
    }

    var iconName: String {
        switch self {
        case .all: return "square.grid.2x2"
        case .memberships: return "dumbbell"
        case .classPacks: return "ticket"
        case .courses: return "play.rectangle"
        case .giftCards: return "gift"
        }
    }

    func matches(_ offer: WalletOfferModel) -> Bool {
        let type = offer.productType.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let isGift = type == "GIFT_CARD" || type == "GIFT_CARD_PRODUCT"
        let isCourse = type == "COURSE"
        switch self {
        case .all:
            return true
        case .memberships:
            return type == "MEMBERSHIP"
        case .classPacks:
            return type != "MEMBERSHIP" && !isGift && !isCourse
        case .courses:
            return isCourse
        case .giftCards:
            return isGift
        }
    }
}

private enum WalletEmptyKind {
    case entitlements
    case buy
    case orders
}

struct WalletView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    let onOpenNotifications: () -> Void
    let onOpenTenantPicker: () -> Void
    let onOpenBuyTab: () -> Void
    let onBookWithEntitlement: (AccessCardModel) -> Void

    @State private var subTab: WalletSubTab = .entitlements
    @State private var focusedEntitlementId: String? = nil
    @State private var selectedQRCode: WalletQRCodePopupModel? = nil
    @State private var entitlementPage: Int = 0
    @State private var pendingOffer: WalletOfferModel? = nil
    @State private var statusMessage: String? = nil
    @State private var selectedBuyCategory: WalletBuyCategory = .all
    @State private var buySearchText: String = ""
    @State private var selectedOrderFilter: String = "All"
    @State private var selectedEntitlementFilter: String = "All"
    @State private var showInactiveEntitlements: Bool = false
    @State private var showAllEntitlements: Bool = false
    @State private var receiptPreviewItem: WalletReceiptPreviewItem? = nil
    @State private var openingReceiptOrderId: String? = nil
    @State private var paymentInstructionsOrder: WalletOrderCardModel? = nil
    @State private var pendingExternalCheckout: PendingWalletExternalCheckout? = PendingWalletExternalCheckout.load()

    private let walletSubTabSwipeThreshold: CGFloat = 54

    private var walletSubTabOrder: [WalletSubTab] { [.entitlements, .buy, .orders] }

    private var walletSubTabSwipeGesture: some Gesture {
        DragGesture(minimumDistance: 30, coordinateSpace: .local)
            .onEnded { value in
                handleWalletSubTabSwipe(value)
            }
    }

    var body: some View {
        VStack(spacing: 0) {
            segmentedControl
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 6)

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
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .simultaneousGesture(walletSubTabSwipeGesture)
        .background(
            LinearGradient(
                colors: [Color(red: 0.95, green: 0.98, blue: 1.00), Color(red: 1.00, green: 0.97, blue: 0.93)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        .sheet(item: $pendingOffer) { offer in
            BuyPaymentSheet(
                offer: offer,
                languageCode: appUiLocaleStorage,
                availableMethods: store.tenantPaymentMethods(companyId: offer.companyId),
                onCancel: { pendingOffer = nil },
                onConfirm: { method in
                    pendingOffer = nil
                    Task { await performPurchase(offer: offer, paymentMethod: method) }
                }
            )
            .presentationDetents([.medium])
        }
        .sheet(item: $receiptPreviewItem) { item in
            WalletReceiptPreviewController(item: item)
        }
        .sheet(item: $paymentInstructionsOrder) { order in
            WalletPaymentInstructionsSheet(order: order, languageCode: appUiLocaleStorage) {
                paymentInstructionsOrder = nil
            }
            .presentationDetents([.medium, .large])
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
        .overlay {
            if let selectedQRCode {
                WalletQRCodePopup(
                    model: selectedQRCode,
                    languageCode: appUiLocaleStorage,
                    onClose: {
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                            self.selectedQRCode = nil
                        }
                    }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.94)))
                .zIndex(20)
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: selectedQRCode?.id)
        .onChange(of: subTab) { tab in
            if tab == .buy {
                onOpenBuyTab()
            }
        }
        .onChange(of: store.paymentReturnSequence) { _ in
            guard let pending = pendingExternalCheckout, store.lastPaymentReturnOrderId == pending.orderId else { return }
            let status = store.lastPaymentReturnStatus?.lowercased()
            if status == "cancelled" || status == "canceled" || status == "error" {
                Task {
                    try? await store.cancelExternalCheckout(companyId: pending.companyId, orderId: pending.orderId)
                }
            }
            setPendingExternalCheckout(nil)
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                Task { await cancelPendingExternalCheckoutIfNeeded() }
            } else if pendingExternalCheckout != nil {
                var pending = pendingExternalCheckout!
                pending.wasBackgrounded = true
                setPendingExternalCheckout(pending)
            }
        }
    }

    private func handleWalletSubTabSwipe(_ value: DragGesture.Value) {
        guard selectedQRCode == nil else { return }

        let horizontal = value.translation.width
        let vertical = value.translation.height
        guard abs(horizontal) >= walletSubTabSwipeThreshold, abs(horizontal) > abs(vertical) * 1.25 else { return }
        guard let currentIndex = walletSubTabOrder.firstIndex(of: subTab) else { return }

        let nextIndex = horizontal < 0 ? currentIndex + 1 : currentIndex - 1
        guard walletSubTabOrder.indices.contains(nextIndex) else { return }

        withAnimation(.easeOut(duration: 0.18)) {
            subTab = walletSubTabOrder[nextIndex]
        }
    }

    private var walletHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(walletBlueSoft)
                    Image(systemName: "building.2")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                }
                .frame(width: 34, height: 34)

                Text(store.walletScopedTenantName)
                    .font(.system(size: 17, weight: .semibold))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(walletBlue)
            }
            .foregroundColor(walletInk)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Color.black.opacity(0.04), radius: 12, y: 6)
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .onTapGesture { onOpenTenantPicker() }
            .frame(maxWidth: 220, alignment: .leading)

            Spacer(minLength: 0)

            Button(action: onOpenNotifications) {
                Image(systemName: "bell")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(walletInk)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 4)
    }

    // MARK: Segmented control

    private var segmentedControl: some View {
        HStack(spacing: 0) {
            ForEach([WalletSubTab.entitlements, .buy, .orders], id: \.self) { tab in
                let selected = subTab == tab
                Button {
                    subTab = tab
                } label: {
                    VStack(spacing: 0) {
                        Text(tab.localizedTitle(languageCode: appUiLocaleStorage))
                            .font(.system(size: 12, weight: selected ? .bold : .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.82)
                            .foregroundColor(selected ? walletBlueSoft : walletMuted)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 7)
                            .padding(.bottom, 6)
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(selected ? walletBlueSoft : .clear)
                            .frame(width: 72, height: 3)
                            .padding(.bottom, 4)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(height: 50)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: Color.black.opacity(0.045), radius: 16, y: 8)
    }

    // MARK: Entitlements

    private var entitlementsPanel: some View {
        let cards = store.walletAccessCards
        let filteredByType = cards.filter { card in
            switch selectedEntitlementFilter {
            case "Tickets":
                return card.type == "PACK" || card.type == "CLASS_TICKET"
            case "Memberships":
                return card.type == "MEMBERSHIP"
            case "Courses":
                return card.type == "COURSE"
            default:
                return true
            }
        }
        let activeCards = filteredByType.filter { !isInactiveEntitlement($0) }
        let inactiveCards = filteredByType.filter { isInactiveEntitlement($0) }
        let visibleCards = showInactiveEntitlements ? inactiveCards : activeCards
        let previewCards = Array(visibleCards.prefix(4))
        let canShowAll = visibleCards.count > 4

        return VStack(spacing: 0) {
            entitlementFilterRow(
                activeCount: activeCards.count,
                inactiveCount: inactiveCards.count,
                selectedFilter: selectedEntitlementFilter,
                onFilterSelected: { newFilter in
                    selectedEntitlementFilter = newFilter
                    showAllEntitlements = false
                    focusedEntitlementId = nil
                },
                showInactive: showInactiveEntitlements,
                onToggleStatusFilter: {
                    showInactiveEntitlements.toggle()
                    showAllEntitlements = false
                    focusedEntitlementId = nil
                }
            )
                .padding(.horizontal, 20)
                .padding(.top, 2)
                .padding(.bottom, 4)

            if cards.isEmpty {
                showcaseEmptyState(
                    kind: .entitlements,
                    title: walletTr(appUiLocaleStorage, "No entitlements yet", "Vstopnic še ni"),
                    subtitle: walletTr(appUiLocaleStorage, "Purchases from the Buy tab will appear here as tickets, packs and memberships.", "Nakupi iz zavihka Nakup bodo tukaj prikazani kot vstopnice, paketi in članarine."),
                    primaryButtonTitle: walletTr(appUiLocaleStorage, "Browse offers", "Oglejte si ponudbe"),
                    footerText: "",
                    footerIcon: "ticket.fill",
                    primaryAction: {
                        subTab = .buy
                        onOpenBuyTab()
                    }
                )
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            } else if visibleCards.isEmpty {
                emptyState(
                    iconName: "ticket",
                    title: showInactiveEntitlements ? walletTr(appUiLocaleStorage, "No inactive entitlements", "Ni neaktivnih vstopnic") : walletTr(appUiLocaleStorage, "No active entitlements", "Ni aktivnih vstopnic"),
                    subtitle: walletTr(appUiLocaleStorage, "Switch filters or purchase a new pass from the Buy tab.", "Spremenite filter ali kupite novo vstopnico v zavihku Nakup.")
                )
                .padding(.top, 64)
                .padding(.horizontal, 20)
                .padding(.bottom, 140)
            } else if showAllEntitlements {
                WalletEntitlementFullList(
                    items: visibleCards,
                    onQRCodeTap: { entitlement, code in
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                            selectedQRCode = WalletQRCodePopupModel(
                                title: walletTr(appUiLocaleStorage, "Scan access code", "Skeniraj dostopno kodo"),
                                subtitle: walletTr(appUiLocaleStorage, "Show this at reception", "Pokažite to na recepciji"),
                                code: code,
                                entitlementId: entitlement.id
                            )
                        }
                    },
                    onToggleAutoRenew: { ent, newValue in
                        Task {
                            try? await store.toggleAutoRenew(
                                companyId: ent.companyId,
                                entitlementId: ent.entitlementId,
                                autoRenews: newValue
                            )
                        }
                    },
                    onBookWithEntitlement: { entitlement in
                        onBookWithEntitlement(entitlement)
                    },
                    onShowLess: {
                        showAllEntitlements = false
                        focusedEntitlementId = nil
                    }
                )
            } else {
                WalletPullOutEntitlementDeck(
                    items: previewCards,
                    focusedEntitlementId: $focusedEntitlementId,
                    onQRCodeTap: { entitlement, code in
                        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                            selectedQRCode = WalletQRCodePopupModel(
                                title: walletTr(appUiLocaleStorage, "Scan access code", "Skeniraj dostopno kodo"),
                                subtitle: walletTr(appUiLocaleStorage, "Show this at reception", "Pokažite to na recepciji"),
                                code: code,
                                entitlementId: entitlement.id
                            )
                        }
                    },
                    onToggleAutoRenew: { ent, newValue in
                        Task {
                            try? await store.toggleAutoRenew(
                                companyId: ent.companyId,
                                entitlementId: ent.entitlementId,
                                autoRenews: newValue
                            )
                        }
                    },
                    onBookWithEntitlement: { entitlement in
                        onBookWithEntitlement(entitlement)
                    },
                    showAllEnabled: canShowAll,
                    onShowAll: {
                        showAllEntitlements = true
                        focusedEntitlementId = nil
                    }
                )
            }
        }
    }

    // MARK: Buy

    private var buyPanel: some View {
        let allOffers = store.walletScopedOffers
        let availableCategories = WalletBuyCategory.allCases.filter { category in
            category == .all || allOffers.contains(where: { category.matches($0) })
        }
        let safeSelectedCategory = availableCategories.contains(selectedBuyCategory) ? selectedBuyCategory : .all
        let visibleOffers = allOffers
            .filter { safeSelectedCategory.matches($0) }
            .sorted { left, right in
                if buyOfferSortRank(left) != buyOfferSortRank(right) { return buyOfferSortRank(left) < buyOfferSortRank(right) }
                return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
            }

        if allOffers.isEmpty {
            return AnyView(
                showcaseEmptyState(
                    kind: .buy,
                    title: walletTr(appUiLocaleStorage, "No offers available", "Trenutno ni ponudb"),
                    subtitle: walletTr(appUiLocaleStorage, "This tenant does not have any memberships, cards or gift cards available to buy right now.", "Ta ponudnik trenutno nima članarin, kart ali darilnih kartic za nakup."),
                    primaryButtonTitle: walletTr(appUiLocaleStorage, "Change tenant", "Zamenjaj ponudnika"),
                    footerText: "",
                    footerIcon: "building.2.fill",
                    primaryAction: { onOpenTenantPicker() }
                )
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 22)
            )
        }

        return AnyView(ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(availableCategories) { category in
                            BuyShowcaseCategoryChip(
                                category: category,
                                selected: safeSelectedCategory == category
                            ) {
                                withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                                    selectedBuyCategory = category
                                }
                            }
                        }
                    }
                    .padding(.vertical, 2)
                }

                LazyVStack(spacing: 14) {
                    ForEach(Array(visibleOffers.enumerated()), id: \.element.id) { index, offer in
                        BuyShowcaseOfferCard(
                            offer: offer,
                            index: index,
                            priceLabel: offerPriceLabel(offer),
                            onTap: { pendingOffer = offer }
                        )
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 18)
        })
    }

    private func buyOfferSortRank(_ offer: WalletOfferModel) -> Int {
        if offer.productType == "MEMBERSHIP" { return 0 }
        if offer.productType == "COURSE" { return 1 }
        if offer.productType == "GIFT_CARD" || offer.productType == "GIFT_CARD_PRODUCT" { return 3 }
        return 2
    }

    private func buyFeaturedOffer(from offers: [WalletOfferModel]) -> WalletOfferModel? {
        offers.first(where: { $0.productType == "MEMBERSHIP" })
            ?? offers.first(where: { $0.promoText?.isEmpty == false })
            ?? offers.first
    }

    private func buyVisibleOffers(from offers: [WalletOfferModel], excluding excludedId: String?) -> [WalletOfferModel] {
        let search = buySearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return offers.filter { offer in
            if let excludedId, offer.id == excludedId { return false }
            guard selectedBuyCategory.matches(offer) else { return false }
            guard !search.isEmpty else { return true }
            let haystack = [
                offer.name,
                offer.productType,
                offer.description ?? "",
                offer.sessionTypeName ?? "",
                offer.promoText ?? ""
            ]
            .joined(separator: " ")
            .lowercased()
            return haystack.contains(search)
        }
    }

    private func buyHeroSubtitle(for offer: WalletOfferModel) -> String {
        if let promoText = offer.promoText, !promoText.isEmpty { return promoText }
        if offer.productType == "MEMBERSHIP" { return walletTr(appUiLocaleStorage, "Unlimited access, simple checkout, saved directly to your wallet.", "Neomejen dostop, enostavno plačilo in shranjeno neposredno v denarnico.") }
        if offer.productType == "PACK" { return walletTr(appUiLocaleStorage, "Flexible visits for your favorite classes, ready instantly after purchase.", "Prilagodljivi obiski za vaše najljubše termine, pripravljeni takoj po nakupu.") }
        return offer.description?.isEmpty == false ? offer.description! : walletTr(appUiLocaleStorage, "Book your next session with a pass that activates instantly.", "Rezervirajte naslednji termin z vstopnico, ki se aktivira takoj.")
    }

    private func buyOfferSubtitle(for offer: WalletOfferModel) -> String {
        if let description = offer.description, !description.isEmpty { return description }
        switch offer.productType {
        case "PACK":
            return walletTr(appUiLocaleStorage, "\(offerVisitCountLabel(offer.usageLimit)) to use anytime. \(offerValidityLabel(offer.validityDays)).", "\(offerVisitCountLabel(offer.usageLimit)) za uporabo kadarkoli. \(offerValidityLabel(offer.validityDays)).")
        case "MEMBERSHIP":
            return walletTr(appUiLocaleStorage, "Recurring access for your routine. Saved to Wallet after checkout.", "Ponavljajoč dostop za vašo rutino. Po plačilu shranjeno v denarnico.")
        case "CLASS_TICKET":
            return walletTr(appUiLocaleStorage, "One class. Any time. \(offerValidityLabel(offer.validityDays)).", "En obisk. Kadarkoli. \(offerValidityLabel(offer.validityDays)).")
        default:
            return walletTr(appUiLocaleStorage, "Secure checkout with instant activation.", "Varno plačilo s takojšnjo aktivacijo.")
        }
    }

    private func buyOfferEyebrow(for offer: WalletOfferModel, index: Int) -> String {
        if let promoText = offer.promoText, !promoText.isEmpty { return promoText }
        switch offer.productType {
        case "PACK": return (offer.usageLimit ?? 0) >= 10 ? walletTr(appUiLocaleStorage, "Best value", "Najboljša vrednost") : walletTr(appUiLocaleStorage, "Class pack", "Karte")
        case "MEMBERSHIP": return index == 0 ? walletTr(appUiLocaleStorage, "Most popular", "Najbolj priljubljeno") : walletTr(appUiLocaleStorage, "Membership", "Članarina")
        case "CLASS_TICKET": return walletTr(appUiLocaleStorage, "Great for trying out", "Odlično za prvi obisk")
        default: return productTypeLabel(offer.productType)
        }
    }


    private func buyShowcaseDescription(for offer: WalletOfferModel) -> String {
        if let description = offer.description, !description.isEmpty { return description }
        switch offer.productType {
        case "MEMBERSHIP":
            return walletTr(appUiLocaleStorage, "Unlimited access to your favourite services with one simple membership.", "Neomejen dostop do vaših najljubših storitev z eno članarino.")
        case "PACK":
            return walletTr(appUiLocaleStorage, "Bundle sessions together for better value and flexible booking.", "Združite obiske v paket za boljšo vrednost in prilagodljivo rezervacijo.")
        default:
            return walletTr(appUiLocaleStorage, "A simple pass ready to use on your next visit.", "Preprosta vstopnica, pripravljena za vaš naslednji obisk.")
        }
    }

    private func buyShowcaseLabel(for offer: WalletOfferModel) -> String {
        switch offer.productType {
        case "MEMBERSHIP": return walletTr(appUiLocaleStorage, "MEMBERSHIP", "ČLANARINA")
        case "PACK": return walletTr(appUiLocaleStorage, "CARD", "KARTA")
        case "GIFT_CARD", "GIFT_CARD_PRODUCT": return walletTr(appUiLocaleStorage, "GIFT CARD", "DARILNA KARTICA")
        default: return walletTr(appUiLocaleStorage, "DAY PASS", "DNEVNA VSTOPNICA")
        }
    }

    private func buyShowcaseAccent(for offer: WalletOfferModel, index: Int) -> Color {
        switch offer.productType {
        case "MEMBERSHIP": return walletBlueSoft
        case "GIFT_CARD", "GIFT_CARD_PRODUCT": return walletAmber
        case "PACK": return index % 2 == 0 ? Color(red: 1.0, green: 0.60, blue: 0.12) : Color(red: 0.55, green: 0.40, blue: 0.96)
        default: return Color(red: 0.12, green: 0.71, blue: 0.42)
        }
    }

    private func buyShowcaseTileBackground(for offer: WalletOfferModel, index: Int) -> Color {
        switch offer.productType {
        case "MEMBERSHIP": return walletCardBlue
        case "GIFT_CARD", "GIFT_CARD_PRODUCT": return walletCardCream
        case "PACK": return index % 2 == 0 ? walletCardCream : walletCardLavender
        default: return walletCardMint
        }
    }

    private func buyShowcaseQuantityLabel(for offer: WalletOfferModel) -> String? {
        guard offer.productType != "MEMBERSHIP" else { return nil }
        if let usageLimit = offer.usageLimit, usageLimit > 1 { return walletTr(appUiLocaleStorage, "\(usageLimit) Sessions", "\(usageLimit) obiskov") }
        return walletTr(appUiLocaleStorage, "1 Session", "1 obisk")
    }

    private func buyShowcasePriceSubLabel(for offer: WalletOfferModel) -> String {
        switch offer.productType {
        case "MEMBERSHIP":
            return walletTr(appUiLocaleStorage, "Billed monthly", "Mesečno obračunavanje")
        case "PACK":
            let count = max(Double(offer.usageLimit ?? 1), 1)
            let each = offer.priceGross / count
            return walletTr(appUiLocaleStorage, "\(currencySymbol(offer.currency))\(formatCompactPrice(each)) per session", "\(currencySymbol(offer.currency))\(formatCompactPrice(each)) na obisk")
        default:
            return walletTr(appUiLocaleStorage, "One-time payment", "Enkratno plačilo")
        }
    }

    // MARK: Orders

    private var ordersPanel: some View {
        let visibleOrders = selectedOrderFilter == "All"
            ? store.walletScopedOrderCards
            : store.walletScopedOrderCards.filter { orderBadgeLabel($0) == selectedOrderFilter }

        return ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 14) {
                orderFilterRow

                if store.walletScopedOrderCards.isEmpty {
                    showcaseEmptyState(
                        kind: .orders,
                        title: walletTr(appUiLocaleStorage, "No orders yet", "Naročil še ni"),
                        subtitle: walletTr(appUiLocaleStorage, "Completed purchases from the Buy tab will appear here once you place your first order.", "Zaključeni nakupi iz zavihka Nakup bodo prikazani tukaj po prvem naročilu."),
                        primaryButtonTitle: walletTr(appUiLocaleStorage, "Go to Buy", "Pojdi na Nakup"),
                        footerText: "",
                        footerIcon: "bag.fill",
                        primaryAction: {
                            subTab = .buy
                            onOpenBuyTab()
                        }
                    )
                    .padding(.top, 8)
                    .padding(.bottom, 22)
                } else if visibleOrders.isEmpty {
                    emptyState(
                        iconName: "doc.text",
                        title: walletTr(appUiLocaleStorage, "No \(selectedOrderFilter) orders", "Ni naročil: \(walletFilterTitle(selectedOrderFilter, languageCode: appUiLocaleStorage))"),
                        subtitle: walletTr(appUiLocaleStorage, "Orders matching this status will appear here.", "Naročila s tem statusom bodo prikazana tukaj.")
                    )
                    .padding(.top, 46)
                    .padding(.bottom, 140)
                } else {
                    ForEach(visibleOrders, id: \.id) { order in
                        WalletOrderReceiptCard(
                            order: order,
                            isOpeningReceipt: openingReceiptOrderId == order.orderId,
                            onPaymentInstructions: { paymentInstructionsOrder = order },
                            onViewReceipt: {
                                Task { await openReceipt(order: order) }
                            }
                        )
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 14)
        }
    }

    private var orderFilterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(["All", "Paid", "Pending", "Refunded", "Cancelled"], id: \.self) { label in
                    let selected = selectedOrderFilter == label
                    Button {
                        selectedOrderFilter = label
                    } label: {
                        Text(walletFilterTitle(label, languageCode: appUiLocaleStorage))
                            .font(.system(size: 12, weight: selected ? .bold : .medium))
                            .foregroundColor(selected ? .white : walletInk.opacity(0.88))
                            .lineLimit(1)
                            .padding(.horizontal, selected ? 12 : 10)
                            .frame(height: 32)
                            .background(selected ? walletBlueSoft : Color.white.opacity(0.94), in: Capsule(style: .continuous))
                            .overlay(
                                Capsule(style: .continuous)
                                    .stroke(selected ? walletBlueSoft.opacity(0.45) : walletLine.opacity(0.95), lineWidth: 1)
                            )
                            .shadow(color: selected ? Color.black.opacity(0.08) : Color.black.opacity(0.035), radius: selected ? 8 : 5, y: selected ? 4 : 2)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 2)
            .padding(.bottom, 4)
        }
    }

    // MARK: Purchase

    @MainActor
    private func performPurchase(offer: WalletOfferModel, paymentMethod: String) async {
        guard store.tenantDashboards[offer.companyId]?.tenant.billingEnabled != false else {
            statusMessage = walletTr(appUiLocaleStorage, "Purchases are currently disabled for this tenant", "Nakupi pri tem ponudniku trenutno niso omogočeni")
            return
        }
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
                    statusMessage = walletTr(appUiLocaleStorage, "Bank transfer instructions issued", "Navodila za bančno nakazilo so izdana")
                }
            case "CARD", "PAYPAL":
                if let urlString = checkout.checkoutUrl, let url = URL(string: urlString) {
                    setPendingExternalCheckout(PendingWalletExternalCheckout(
                        orderId: checkout.orderId,
                        companyId: offer.companyId,
                        paymentMethod: paymentMethod
                    ))
                    openURL(url)
                } else if checkout.status.uppercased() == "PAID" {
                    statusMessage = walletTr(appUiLocaleStorage, "Purchase complete", "Nakup zaključen")
                }
            default:
                break
            }
            subTab = paymentMethod == "BANK_TRANSFER" ? .orders : .entitlements
        } catch {
            statusMessage = walletTr(appUiLocaleStorage, "Purchase failed: \(error.localizedDescription)", "Nakup ni uspel: \(error.localizedDescription)")
        }
    }


    @MainActor
    private func setPendingExternalCheckout(_ pending: PendingWalletExternalCheckout?) {
        pendingExternalCheckout = pending
        PendingWalletExternalCheckout.save(pending)
    }

    @MainActor
    private func cancelPendingExternalCheckoutIfNeeded() async {
        guard let pending = pendingExternalCheckout, pending.wasBackgrounded else { return }
        // Give the Stripe/PayPal success or cancel deep link a short moment to arrive first.
        try? await Task.sleep(nanoseconds: 1_200_000_000)
        guard let current = pendingExternalCheckout, current.orderId == pending.orderId else { return }
        if store.lastPaymentReturnOrderId == current.orderId {
            setPendingExternalCheckout(nil)
            return
        }
        setPendingExternalCheckout(nil)
        do {
            try await store.cancelExternalCheckout(companyId: current.companyId, orderId: current.orderId)
            subTab = .orders
            let cancelMessage: String
            if current.paymentMethod.uppercased() == "CARD" {
                cancelMessage = walletTr(appUiLocaleStorage, "Stripe checkout canceled", "Stripe plačilo je preklicano")
            } else {
                cancelMessage = walletTr(appUiLocaleStorage, "Checkout canceled", "Plačilo je preklicano")
            }
            statusMessage = cancelMessage
        } catch {
            statusMessage = walletTr(appUiLocaleStorage, "Checkout status refresh failed", "Osvežitev stanja plačila ni uspela")
        }
    }

    @MainActor
    private func openReceipt(order: WalletOrderCardModel) async {
        guard openingReceiptOrderId == nil else { return }
        openingReceiptOrderId = order.orderId
        defer { openingReceiptOrderId = nil }
        do {
            let receiptUrl = try await store.downloadOrderReceipt(
                orderId: order.orderId,
                referenceCode: order.referenceCode
            )
            receiptPreviewItem = WalletReceiptPreviewItem(
                url: receiptUrl,
                title: order.referenceCode?.isEmpty == false ? walletTr(appUiLocaleStorage, "Receipt \(order.referenceCode!)", "Račun \(order.referenceCode!)") : walletTr(appUiLocaleStorage, "Receipt", "Račun")
            )
        } catch {
            statusMessage = walletTr(appUiLocaleStorage, "Receipt download failed: \(error.localizedDescription)", "Prenos računa ni uspel: \(error.localizedDescription)")
        }
    }

    private func entitlementFilterRow(
        activeCount: Int,
        inactiveCount: Int,
        selectedFilter: String,
        onFilterSelected: @escaping (String) -> Void,
        showInactive: Bool,
        onToggleStatusFilter: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 8) {
            ForEach(["All", "Tickets", "Memberships", "Courses"], id: \.self) { label in
                let isSelected = selectedFilter == label
                Button {
                    onFilterSelected(label)
                } label: {
                    Text(walletFilterTitle(label, languageCode: appUiLocaleStorage))
                        .font(.system(size: 12, weight: isSelected ? .bold : .medium))
                        .foregroundColor(isSelected ? .white : walletInk.opacity(0.88))
                        .padding(.horizontal, isSelected ? 12 : 10)
                        .frame(height: 32)
                        .background(Capsule(style: .continuous).fill(isSelected ? walletBlueSoft : Color.white.opacity(0.94)))
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(isSelected ? walletBlueSoft.opacity(0.45) : walletLine.opacity(0.95), lineWidth: 1)
                        )
                        .shadow(color: isSelected ? Color.black.opacity(0.08) : Color.black.opacity(0.035), radius: isSelected ? 8 : 5, y: isSelected ? 4 : 2)
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 6)
            Button {
                onToggleStatusFilter()
            } label: {
                HStack(spacing: 6) {
                    Circle().fill(showInactive ? Color.red : walletGreen).frame(width: 6, height: 6)
                    Text(showInactive ? walletTr(appUiLocaleStorage, "\(inactiveCount) inactive", "\(inactiveCount) neaktivnih") : walletTr(appUiLocaleStorage, "\(activeCount) active", "\(activeCount) aktivnih"))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(walletInk)
                }
                .padding(.horizontal, 9)
                .frame(height: 32)
                .background(Color.white, in: Capsule(style: .continuous))
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(showInactive ? Color.red.opacity(0.4) : walletLine.opacity(0.95), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func isInactiveEntitlement(_ card: AccessCardModel) -> Bool {
        if card.type == "GIFT_CARD" && (card.remainingValueGross ?? 0.0) <= 0.0 {
            return true
        }
        return isInactiveEntitlementStatus(card.status)
    }

    private func isInactiveEntitlementStatus(_ status: String) -> Bool {
        switch status.uppercased() {
        case "EXPIRED", "USED_UP", "CANCELLED", "INACTIVE":
            return true
        default:
            return false
        }
    }

    private func secondarySegmentedControl(labels: [String], selectedIndex: Int) -> some View {
        HStack(spacing: 4) {
            ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                let selected = index == selectedIndex
                Text(label)
                    .font(.system(size: 12, weight: selected ? .bold : .semibold))
                    .foregroundColor(selected ? walletGold : walletMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.86)
                    .frame(maxWidth: .infinity, minHeight: 34)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(selected ? Color(.systemBackground) : Color.clear)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(selected ? walletLine.opacity(0.72) : Color.clear, lineWidth: 1)
                    )
                    .shadow(color: selected ? Color.black.opacity(0.06) : .clear, radius: 2, y: 1)
            }
        }
        .padding(3)
        .background(Color(.systemBackground).opacity(0.94), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(walletLine, lineWidth: 1))
    }

    private func commerceFilterRow(labels: [String], selectedIndex: Int) -> some View {
        HStack(spacing: 8) {
            ForEach(Array(labels.enumerated()), id: \.offset) { index, label in
                Text(label)
                    .font(.system(size: 12, weight: index == selectedIndex ? .bold : .medium))
                    .foregroundColor(index == selectedIndex ? walletBlue : walletInk.opacity(0.88))
                    .padding(.horizontal, index == selectedIndex ? 12 : 10)
                    .frame(height: 34)
                    .background(Capsule(style: .continuous).fill(Color.white))
                    .overlay(
                        Capsule(style: .continuous)
                            .stroke(index == selectedIndex ? walletBlue.opacity(0.45) : walletLine.opacity(0.95), lineWidth: 1)
                    )
                    .shadow(color: index == selectedIndex ? Color.black.opacity(0.08) : Color.black.opacity(0.035), radius: 7, y: 3)
            }
            Spacer(minLength: 0)
        }
    }

    private var swipeHint: some View {
        HStack(spacing: 6) {
            Text("↕").font(.caption.weight(.semibold))
            Text(walletTr(appUiLocaleStorage, "Swipe up or down", "Povlecite gor ali dol")).font(.caption.weight(.medium))
        }
        .foregroundColor(walletMuted)
        .frame(maxWidth: .infinity)
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

    private func showcaseEmptyState(
        kind: WalletEmptyKind,
        title: String,
        subtitle: String,
        primaryButtonTitle: String,
        footerText: String,
        footerIcon: String,
        primaryAction: @escaping () -> Void
    ) -> some View {
        VStack(spacing: 0) {
            VStack(spacing: 16) {
                showcaseEmptyIllustration(kind: kind)
                    .padding(.top, 8)

                Text(title)
                    .font(.system(size: 28, weight: .heavy))
                    .tracking(-0.8)
                    .multilineTextAlignment(.center)
                    .foregroundColor(Color(red: 0.03, green: 0.11, blue: 0.30))

                Text(subtitle)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(walletMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 12)
                    .lineSpacing(2)

                Button(action: primaryAction) {
                    Text(primaryButtonTitle)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(Color(red: 0.09, green: 0.41, blue: 0.96))
                        )
                }
                .buttonStyle(.plain)

                if !footerText.isEmpty {
                    HStack(alignment: .top, spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(Color(red: 0.945, green: 0.961, blue: 0.992))
                            Image(systemName: footerIcon)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(Color(red: 0.09, green: 0.41, blue: 0.96))
                        }
                        .frame(width: 42, height: 42)

                        Text(footerText)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(walletMuted)
                            .multilineTextAlignment(.leading)
                            .lineSpacing(2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 18)
        }
        .frame(maxWidth: .infinity)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: Color.black.opacity(0.06), radius: 16, y: 8)
    }

    @ViewBuilder
    private func showcaseEmptyIllustration(kind: WalletEmptyKind) -> some View {
        let imageName: String = {
            switch kind {
            case .entitlements:
                return "WalletEmptyEntitlementsIllustration"
            case .buy:
                return "WalletEmptyBuyIllustration"
            case .orders:
                return "WalletEmptyOrdersIllustration"
            }
        }()

        Image(imageName)
            .resizable()
            .scaledToFit()
            .frame(maxWidth: .infinity)
            .frame(height: 250)
    }

    private func showcaseCard(symbol: String, label: String, width: CGFloat, height: CGFloat, color: Color) -> some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(color)
            .frame(width: width, height: height)
            .overlay {
                VStack(spacing: 6) {
                    Image(systemName: symbol)
                        .font(.system(size: 21, weight: .semibold))
                        .foregroundColor(.white)
                    Text(label)
                        .font(.system(size: 10, weight: .heavy))
                        .foregroundColor(.white)
                }
            }
    }

    private func simpleShowcaseTile(symbol: String, width: CGFloat, height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(Color(red: 0.95, green: 0.96, blue: 0.98))
            .frame(width: width, height: height)
            .overlay {
                Image(systemName: symbol)
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(Color(red: 0.36, green: 0.51, blue: 0.85))
            }
    }
}


private struct WalletQRCodePopupModel: Identifiable, Equatable {
    let title: String
    let subtitle: String
    let code: String
    let entitlementId: String

    var id: String { "\(entitlementId)-\(code)" }
}

private struct WalletQRCodePopup: View {
    let model: WalletQRCodePopupModel
    let languageCode: String
    let onClose: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.46)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(walletInk.opacity(0.82))
                            .frame(width: 38, height: 38)
                            .background(Color.white.opacity(0.92), in: Circle())
                    }
                    .buttonStyle(.plain)
                }
                .overlay(alignment: .center) {
                    VStack(spacing: 7) {
                        Text(model.title)
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(walletInk)
                        Text(model.subtitle)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(walletInk.opacity(0.66))
                    }
                    .padding(.top, 34)
                }
                .padding(.top, 18)
                .padding(.horizontal, 18)

                WalletQRCodeView(content: model.code)
                    .frame(width: 184, height: 184)
                    .padding(.top, 50)
                    .shadow(color: Color.black.opacity(0.08), radius: 12, x: 0, y: 6)

                Text(model.code)
                    .font(.system(size: 26, weight: .medium, design: .monospaced))
                    .tracking(1.5)
                    .foregroundColor(walletInk)
                    .padding(.top, 26)
                    .padding(.bottom, 34)
            }
            .frame(maxWidth: 330)
            .background(
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(Color.white.opacity(0.98))
                    .shadow(color: Color.black.opacity(0.18), radius: 28, x: 0, y: 18)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .stroke(Color.white.opacity(0.82), lineWidth: 1)
            )
            .padding(.horizontal, 30)

            VStack {
                Spacer()
                Text(walletTr(languageCode, "Tap anywhere outside to close", "Tapnite kjerkoli zunaj za zapiranje"))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.82))
                    .padding(.bottom, 52)
            }
        }
    }
}

private struct WalletEntitlementFullList: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    let items: [AccessCardModel]
    let onQRCodeTap: (AccessCardModel, String) -> Void
    let onToggleAutoRenew: (AccessCardModel, Bool) -> Void
    let onBookWithEntitlement: (AccessCardModel) -> Void
    let onShowLess: () -> Void

    var body: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 14) {
                Button(action: onShowLess) {
                    HStack(spacing: 8) {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 12, weight: .bold))
                        Text(walletTr(appUiLocaleStorage, "Show less", "Prikaži manj"))
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(walletBlueSoft)
                    .padding(.horizontal, 14)
                    .frame(height: 34)
                    .background(Color.white.opacity(0.96), in: Capsule(style: .continuous))
                    .overlay(Capsule(style: .continuous).stroke(walletLine.opacity(0.95), lineWidth: 1))
                    .shadow(color: Color.black.opacity(0.05), radius: 8, y: 4)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.bottom, 2)

                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    let code = displayCode(for: item)
                    WalletStackedPassCard(
                        entitlement: item,
                        index: index,
                        cardHeight: WalletStackedPassCard.baseHeight,
                        onTap: {},
                        onQRCodeTap: { code in onQRCodeTap(item, code) },
                        onToggleAutoRenew: { newValue in onToggleAutoRenew(item, newValue) },
                        onBookWithEntitlement: { onBookWithEntitlement(item) }
                    )
                    .shadow(color: Color.black.opacity(0.08), radius: 14, y: 7)
                    .id("full-\(item.id)-\(code)")
                }

                Spacer(minLength: 18)
            }
            .padding(.horizontal, 20)
            .padding(.top, 2)
            .padding(.bottom, 12)
        }
    }

    private func displayCode(for entitlement: AccessCardModel) -> String {
        if let entitlementCode = entitlement.entitlementCode, !entitlementCode.isEmpty { return entitlementCode }
        if let displayCode = entitlement.displayCode, !displayCode.isEmpty { return displayCode }
        return entitlement.entitlementId
    }
}

private struct WalletPullOutEntitlementDeck: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    let items: [AccessCardModel]
    @Binding var focusedEntitlementId: String?
    let onQRCodeTap: (AccessCardModel, String) -> Void
    let onToggleAutoRenew: (AccessCardModel, Bool) -> Void
    let onBookWithEntitlement: (AccessCardModel) -> Void
    let showAllEnabled: Bool
    let onShowAll: () -> Void

    @State private var activeIndex: Int = 0
    @State private var isPulledForward: Bool = true

    private var walletCards: [AccessCardModel] { Array(items.prefix(4)) }

    var body: some View {
        GeometryReader { proxy in
            let cards = walletCards
            let compactLayout = proxy.size.height < 560
            let fullCardHeight: CGFloat = compactLayout ? 260 : 286
            let pocketHeight: CGFloat = compactLayout ? 270 : 328
            let pocketTopWhenStored = max(proxy.size.height - (compactLayout ? 178 : 214), fullCardHeight + 32)
            let pocketVisibleSliceWhenPulled: CGFloat = compactLayout ? 26 : 34
            let pocketTopWhenPulled = max(proxy.size.height - pocketVisibleSliceWhenPulled, fullCardHeight + 58)
            let pocketTop = isPulledForward ? pocketTopWhenPulled : pocketTopWhenStored
            let storedCardStep: CGFloat = isPulledForward ? (compactLayout ? 42 : 48) : (compactLayout ? 52 : 60)
            let stackCards = orderedCards(cards)
            let storedStackCards: [AccessCardModel] = isPulledForward ? Array(stackCards.dropFirst()) : stackCards
            let storedCards = Array(storedStackCards.prefix(3))

            ZStack(alignment: .top) {
                if isPulledForward {
                    EntitlementSwipeHint()
                        .offset(y: max(fullCardHeight + 18, pocketTop - (storedCardStep * CGFloat(max(storedCards.count, 1))) - 36))
                        .zIndex(110)
                }

                ForEach(Array(stackCards.reversed()), id: \.id) { card in
                    let stackPosition = stackCards.firstIndex(where: { $0.id == card.id }) ?? 0
                    let originalIndex = cards.firstIndex(where: { $0.id == card.id }) ?? 0
                    let isActive = stackPosition == 0
                    let cardHeight = isActive && isPulledForward ? fullCardHeight : (compactLayout ? CGFloat(148) : CGFloat(172))
                    let cardTop: CGFloat = {
                        if isPulledForward {
                            if isActive { return 0 }
                            let visibleIndex = max(stackPosition - 1, 0)
                            let visibleCount = max(storedCards.count, 1)
                            return pocketTop - (storedCardStep * CGFloat(visibleCount - visibleIndex)) - 8
                        }
                        let visibleCount = max(stackCards.count, 1)
                        return pocketTop - (storedCardStep * CGFloat(visibleCount - stackPosition)) - 8
                    }()
                    let code = displayCode(for: card)

                    WalletStackedPassCard(
                        entitlement: card,
                        index: originalIndex,
                        cardHeight: cardHeight,
                        onTap: { select(card: card, isActive: isActive) },
                        onQRCodeTap: { code in onQRCodeTap(card, code) },
                        onToggleAutoRenew: { newValue in onToggleAutoRenew(card, newValue) },
                        onBookWithEntitlement: { onBookWithEntitlement(card) }
                    )
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                    .offset(y: cardTop)
                    .shadow(color: isActive && isPulledForward ? Color.black.opacity(0.18) : Color.black.opacity(0.08), radius: isActive && isPulledForward ? 24 : 12, y: isActive && isPulledForward ? 14 : 7)
                    .zIndex(isActive && isPulledForward ? 120 : Double(40 + stackPosition))
                    .animation(.spring(response: 0.46, dampingFraction: 0.84), value: activeIndex)
                    .animation(.spring(response: 0.46, dampingFraction: 0.84), value: isPulledForward)
                    .id("\(card.id)-\(code)-\(stackPosition)")
                }

                WalletLeatherPocket()
                    .frame(height: pocketHeight)
                    .offset(y: pocketTop)
                    .zIndex(70)
                    .allowsHitTesting(false)

                if showAllEnabled && !isPulledForward {
                    Button(action: onShowAll) {
                        Text(walletTr(appUiLocaleStorage, "Show all entitlements", "Prikaži vse vstopnice"))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(walletBlueSoft)
                            .padding(.horizontal, 14)
                            .frame(height: 34)
                            .background(Color.white.opacity(0.96), in: Capsule(style: .continuous))
                            .overlay(Capsule(style: .continuous).stroke(walletLine.opacity(0.95), lineWidth: 1))
                            .shadow(color: Color.black.opacity(0.06), radius: 8, y: 4)
                    }
                    .buttonStyle(.plain)
                    .offset(y: pocketTop + 14)
                    .zIndex(95)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .contentShape(Rectangle())
            .simultaneousGesture(
                DragGesture(minimumDistance: 12)
                    .onEnded { value in
                        handleVerticalDrag(value.translation.height)
                    }
            )
            .onAppear { syncInitialFocus() }
            .onChange(of: items) { _ in syncInitialFocus() }
            .onChange(of: focusedEntitlementId) { _ in syncFocusFromExternalSelection() }
        }
        .padding(.horizontal, 20)
        .padding(.top, 2)
        .padding(.bottom, 8)
    }

    private func orderedCards(_ cards: [AccessCardModel]) -> [AccessCardModel] {
        guard !cards.isEmpty else { return [] }
        let safeIndex = min(max(activeIndex, 0), cards.count - 1)
        return (0..<cards.count).map { cards[(safeIndex + $0) % cards.count] }
    }

    private func select(card: AccessCardModel, isActive: Bool) {
        guard let index = walletCards.firstIndex(where: { $0.id == card.id }) else { return }
        withAnimation(.spring(response: 0.46, dampingFraction: 0.84)) {
            if isActive && isPulledForward {
                isPulledForward = false
            } else {
                activeIndex = index
                isPulledForward = true
            }
            focusedEntitlementId = card.id
        }
    }

    private func handleVerticalDrag(_ translation: CGFloat) {
        guard !walletCards.isEmpty else { return }
        withAnimation(.spring(response: 0.46, dampingFraction: 0.84)) {
            if translation < -28 {
                if !isPulledForward {
                    isPulledForward = true
                    focusedEntitlementId = walletCards[min(activeIndex, walletCards.count - 1)].id
                } else if walletCards.count > 1 {
                    activeIndex = (activeIndex + 1) % walletCards.count
                    focusedEntitlementId = walletCards[activeIndex].id
                }
            } else if translation > 28 {
                if isPulledForward {
                    isPulledForward = false
                    focusedEntitlementId = walletCards[min(activeIndex, walletCards.count - 1)].id
                } else if walletCards.count > 1 {
                    activeIndex = (activeIndex - 1 + walletCards.count) % walletCards.count
                    focusedEntitlementId = walletCards[activeIndex].id
                }
            }
        }
    }

    private func syncInitialFocus() {
        guard !walletCards.isEmpty else { return }
        if activeIndex >= walletCards.count { activeIndex = 0 }
        if let focusedEntitlementId,
           let index = walletCards.firstIndex(where: { $0.id == focusedEntitlementId }) {
            activeIndex = index
        } else {
            focusedEntitlementId = walletCards[activeIndex].id
        }
    }

    private func syncFocusFromExternalSelection() {
        guard let focusedEntitlementId,
              let index = walletCards.firstIndex(where: { $0.id == focusedEntitlementId }) else { return }
        activeIndex = index
        isPulledForward = true
    }

    private func displayCode(for entitlement: AccessCardModel) -> String {
        if let entitlementCode = entitlement.entitlementCode, !entitlementCode.isEmpty { return entitlementCode }
        if let displayCode = entitlement.displayCode, !displayCode.isEmpty { return displayCode }
        return entitlement.entitlementId
    }
}

private struct EntitlementSwipeHint: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    var body: some View {
        HStack(spacing: 7) {
            Text("⌃")
                .font(.system(size: 16, weight: .bold))
            Text(walletTr(appUiLocaleStorage, "Swipe up to pull pass forward", "Povlecite navzgor za prikaz vstopnice"))
                .font(.system(size: 13, weight: .medium))
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
        .foregroundColor(walletInk.opacity(0.78))
        .padding(.horizontal, 14)
        .frame(height: 34)
        .background(Color.white.opacity(0.94), in: Capsule(style: .continuous))
        .overlay(Capsule(style: .continuous).stroke(walletLine.opacity(0.86), lineWidth: 1))
        .shadow(color: Color.black.opacity(0.05), radius: 8, y: 4)
    }
}

private struct WalletLeatherPocket: View {
    var body: some View {
        let outerShape = RoundedRectangle(cornerRadius: 32, style: .continuous)

        ZStack {
            outerShape
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.06, green: 0.30, blue: 0.60), Color(red: 0.04, green: 0.20, blue: 0.45), Color(red: 0.03, green: 0.15, blue: 0.32)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .overlay(outerShape.stroke(Color(red: 0.18, green: 0.45, blue: 0.79).opacity(0.88), lineWidth: 1.3))
                .shadow(color: Color.black.opacity(0.14), radius: 28, y: -2)

            WalletLeatherTexture()

            VStack(spacing: 0) {
                Rectangle()
                    .fill(Color.white.opacity(0.18))
                    .frame(height: 1.2)
                    .padding(.horizontal, 18)
                    .padding(.top, 18)
                Spacer()
            }

            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(style: StrokeStyle(lineWidth: 1.2, dash: [5, 6]))
                .foregroundColor(Color.white.opacity(0.16))
                .padding(18)

            Image(systemName: "building.2")
                .font(.system(size: 56, weight: .light))
                .foregroundColor(Color.white.opacity(0.12))
                .offset(y: 18)
        }
        .clipShape(outerShape)
    }
}

private struct WalletLeatherTexture: View {
    var body: some View {
        Canvas { context, size in
            for row in stride(from: CGFloat(18), through: size.height, by: 30) {
                var path = Path()
                path.move(to: CGPoint(x: 18, y: row))
                path.addLine(to: CGPoint(x: size.width - 18, y: row + 4))
                context.stroke(path, with: .color(Color.white.opacity(0.035)), lineWidth: 1)
            }
            for column in stride(from: CGFloat(32), through: size.width, by: 46) {
                var path = Path()
                path.move(to: CGPoint(x: column, y: 18))
                path.addLine(to: CGPoint(x: column - 8, y: size.height - 18))
                context.stroke(path, with: .color(Color.white.opacity(0.025)), lineWidth: 1)
            }
        }
        .allowsHitTesting(false)
    }
}

private struct WalletVerticalDeck<Item: Identifiable & Hashable, Card: View>: View {
    let items: [Item]
    let cardBuilder: (Item, Int, Bool) -> Card

    @State private var activeIndex = 0
    @GestureState private var dragTranslation: CGFloat = 0

    init(items: [Item], @ViewBuilder cardBuilder: @escaping (Item, Int, Bool) -> Card) {
        self.items = items
        self.cardBuilder = cardBuilder
    }

    var body: some View {
        VStack(spacing: 12) {
            GeometryReader { _ in
                ZStack {
                    ForEach(visibleLayers, id: \.item.id) { layer in
                        let liveOffset = CGFloat(layer.offset) - dragProgress
                        let distance = min(abs(liveOffset), 2)

                        cardBuilder(layer.item, layer.index, distance < 0.5)
                            .scaleEffect(scale(forDistance: distance))
                            .opacity(opacity(forDistance: distance))
                            .offset(y: liveOffset * 166)
                            .zIndex(10 - Double(distance))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 18)
                        .updating($dragTranslation) { value, state, _ in
                            state = min(max(value.translation.height, -124), 124)
                        }
                        .onEnded { value in
                            guard items.count > 1 else { return }
                            withAnimation(.spring(response: 0.38, dampingFraction: 0.88)) {
                                if value.translation.height < -44 {
                                    activeIndex = (activeIndex + 1) % items.count
                                } else if value.translation.height > 44 {
                                    activeIndex = (activeIndex - 1 + items.count) % items.count
                                }
                            }
                        }
                )
                .animation(.spring(response: 0.38, dampingFraction: 0.88), value: activeIndex)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .frame(maxHeight: .infinity)

            HStack(spacing: 9) {
                ForEach(0..<min(items.count, 5), id: \.self) { index in
                    Circle()
                        .fill(index == activeIndex ? walletBlueSoft : walletMuted.opacity(0.28))
                        .frame(width: index == activeIndex ? 8 : 7, height: index == activeIndex ? 8 : 7)
                        .animation(.easeInOut(duration: 0.18), value: activeIndex)
                }
            }
            .padding(.bottom, 14)
        }
        .padding(.bottom, 6)
        .onAppear { seedActiveIndex() }
        .onChange(of: items) { _ in seedActiveIndex(force: true) }
    }

    private var preferredInitialIndex: Int {
        items.count >= 3 ? 1 : 0
    }

    private func seedActiveIndex(force: Bool = false) {
        guard !items.isEmpty else {
            activeIndex = 0
            return
        }
        if activeIndex > items.count - 1 {
            activeIndex = max(0, items.count - 1)
        }
        if force || activeIndex == 0 {
            activeIndex = min(preferredInitialIndex, items.count - 1)
        }
    }

    private var dragProgress: CGFloat {
        guard items.count > 1 else { return 0 }
        return min(max(-dragTranslation / 124, -1), 1)
    }

    private var visibleLayers: [WalletDeckLayer<Item>] {
        guard !items.isEmpty else { return [] }
        let offsets: [Int]
        switch items.count {
        case 1: offsets = [0]
        case 2: offsets = [0, 1]
        default: offsets = [-1, 0, 1]
        }

        return offsets.map { offset in
            let index = (activeIndex + offset + items.count) % items.count
            return WalletDeckLayer(offset: offset, item: items[index], index: index)
        }
    }

    private func scale(forDistance distance: CGFloat) -> CGFloat {
        if distance < 0.5 { return 1.0 }
        return 0.985
    }

    private func opacity(forDistance distance: CGFloat) -> Double {
        if distance < 0.5 { return 1.0 }
        return 0.96
    }
}

private struct WalletDeckLayer<Item: Identifiable & Hashable>: Hashable {
    let offset: Int
    let item: Item
    let index: Int
}

// MARK: - Store helper

extension AppStore {
    func tenantPaymentMethods(companyId: String) -> [String] {
        let accepted = linkedTenants
            .first(where: { $0.id == companyId })?
            .acceptedPaymentMethods
            ?? []
        return normalizeWalletBuyMethods(accepted)
    }
}

private func normalizeWalletBuyMethods(_ methods: [String]) -> [String] {
    let allowed = Set(["CARD", "BANK_TRANSFER", "PAYPAL"])
    let accepted = Set(
        methods
            .map { $0.uppercased() }
            // Wallet Buy intentionally excludes gift-card checkout.
            .filter { allowed.contains($0) }
    )
    let ordered = ["CARD", "BANK_TRANSFER", "PAYPAL"].filter { accepted.contains($0) }
    // If tenant config exposes no wallet-compatible methods, default to bank transfer only.
    return ordered.isEmpty ? ["BANK_TRANSFER"] : ordered
}

private struct WalletTicketStyle {
    let background: Color
    let accent: Color
    let border: Color
    let softAccent: Color
}

private struct WalletStackedPassCard: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    static let baseHeight: CGFloat = 260

    let entitlement: AccessCardModel
    let index: Int
    var cardHeight: CGFloat = baseHeight
    let onTap: () -> Void
    let onQRCodeTap: (String) -> Void
    let onToggleAutoRenew: (Bool) -> Void
    let onBookWithEntitlement: () -> Void

    private var style: WalletTicketStyle { walletTicketStyle(type: entitlement.type, index: index) }
    private var shape: CompactTicketShape { CompactTicketShape(cornerRadius: 20, notchRadius: 10, notchFractionY: 0.48) }
    private var code: String {
        if entitlement.type.uppercased() == "COURSE", let accessUrl = entitlement.accessUrl, !accessUrl.isEmpty { return accessUrl }
        if let entitlementCode = entitlement.entitlementCode, !entitlementCode.isEmpty { return entitlementCode }
        if let displayCode = entitlement.displayCode, !displayCode.isEmpty { return displayCode }
        return entitlement.entitlementId
    }

    var body: some View {
        Group {
            if isBookableTicket {
                modernBookingCard
            } else {
                defaultCard
            }
        }
        .frame(height: cardHeight)
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }

    private var defaultCard: some View {
        ZStack(alignment: .bottomTrailing) {
            WalletPassWave(accent: style.accent)
                .frame(height: 92)
                .padding(.trailing, 16)
                .padding(.bottom, 18)
                .allowsHitTesting(false)

            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(entitlement.name)
                            .font(.system(size: 20, weight: .bold, design: .serif))
                            .foregroundColor(walletInk)
                            .lineLimit(1)
                            .minimumScaleFactor(0.78)
                    }
                    Spacer(minLength: 10)
                    WalletTypeBadge(label: entitlementKindLabel, accent: style.accent)
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 16)

                dashedDivider(color: style.accent.opacity(0.62))
                    .padding(.horizontal, 17)

                HStack(alignment: .bottom, spacing: 14) {
                    VStack(alignment: .leading, spacing: 15) {
                        HStack(spacing: 18) {
                            WalletDetailBlock(label: primaryMetric.label.uppercased(), value: primaryMetric.value, accent: style.accent)
                            Rectangle()
                                .fill(walletLine.opacity(0.95))
                                .frame(width: 1, height: 36)
                            WalletDetailBlock(label: secondaryMetric.label.uppercased(), value: secondaryMetric.value, accent: style.accent)
                        }
                        if entitlement.type.uppercased() != "GIFT_CARD" {
                            Divider().overlay(walletLine.opacity(0.55))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(walletTr(appUiLocaleStorage, "SCAN CODE", "KODA"))
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(walletInk.opacity(0.58))
                                Text(code)
                                    .font(.system(size: 15, weight: .medium, design: .monospaced))
                                    .foregroundColor(walletInk)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Button {
                        onQRCodeTap(code)
                    } label: {
                        WalletQRCodeView(content: code)
                            .frame(width: 74, height: 74)
                            .overlay(
                                Circle()
                                    .stroke(style.accent.opacity(0.22), lineWidth: 1.2)
                                    .scaleEffect(1.16)
                            )
                            .overlay(
                                Circle()
                                    .stroke(style.accent.opacity(0.12), lineWidth: 1.2)
                                    .scaleEffect(1.42)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Enlarge QR code")
                    .padding(.bottom, 1)
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 18)
            }
        }
        .background(
            shape.fill(
                LinearGradient(
                    colors: [style.background, Color(.systemBackground).opacity(0.92), style.softAccent.opacity(0.30)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        )
        .clipShape(shape)
        .overlay(shape.stroke(style.border, lineWidth: 1.25))
        .shadow(color: style.accent.opacity(0.12), radius: 12, x: 0, y: 7)
        .shadow(color: Color.black.opacity(0.045), radius: 7, x: 0, y: 3)
    }

    private var modernBookingCard: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [Color(red: 1.0, green: 0.66, blue: 0.12), Color(red: 1.0, green: 0.55, blue: 0.05)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                ZStack(alignment: .topTrailing) {
                    Circle()
                        .fill(Color.white.opacity(0.09))
                        .frame(width: 180, height: 180)
                        .offset(x: 70, y: 52)

                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .top, spacing: 16) {
                            VStack(alignment: .leading, spacing: 14) {
                                HStack(alignment: .top, spacing: 10) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(entitlement.name)
                                            .font(.system(size: 20, weight: .bold))
                                            .foregroundColor(.white)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.76)
                                    }
                                }

                                Button {
                                    onBookWithEntitlement()
                                } label: {
                                    HStack(spacing: 10) {
                                        Image(systemName: "calendar")
                                            .font(.system(size: 16, weight: .semibold))
                                        Text(walletTr(appUiLocaleStorage, "Choose slot", "Izberi termin"))
                                            .font(.system(size: 13, weight: .bold))
                                            .lineLimit(1)
                                        Spacer(minLength: 6)
                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 13, weight: .bold))
                                    }
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 13)
                                    .frame(height: 38)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(
                                        LinearGradient(
                                            colors: [Color(red: 0.03, green: 0.19, blue: 0.44), Color(red: 0.07, green: 0.30, blue: 0.62)],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        ),
                                        in: Capsule(style: .continuous)
                                    )
                                    .shadow(color: Color.black.opacity(0.18), radius: 14, x: 0, y: 8)
                                }
                                .buttonStyle(.plain)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)

                            VStack(alignment: .trailing, spacing: 12) {
                                WalletGlassTypeBadge(label: entitlementKindLabel)

                                Button {
                                    onQRCodeTap(code)
                                } label: {
                                    VStack(spacing: 6) {
                                        WalletQRCodeView(content: code)
                                            .frame(width: 44, height: 44)
                                        Text(walletTr(appUiLocaleStorage, "Show QR", "Prikaži QR"))
                                            .font(.system(size: 11, weight: .semibold))
                                            .foregroundColor(Color.white)
                                    }
                                    .frame(width: 72)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 20)

                        Spacer(minLength: 16)

                        HStack(spacing: 0) {
                            bookingMetricColumn(
                                title: walletTr(appUiLocaleStorage, "EXPIRES", "POTEČE"),
                                value: validUntilLabel,
                                caption: expiryCaption
                            )
                            .frame(maxWidth: .infinity, alignment: .leading)
                            bookingMetricDivider
                            bookingAccessRemainingMetric
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                        .padding(.bottom, 18)
                    }
                }
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.white.opacity(0.18), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.10), radius: 18, x: 0, y: 10)
    }


    private var bookingAccessRemainingMetric: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(walletTr(appUiLocaleStorage, "ACCESS / REMAINING", "DOSTOP / PREOSTALO"))
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color.white.opacity(0.82))
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.24), lineWidth: 3.5)
                    Circle()
                        .trim(from: 0, to: accessRemainingProgress)
                        .stroke(
                            Color.white,
                            style: StrokeStyle(lineWidth: 3.5, lineCap: .round, lineJoin: .round)
                        )
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 24, height: 24)

                Text(accessRemainingDisplayValue)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
            }
        }
    }

    private var bookingMetricDivider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.25))
            .frame(width: 1, height: 58)
            .padding(.horizontal, 12)
    }

    private func bookingMetricColumn(title: String, value: String, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color.white.opacity(0.82))
            Text(value)
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.76)
            Text(caption)
                .font(.system(size: 8, weight: .medium))
                .foregroundColor(Color.white.opacity(0.82))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var isBookableTicket: Bool {
        (entitlement.type == "PACK" || entitlement.type == "CLASS_TICKET") && !isInactiveStatus
    }

    private var isInactiveStatus: Bool {
        switch entitlement.status.uppercased() {
        case "EXPIRED", "USED_UP", "CANCELLED", "INACTIVE":
            return true
        default:
            return false
        }
    }

    private var typeLabel: String {
        switch entitlement.type {
        case "CLASS_TICKET": return "Single"
        default: return productTypeLabel(entitlement.type)
        }
    }

    private var entitlementKindLabel: String {
        switch entitlement.type.uppercased() {
        case "PACK", "CLASS_TICKET": return walletTr(appUiLocaleStorage, "Ticket", "Vstopnica")
        case "MEMBERSHIP": return walletTr(appUiLocaleStorage, "Membership", "Članarina")
        case "GIFT_CARD": return walletTr(appUiLocaleStorage, "Gift card", "Darilna kartica")
        case "COURSE": return walletTr(appUiLocaleStorage, "Course access", "Dostop do tečaja")
        default: return productTypeLabel(entitlement.type)
        }
    }

    private var statusLabel: String {
        switch entitlement.status.uppercased() {
        case "EXPIRED": return "Expired"
        case "USED_UP": return "Used up"
        case "CANCELLED": return "Cancelled"
        case "PENDING": return "Pending"
        default: break
        }
        switch entitlement.type {
        case "PACK":
            if let remaining = entitlement.remainingUses { return "\(remaining) left" }
            return "Active"
        case "CLASS_TICKET": return "Ready"
        case "COURSE": return walletTr(appUiLocaleStorage, "Available", "Na voljo")
        default: return "Active"
        }
    }

    private var statusAccent: Color {
        switch entitlement.status.uppercased() {
        case "EXPIRED", "CANCELLED", "USED_UP": return walletMuted
        case "PENDING": return walletAmber
        default: return entitlement.type == "MEMBERSHIP" ? walletGreen : style.accent
        }
    }

    private var primaryMetric: (label: String, value: String) {
        switch entitlement.type {
        case "MEMBERSHIP": return ("Visits", "\(entitlement.visitCount ?? 0)")
        case "PACK": return ("Access", usesSummary)
        case "CLASS_TICKET": return ("Access", "1 class")
        case "GIFT_CARD": return ("Balance", giftCardBalance)
        case "COURSE": return (walletTr(appUiLocaleStorage, "Access", "Dostop"), walletTr(appUiLocaleStorage, "Open course", "Odpri tečaj"))
        default: return (productTypeLabel(entitlement.type), usesSummary)
        }
    }

    private var secondaryMetric: (label: String, value: String) {
        switch entitlement.type {
        case "MEMBERSHIP": return ("Valid until", validUntilLabel)
        case "PACK": return ("Expires", validUntilLabel)
        case "CLASS_TICKET": return ("Date", validUntilLabel)
        case "COURSE": return (walletTr(appUiLocaleStorage, "Access", "Dostop"), validUntilLabel == "No expiry" ? walletTr(appUiLocaleStorage, "Lifetime", "Doživljenjsko") : validUntilLabel)
        default: return ("Valid until", validUntilLabel)
        }
    }

    private var usesSummary: String {
        if let remaining = entitlement.remainingUses, let total = entitlement.totalUses {
            return "\(remaining) classes"
        }
        if let remaining = entitlement.remainingUses { return "\(remaining) classes" }
        if let total = entitlement.totalUses { return "\(total) classes" }
        if entitlement.type == "MEMBERSHIP" { return "Unlimited" }
        return "1 class"
    }

    private var giftCardBalance: String {
        String(format: "%.2f %@", entitlement.remainingValueGross ?? 0.0, entitlement.currency ?? "EUR")
    }

    private var validUntilLabel: String {
        let formatted = formatLongDate(entitlement.validUntil)
        return formatted == "—" ? walletTr(appUiLocaleStorage, "No expiry", "Brez poteka") : formatted
    }

    private var expiryCaption: String {
        validUntilLabel == walletTr(appUiLocaleStorage, "No expiry", "Brez poteka")
            ? walletTr(appUiLocaleStorage, "Valid", "Veljavno")
            : walletTr(appUiLocaleStorage, "Until date", "Do datuma")
    }

    private var accessMetricValue: String {
        if let total = entitlement.totalUses, total > 0 {
            return walletTr(appUiLocaleStorage, "\(total) visits", "\(total) obisk\(total == 1 ? "" : "i")")
        }
        if entitlement.type == "CLASS_TICKET" {
            return walletTr(appUiLocaleStorage, "1 visit", "1 obisk")
        }
        if let remaining = entitlement.remainingUses, remaining > 0 {
            return walletTr(appUiLocaleStorage, "\(remaining) visits", "\(remaining) obisk\(remaining == 1 ? "" : "i")")
        }
        return walletTr(appUiLocaleStorage, "Flexible", "Prilagodljivo")
    }

    private var accessMetricCaption: String {
        walletTr(appUiLocaleStorage, "Ready to use", "Pripravljeno za uporabo")
    }


    private var accessRemainingDisplayValue: String {
        if let remaining = entitlement.remainingUses, let total = effectiveTotalUses {
            return "\(max(remaining, 0)) / \(total)"
        }
        if let remaining = entitlement.remainingUses {
            return "\(max(remaining, 0))"
        }
        return accessMetricValue
    }

    private var accessRemainingProgress: CGFloat {
        guard let remaining = entitlement.remainingUses, let total = effectiveTotalUses, total > 0 else {
            return entitlement.remainingUses == nil ? 0 : 1
        }
        return min(max(CGFloat(max(remaining, 0)) / CGFloat(total), 0), 1)
    }

    private var effectiveTotalUses: Int? {
        if let total = entitlement.totalUses, total > 0 { return total }
        if entitlement.type == "CLASS_TICKET" { return 1 }
        return nil
    }

    private var remainingMetricValue: String {
        if let remaining = entitlement.remainingUses {
            return walletTr(appUiLocaleStorage, "\(remaining) left", "\(remaining) preostalo")
        }
        if let visits = entitlement.visitCount, visits > 0 {
            return walletTr(appUiLocaleStorage, "\(visits) visits", "\(visits) obiskov")
        }
        return walletTr(appUiLocaleStorage, "Available", "Na voljo")
    }

    private var remainingMetricCaption: String {
        walletTr(appUiLocaleStorage, "Use on next booking", "Za naslednjo rezervacijo")
    }

    private func dashedDivider(color: Color) -> some View {
        GeometryReader { proxy in
            Path { path in
                let y = proxy.size.height / 2
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: proxy.size.width, y: y))
            }
            .stroke(style: StrokeStyle(lineWidth: 1.15, dash: [6, 7], dashPhase: 1))
            .foregroundColor(color)
        }
        .frame(height: 1)
    }
}

private struct WalletCommercePassCard: View {
    let index: Int
    let type: String
    let title: String
    let subtitle: String
    let statusLabel: String
    let statusAccent: Color
    let primary: (label: String, value: String)
    let secondary: (label: String, value: String)
    let code: String
    let onTap: (() -> Void)?

    private var style: WalletTicketStyle { walletTicketStyle(type: type, index: index) }
    private var shape: CompactTicketShape { CompactTicketShape(cornerRadius: 20, notchRadius: 10, notchFractionY: 0.48) }

    var body: some View {
        let card = ZStack(alignment: .bottomTrailing) {
            WalletPassWave(accent: style.accent)
                .frame(height: 92)
                .padding(.trailing, 16)
                .padding(.bottom, 18)
                .allowsHitTesting(false)

            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 14) {
                    WalletPassIconBadge(type: type, accent: style.accent)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(productTypeLabel(type).uppercased())
                            .font(.system(size: 11, weight: .bold))
                            .tracking(0.8)
                            .foregroundColor(style.accent)
                        Text(title)
                            .font(.system(size: 22, weight: .bold, design: .serif))
                            .foregroundColor(walletInk)
                            .lineLimit(1)
                            .minimumScaleFactor(0.78)
                        HStack(spacing: 5) {
                            Image(systemName: "mappin.circle")
                                .font(.system(size: 14, weight: .medium))
                            Text(subtitle)
                                .font(.system(size: 14, weight: .medium))
                                .lineLimit(1)
                        }
                        .foregroundColor(walletInk.opacity(0.70))
                    }
                    Spacer(minLength: 10)
                    WalletStatusBadge(label: statusLabel, accent: statusAccent)
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 16)

                GeometryReader { proxy in
                    Path { path in
                        let y = proxy.size.height / 2
                        path.move(to: CGPoint(x: 0, y: y))
                        path.addLine(to: CGPoint(x: proxy.size.width, y: y))
                    }
                    .stroke(style: StrokeStyle(lineWidth: 1.15, dash: [6, 7], dashPhase: 1))
                    .foregroundColor(style.accent.opacity(0.62))
                }
                .frame(height: 1)
                .padding(.horizontal, 17)

                HStack(alignment: .bottom, spacing: 14) {
                    VStack(alignment: .leading, spacing: 15) {
                        HStack(spacing: 18) {
                            WalletDetailBlock(label: primary.label.uppercased(), value: primary.value, accent: style.accent)
                            Rectangle()
                                .fill(walletLine.opacity(0.95))
                                .frame(width: 1, height: 36)
                            WalletDetailBlock(label: secondary.label.uppercased(), value: secondary.value, accent: style.accent)
                        }
                        Divider().overlay(walletLine.opacity(0.55))
                        VStack(alignment: .leading, spacing: 4) {
                            Text("SCAN CODE")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(walletInk.opacity(0.58))
                            Text(code)
                                .font(.system(size: 15, weight: .medium, design: .monospaced))
                                .foregroundColor(walletInk)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    WalletQRCodeView(content: code)
                        .frame(width: 74, height: 74)
                        .padding(.bottom, 1)
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 18)
            }
        }
        .frame(height: 158)
        .background(
            shape.fill(
                LinearGradient(
                    colors: [style.background, Color(.systemBackground).opacity(0.92), style.softAccent.opacity(0.30)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        )
        .clipShape(shape)
        .overlay(shape.stroke(style.border, lineWidth: 1.25))
        .shadow(color: style.accent.opacity(0.12), radius: 12, x: 0, y: 7)
        .shadow(color: Color.black.opacity(0.045), radius: 7, x: 0, y: 3)
        .contentShape(Rectangle())

        if let onTap {
            card.onTapGesture(perform: onTap)
        } else {
            card
        }
    }
}

private struct WalletPassIconBadge: View {
    let type: String
    let accent: Color

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(.systemBackground).opacity(0.74))
                .overlay(Circle().stroke(accent.opacity(0.18), lineWidth: 1))
            Image(systemName: iconName)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(accent)
        }
        .frame(width: 50, height: 50)
        .shadow(color: Color.black.opacity(0.035), radius: 8, y: 4)
    }

    private var iconName: String {
        switch type {
        case "PACK": return "figure.pilates"
        case "MEMBERSHIP": return "mountain.2"
        case "CLASS_TICKET": return "figure.mind.and.body"
        default: return "ticket"
        }
    }
}

private struct WalletLogoBadge: View {
    let text: String

    var body: some View {
        ZStack {
            Circle().fill(walletInk)
            Text(text)
                .font(.system(size: 13, weight: .bold))
                .tracking(1.5)
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
        }
        .frame(width: 56, height: 56)
    }
}

private struct WalletTypeBadge: View {
    let label: String
    let accent: Color

    var body: some View {
        Text(label)
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(accent)
            .padding(.horizontal, 14)
            .frame(height: 36)
            .background(accent.opacity(0.10), in: Capsule(style: .continuous))
            .overlay(Capsule(style: .continuous).stroke(accent.opacity(0.16), lineWidth: 1))
            .lineLimit(1)
    }
}

private struct WalletGlassTypeBadge: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(Color.white)
            .padding(.horizontal, 14)
            .frame(height: 34)
            .background(Color.white.opacity(0.18), in: Capsule(style: .continuous))
            .overlay(
                Capsule(style: .continuous)
                    .stroke(Color.white.opacity(0.35), lineWidth: 1)
            )
            .lineLimit(1)
    }
}

private struct WalletStatusBadge: View {
    let label: String
    let accent: Color

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(accent).frame(width: 6, height: 6)
            Text(label)
                .font(.system(size: 13, weight: .semibold))
        }
        .foregroundColor(accent)
        .padding(.horizontal, 12)
        .frame(height: 36)
        .background(accent.opacity(0.10), in: Capsule(style: .continuous))
        .overlay(Capsule(style: .continuous).stroke(accent.opacity(0.16), lineWidth: 1))
        .lineLimit(1)
    }
}

private struct WalletDetailBlock: View {
    let label: String
    let value: String
    var accent: Color = walletInk

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .tracking(0.4)
                .foregroundColor(walletInk.opacity(0.58))
            Text(value)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(accent)
                .lineLimit(1)
                .minimumScaleFactor(0.74)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct WalletQRCodeView: View {
    let content: String

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.98))
                .shadow(color: Color.black.opacity(0.08), radius: 8, y: 4)
            if let image = makeQRCode(content) {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .padding(7)
            } else {
                Image(systemName: "qrcode")
                    .font(.system(size: 34, weight: .regular))
                    .foregroundColor(walletInk)
            }
        }
    }

    private func makeQRCode(_ string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let transform = CGAffineTransform(scaleX: 8, y: 8)
        let scaled = output.transformed(by: transform)
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

private struct WalletPassWave: View {
    let accent: Color

    var body: some View {
        Canvas { context, size in
            for i in 0..<8 {
                var path = Path()
                let y = size.height * (0.30 + CGFloat(i) * 0.055)
                path.move(to: CGPoint(x: size.width * 0.12, y: y))
                path.addCurve(
                    to: CGPoint(x: size.width, y: y + CGFloat(i % 3) * 2),
                    control1: CGPoint(x: size.width * 0.42, y: y - 20),
                    control2: CGPoint(x: size.width * 0.70, y: y + 18)
                )
                context.stroke(path, with: .color(accent.opacity(0.055)), lineWidth: 0.8)
            }
        }
    }
}

private func walletTicketStyle(type: String, index: Int) -> WalletTicketStyle {
    switch type {
    case "MEMBERSHIP":
        return WalletTicketStyle(
            background: Color(red: 0.93, green: 0.97, blue: 1.0),
            accent: walletBlueSoft,
            border: walletBlueSoft.opacity(0.82),
            softAccent: Color(red: 0.78, green: 0.90, blue: 1.0)
        )
    case "PACK":
        return WalletTicketStyle(
            background: Color(red: 1.0, green: 0.96, blue: 0.90),
            accent: walletAmber,
            border: walletAmber.opacity(0.78),
            softAccent: Color(red: 1.0, green: 0.86, blue: 0.66)
        )
    case "CLASS_TICKET":
        return WalletTicketStyle(
            background: Color(red: 0.95, green: 0.98, blue: 1.0),
            accent: walletGold,
            border: walletGold.opacity(0.50),
            softAccent: Color(red: 0.82, green: 0.91, blue: 1.0)
        )
    default:
        let isBlue = index % 2 == 0
        return WalletTicketStyle(
            background: isBlue ? Color(red: 0.94, green: 0.98, blue: 1.0) : Color(red: 1.0, green: 0.96, blue: 0.90),
            accent: isBlue ? walletBlueSoft : walletAmber,
            border: (isBlue ? walletBlueSoft : walletAmber).opacity(0.66),
            softAccent: isBlue ? Color(red: 0.78, green: 0.90, blue: 1.0) : Color(red: 1.0, green: 0.86, blue: 0.66)
        )
    }
}

private func walletInitials(_ raw: String) -> String {
    let initials = raw
        .split(separator: " ")
        .compactMap { $0.first }
        .prefix(2)
        .map { String($0).uppercased() }
        .joined()
    return initials.isEmpty ? "W" : initials
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
        }
    }

    @ViewBuilder
    private var ticketBody: some View {
        let shape = TicketShape(cornerRadius: 28, notchRadius: 14, notchFractionX: notchFractionX)
        HStack(alignment: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 9) {
                entitlementIconBadge(type: entitlement.type, size: 52, background: Color.white.opacity(0.18), tint: .white)
                Text(entitlement.name)
                    .font(.title2.weight(.bold))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.leading)
                Text(priceLine)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white.opacity(0.82))
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

            if entitlement.type.uppercased() != "GIFT_CARD" {
                verticalDashedDivider
                    .padding(.vertical, 20)

                VStack(alignment: .leading, spacing: 6) {
                    Text("SCAN CODE")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.white.opacity(0.65))
                        .tracking(0.5)
                    Text(entitlement.entitlementCode ?? entitlement.displayCode ?? "—")
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
        case "PACK": return "Pack"
        case "CLASS_TICKET": return "Ticket"
        case "MEMBERSHIP": return "Membership"
        default: return "Access"
        }
    }

    private var accessSub: String? {
        if let remaining = entitlement.remainingUses, let total = entitlement.totalUses {
            return "\(remaining) of \(total) left"
        }
        if let remaining = entitlement.remainingUses {
            return "\(remaining) uses left"
        }
        if let total = entitlement.totalUses {
            return "\(total) total entries"
        }
        if entitlement.type == "MEMBERSHIP" {
            return "Visits: \(entitlement.visitCount ?? 0)"
        }
        return nil
    }

    private var validUntilText: String? {
        formatLongDate(entitlement.validUntil)
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
        case "MEMBERSHIP": return "Visits: \(entitlement.visitCount ?? 0)"
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

private func productTypeLabel(_ type: String, languageCode: String = "en") -> String {
    walletProductTypeLabel(type, languageCode: languageCode)
}

private func normalizeOrderProductType(_ productType: String?) -> String {
    switch productType {
    case "PACK", "MEMBERSHIP", "CLASS_TICKET":
        return productType!
    default:
        return "ORDER"
    }
}

private func offerPriceLabel(_ offer: WalletOfferModel, monthly: Bool = false) -> String {
    let wholeNumber = offer.priceGross.rounded() == offer.priceGross
    let number = wholeNumber ? String(format: "%.0f", offer.priceGross) : String(format: "%.2f", offer.priceGross)
    let prefix: String
    switch offer.currency.uppercased() {
    case "EUR": prefix = "€"
    case "USD": prefix = "$"
    case "GBP": prefix = "£"
    default: prefix = ""
    }
    let suffix = prefix.isEmpty ? " \(offer.currency)" : ""
    return "\(prefix)\(number)\(suffix)\(monthly ? "/mo" : "")"
}

// MARK: - Marketplace Buy design

private struct BuySearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(walletMuted)
            TextField("Search passes, classes, offers...", text: $text)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(walletInk)
                .textInputAutocapitalization(.never)
                .disableAutocorrection(true)
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(walletMuted.opacity(0.72))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(height: 54)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(walletLine.opacity(0.95), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.035), radius: 10, y: 5)
    }
}

private struct BuyCategoryChip: View {
    let title: String
    let iconName: String
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 7) {
                Image(systemName: iconName)
                    .font(.system(size: 13, weight: .bold))
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .lineLimit(1)
            }
            .foregroundColor(selected ? .white : walletInk)
            .padding(.horizontal, 14)
            .frame(height: 42)
            .background(
                Capsule(style: .continuous)
                    .fill(selected ? Color(red: 0.04, green: 0.32, blue: 0.92) : Color.white)
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke(selected ? Color.clear : walletLine.opacity(0.95), lineWidth: 1)
            )
            .shadow(color: selected ? walletBlueSoft.opacity(0.22) : Color.black.opacity(0.035), radius: selected ? 12 : 7, y: selected ? 6 : 3)
        }
        .buttonStyle(.plain)
    }
}

private struct BuyShowcaseCategoryChip: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    let category: WalletBuyCategory
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(category.localizedTitle(languageCode: appUiLocaleStorage))
                .font(.system(size: 12, weight: selected ? .bold : .medium))
                .lineLimit(1)
                .foregroundColor(selected ? .white : walletInk.opacity(0.88))
                .padding(.horizontal, selected ? 12 : 10)
                .frame(height: 32)
                .background(Capsule(style: .continuous).fill(selected ? walletBlueSoft : Color.white.opacity(0.94)))
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(selected ? walletBlueSoft.opacity(0.45) : walletLine.opacity(0.95), lineWidth: 1)
                )
                .shadow(color: selected ? Color.black.opacity(0.08) : Color.black.opacity(0.035), radius: selected ? 8 : 5, y: selected ? 4 : 2)
        }
        .buttonStyle(.plain)
    }
}

private struct BuyShowcaseOfferCard: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    let offer: WalletOfferModel
    let index: Int
    let priceLabel: String
    let onTap: () -> Void

    private var accent: Color {
        switch offer.productType {
        case "MEMBERSHIP": return walletBlueSoft
        case "GIFT_CARD", "GIFT_CARD_PRODUCT": return walletAmber
        default: return index % 2 == 0 ? walletBlueSoft : walletAmber
        }
    }

    private var softAccent: Color {
        switch offer.productType {
        case "MEMBERSHIP": return Color(red: 0.90, green: 0.96, blue: 0.93)
        case "GIFT_CARD", "GIFT_CARD_PRODUCT": return Color(red: 1.00, green: 0.95, blue: 0.88)
        default: return index % 2 == 0 ? Color(red: 0.90, green: 0.96, blue: 1.00) : Color(red: 1.00, green: 0.94, blue: 0.86)
        }
    }

    private var visualTint: Color {
        switch offer.productType {
        case "MEMBERSHIP": return Color(red: 0.14, green: 0.57, blue: 0.34)
        case "GIFT_CARD", "GIFT_CARD_PRODUCT": return walletAmber
        default: return index % 2 == 0 ? walletBlueSoft : walletAmber
        }
    }

    private var typeLabel: String {
        switch offer.productType {
        case "MEMBERSHIP": return walletTr(appUiLocaleStorage, "MEMBERSHIP", "ČLANARINA")
        case "COURSE": return walletTr(appUiLocaleStorage, "COURSE ACCESS", "DOSTOP DO TEČAJA")
        case "GIFT_CARD", "GIFT_CARD_PRODUCT": return walletTr(appUiLocaleStorage, "GIFT CARD", "DARILNA KARTICA")
        default: return walletTr(appUiLocaleStorage, "CARD", "KARTA")
        }
    }

    private var promoLabel: String {
        if let promoText = offer.promoText?.trimmingCharacters(in: .whitespacesAndNewlines), !promoText.isEmpty { return promoText }
        switch offer.productType {
        case "MEMBERSHIP": return walletTr(appUiLocaleStorage, "Special offer", "Posebna ponudba")
        case "COURSE": return walletTr(appUiLocaleStorage, "Course access", "Dostop do tečaja")
        case "GIFT_CARD", "GIFT_CARD_PRODUCT": return walletTr(appUiLocaleStorage, "Great gift", "Odlično darilo")
        default: return index % 2 == 0 ? walletTr(appUiLocaleStorage, "New", "Novo") : walletTr(appUiLocaleStorage, "Deal", "Akcija")
        }
    }

    private var quantityLabel: String {
        let isSl = appUiLocaleStorage.lowercased().hasPrefix("sl")
        if offer.productType == "MEMBERSHIP" { return isSl ? "1 mesec" : "1 month" }
        if offer.productType == "COURSE" { return isSl ? "doživljenjski dostop" : "lifetime access" }
        if offer.productType == "GIFT_CARD" || offer.productType == "GIFT_CARD_PRODUCT" { return isSl ? "1 kos" : "1 item" }
        guard let usageLimit = offer.usageLimit, usageLimit > 1 else { return isSl ? "1 obisk" : "1 visit" }
        return isSl ? "\(usageLimit) obiskov" : "\(usageLimit) visits"
    }

    private var descriptionText: String {
        if let description = offer.description?.trimmingCharacters(in: .whitespacesAndNewlines), !description.isEmpty { return description }
        switch offer.productType {
        case "MEMBERSHIP": return walletTr(appUiLocaleStorage, "Unlimited access to selected services", "Neomejen dostop do izbranih storitev")
        case "COURSE": return walletTr(appUiLocaleStorage, "Lifetime access to selected courses after purchase", "Doživljenjski dostop do izbranih tečajev po nakupu")
        case "GIFT_CARD", "GIFT_CARD_PRODUCT": return walletTr(appUiLocaleStorage, "For all services from this provider", "Za vse storitve pri ponudniku")
        default: return walletTr(appUiLocaleStorage, "Flexible access for regular visits", "Popolno za redne obiske")
        }
    }

    private var expiryText: String {
        if offer.productType == "COURSE" {
            return walletTr(appUiLocaleStorage, "No expiry", "Brez poteka")
        }
        let fallback = appUiLocaleStorage.lowercased().hasPrefix("sl") ? "31. 12. 2026" : "31 Dec 2026"
        guard let validityDays = offer.validityDays, validityDays > 0,
              let date = Calendar.current.date(byAdding: .day, value: validityDays, to: Date()) else {
            return walletTr(appUiLocaleStorage, "Expires: \(fallback)", "Poteče: \(fallback)")
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: appUiLocaleStorage.lowercased().hasPrefix("sl") ? "sl_SI" : "en_US_POSIX")
        formatter.dateFormat = appUiLocaleStorage.lowercased().hasPrefix("sl") ? "dd. MM. yyyy" : "dd MMM yyyy"
        return walletTr(appUiLocaleStorage, "Expires: \(formatter.string(from: date))", "Poteče: \(formatter.string(from: date))")
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topLeading) {
                LinearGradient(
                    colors: [Color.white, softAccent, softAccent.opacity(0.74)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                BuyPremiumVisualBackdrop(accent: visualTint, index: index)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                    .clipped()

                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .center, spacing: 8) {
                        Text(typeLabel)
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(.white)
                            .lineLimit(1)
                            .padding(.horizontal, 10)
                            .frame(height: 28)
                            .background(walletBlue, in: Capsule(style: .continuous))

                        Text(promoLabel)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(walletAmber)
                            .lineLimit(1)
                            .padding(.horizontal, 10)
                            .frame(height: 28)
                            .background(Color(red: 1.0, green: 0.90, blue: 0.80), in: Capsule(style: .continuous))

                        Spacer(minLength: 8)

                        HStack(spacing: 6) {
                            Image(systemName: offer.productType == "MEMBERSHIP" ? "calendar" : (offer.productType == "COURSE" ? "play.rectangle" : "person.crop.circle"))
                                .font(.system(size: 13, weight: .bold))
                            Text(quantityLabel)
                                .font(.system(size: 13, weight: .black))
                                .lineLimit(1)
                        }
                        .foregroundColor(walletBlue)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(offer.name.isEmpty ? typeLabel.capitalized : offer.name)
                            .font(.system(size: 24, weight: .black))
                            .foregroundColor(walletInk)
                            .lineLimit(2)
                            .minimumScaleFactor(0.78)
                        Text(descriptionText)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(walletInk.opacity(0.70))
                            .lineLimit(2)
                    }

                    Rectangle()
                        .fill(walletLine.opacity(0.72))
                        .frame(height: 1)
                        .padding(.top, 2)

                    HStack(spacing: 8) {
                        Image(systemName: "calendar")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(walletMuted)
                        Text(expiryText)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(walletMuted)
                            .lineLimit(1)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 18)
            }
            .frame(minHeight: 154)

            HStack(alignment: .center, spacing: 14) {
                Text(priceLabel)
                    .font(.system(size: 27, weight: .black))
                    .foregroundColor(walletBlue)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)

                Spacer(minLength: 8)

                Button(action: onTap) {
                    HStack(spacing: 9) {
                        Text(walletTr(appUiLocaleStorage, "Buy now", "Kupi zdaj"))
                            .font(.system(size: 15, weight: .black))
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .black))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .frame(height: 50)
                    .background(walletBlueSoft, in: Capsule(style: .continuous))
                    .shadow(color: walletBlueSoft.opacity(0.25), radius: 10, y: 6)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 13)
            .background(Color.white)
        }
        .background(Color.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(walletLine.opacity(0.82), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.07), radius: 14, y: 7)
    }
}

private struct BuyPremiumVisualBackdrop: View {
    let accent: Color
    let index: Int

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = proxy.size.height
            ZStack(alignment: .trailing) {
                Circle()
                    .fill(accent.opacity(0.12))
                    .frame(width: width * 0.72, height: width * 0.72)
                    .offset(x: width * 0.28, y: -height * 0.28)
                RoundedRectangle(cornerRadius: 30, style: .continuous)
                    .fill(accent.opacity(0.11))
                    .frame(width: width * 0.46, height: height * 0.50)
                    .rotationEffect(.degrees(index % 2 == 0 ? -10 : 10))
                    .offset(x: width * 0.22, y: height * 0.22)
                VStack(spacing: 7) {
                    ForEach(0..<5, id: \.self) { line in
                        Capsule(style: .continuous)
                            .fill(accent.opacity(0.10 + Double(line) * 0.018))
                            .frame(width: width * (0.36 + CGFloat(line) * 0.025), height: 4)
                    }
                }
                .rotationEffect(.degrees(index % 2 == 0 ? -8 : 8))
                .offset(x: width * 0.08, y: height * 0.18)
                Image(systemName: visualIconName)
                    .font(.system(size: 76, weight: .regular))
                    .foregroundColor(accent.opacity(0.16))
                    .rotationEffect(.degrees(index % 2 == 0 ? -7 : 8))
                    .offset(x: width * 0.16, y: height * 0.06)
            }
            .frame(width: width, height: height)
        }
        .allowsHitTesting(false)
    }

    private var visualIconName: String {
        switch index % 3 {
        case 0: return "ticket"
        case 1: return "leaf"
        default: return "sparkles"
        }
    }
}

private struct BuyShowcaseMetaView: View {
    let iconName: String
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: iconName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(walletInk.opacity(0.84))
            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(walletInk.opacity(0.84))
                .lineLimit(1)
        }
    }
}

private struct BuyShowcaseFooterStrip: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    var body: some View {
        HStack(spacing: 0) {
            BuyShowcaseFooterItem(iconName: "shield", title: walletTr(appUiLocaleStorage, "Secure\ncheckout", "Varno\nplačilo"))
            footerDivider
            BuyShowcaseFooterItem(iconName: "arrow.triangle.2.circlepath", title: walletTr(appUiLocaleStorage, "Cancel\nanytime", "Preklic\nkadarkoli"))
            footerDivider
            BuyShowcaseFooterItem(iconName: "lock", title: walletTr(appUiLocaleStorage, "Safe & encrypted\npayments", "Varna in šifrirana\nplačila"))
            footerDivider
            BuyShowcaseFooterItem(iconName: "headphones", title: walletTr(appUiLocaleStorage, "Member\nsupport", "Podpora\nčlanom"))
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(walletLine.opacity(0.92), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.035), radius: 10, y: 5)
    }

    private var footerDivider: some View {
        Rectangle().fill(walletLine.opacity(0.9)).frame(width: 1, height: 34)
    }
}

private struct BuyShowcaseFooterItem: View {
    let iconName: String
    let title: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: iconName)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(walletBlueSoft)
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(walletInk.opacity(0.86))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct BuyMarketplaceHeroCard: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    let offer: WalletOfferModel
    let priceLabel: String
    let subtitle: String
    let onTap: () -> Void

    var body: some View {
        ZStack(alignment: .trailing) {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.02, green: 0.10, blue: 0.25), Color(red: 0.03, green: 0.20, blue: 0.48), Color(red: 0.02, green: 0.10, blue: 0.24)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Circle()
                .fill(Color(red: 0.04, green: 0.32, blue: 0.92).opacity(0.42))
                .frame(width: 180, height: 180)
                .offset(x: 54, y: 16)

            BuyHeroLineArt()
                .stroke(Color(red: 0.13, green: 0.53, blue: 0.94).opacity(0.40), lineWidth: 1.4)
                .frame(width: 190, height: 118)
                .offset(x: 12, y: 48)

            Image(systemName: "figure.mind.and.body")
                .font(.system(size: 96, weight: .light))
                .foregroundColor(.white.opacity(0.88))
                .shadow(color: .black.opacity(0.24), radius: 12, y: 7)
                .offset(x: -4, y: 20)

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 11, weight: .bold))
                    Text((offer.promoText?.isEmpty == false ? offer.promoText! : walletTr(appUiLocaleStorage, "Most popular", "Najbolj priljubljeno")).uppercased())
                        .font(.system(size: 11, weight: .heavy))
                        .lineLimit(1)
                }
                .foregroundColor(Color(red: 1.0, green: 0.66, blue: 0.38))
                .padding(.horizontal, 10)
                .frame(height: 28)
                .background(Color.white.opacity(0.14), in: Capsule(style: .continuous))

                Text(offer.name)
                    .font(.system(size: 30, weight: .heavy))
                    .tracking(-0.8)
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.78)
                    .padding(.top, 14)

                Text(subtitle)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white.opacity(0.78))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: 230, alignment: .leading)
                    .padding(.top, 8)

                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(offer.productType == "MEMBERSHIP" ? offerPriceLabel(offer, monthly: true) : priceLabel)
                        .font(.system(size: 30, weight: .heavy))
                        .tracking(-0.8)
                    if offer.productType == "MEMBERSHIP" && !offerPriceLabel(offer, monthly: true).contains("/mo") {
                        Text("/mo")
                            .font(.system(size: 15, weight: .bold))
                    }
                }
                .foregroundColor(.white)
                .padding(.top, 18)

                Button(action: onTap) {
                    Text(walletTr(appUiLocaleStorage, "Buy now", "Kupi zdaj"))
                        .font(.system(size: 16, weight: .heavy))
                        .foregroundColor(.white)
                        .frame(width: 118, height: 48)
                        .background(
                            LinearGradient(
                                colors: [Color(red: 1.0, green: 0.42, blue: 0.29), Color(red: 1.0, green: 0.56, blue: 0.36)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                        )
                        .shadow(color: Color(red: 1.0, green: 0.42, blue: 0.29).opacity(0.25), radius: 12, y: 7)
                }
                .buttonStyle(.plain)
                .padding(.top, 14)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 246)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: Color(red: 0.02, green: 0.10, blue: 0.25).opacity(0.20), radius: 18, y: 10)
    }
}

private struct BuyHeroLineArt: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let baseY = rect.maxY * 0.75
        for index in 0..<7 {
            let y = baseY + CGFloat(index * 6)
            path.move(to: CGPoint(x: rect.minX + CGFloat(index * 6), y: y))
            path.addCurve(
                to: CGPoint(x: rect.maxX, y: y - 58),
                control1: CGPoint(x: rect.midX * 0.65, y: y - 8),
                control2: CGPoint(x: rect.midX * 1.18, y: y - 70)
            )
        }
        return path
    }
}

private struct BuyMarketplaceOfferRow: View {
    let offer: WalletOfferModel
    let index: Int
    let priceLabel: String
    let eyebrow: String
    let subtitle: String
    let onTap: () -> Void

    private var accent: Color {
        switch offer.productType {
        case "PACK": return Color(red: 0.04, green: 0.32, blue: 0.92)
        case "MEMBERSHIP": return Color(red: 0.07, green: 0.30, blue: 0.62)
        case "CLASS_TICKET": return Color(red: 0.74, green: 0.45, blue: 0.10)
        default: return walletBlueSoft
        }
    }

    private var iconBackground: Color {
        switch offer.productType {
        case "PACK": return Color(red: 0.91, green: 0.95, blue: 1.0)
        case "MEMBERSHIP": return Color(red: 0.93, green: 0.97, blue: 1.0)
        case "CLASS_TICKET": return Color(red: 1.0, green: 0.95, blue: 0.86)
        default: return Color(red: 1.0, green: 0.94, blue: 0.90)
        }
    }

    var body: some View {
        HStack(spacing: 16) {
            BuyOfferIllustration(type: offer.productType, usageLimit: offer.usageLimit, accent: accent, background: iconBackground)
                .frame(width: 82, height: 82)

            VStack(alignment: .leading, spacing: 5) {
                Text(offer.name)
                    .font(.system(size: 20, weight: .heavy))
                    .tracking(-0.35)
                    .foregroundColor(walletInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                HStack(spacing: 5) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 11, weight: .bold))
                    Text(eyebrow)
                        .font(.system(size: 13, weight: .bold))
                        .lineLimit(1)
                }
                .foregroundColor(walletAmber)

                Text(subtitle)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(walletMuted)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .trailing, spacing: 12) {
                Text(priceLabel)
                    .font(.system(size: 24, weight: .heavy))
                    .tracking(-0.55)
                    .foregroundColor(walletInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)

                Button(action: onTap) {
                    Text("Buy now")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundColor(.white)
                        .frame(width: 104, height: 46)
                        .background(
                            LinearGradient(
                                colors: [Color(red: 0.04, green: 0.32, blue: 0.92), Color(red: 0.00, green: 0.42, blue: 0.96)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                        )
                        .shadow(color: walletBlueSoft.opacity(0.20), radius: 10, y: 5)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(walletLine.opacity(0.92), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.055), radius: 14, y: 7)
    }
}

private struct BuyOfferIllustration: View {
    let type: String
    let usageLimit: Int?
    let accent: Color
    let background: Color

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(background)
            switch type {
            case "PACK":
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(accent.opacity(0.38), lineWidth: 2)
                        .frame(width: 48, height: 34)
                        .rotationEffect(.degrees(8))
                        .offset(x: 5, y: -3)
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(accent, lineWidth: 2.3)
                        .frame(width: 48, height: 34)
                        .rotationEffect(.degrees(-8))
                    Text("\(usageLimit ?? 10)")
                        .font(.system(size: 22, weight: .heavy))
                        .foregroundColor(accent)
                        .rotationEffect(.degrees(-8))
                }
            case "MEMBERSHIP":
                Image(systemName: "dumbbell")
                    .font(.system(size: 33, weight: .bold))
                    .foregroundColor(accent)
            case "CLASS_TICKET":
                Image(systemName: "figure.mind.and.body")
                    .font(.system(size: 35, weight: .regular))
                    .foregroundColor(accent)
            case "COURSE":
                Image(systemName: "play.rectangle")
                    .font(.system(size: 35, weight: .semibold))
                    .foregroundColor(accent)
            default:
                Image(systemName: "gift")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundColor(accent)
            }
        }
    }
}

private struct BuyNoResultsCard: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(walletBlueSoft)
            Text(title)
                .font(.system(size: 18, weight: .heavy))
                .foregroundColor(walletInk)
            Text(subtitle)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(walletMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 34)
        .padding(.horizontal, 18)
        .background(Color.white.opacity(0.86), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(walletLine.opacity(0.95), lineWidth: 1)
        )
    }
}

// MARK: - Buy offer card

private struct BuyOfferCard: View {
    let offer: WalletOfferModel
    let index: Int
    let onTap: () -> Void

    var body: some View {
        Group {
            switch offer.productType {
            case "PACK":
                PackOfferCard(offer: offer, onTap: onTap)
            case "MEMBERSHIP":
                MembershipOfferCard(offer: offer, onTap: onTap)
            default:
                ClassTicketOfferCard(offer: offer, onTap: onTap)
            }
        }
    }
}

private struct ClassTicketOfferCard: View {
    let offer: WalletOfferModel
    let onTap: () -> Void

    private let border = Color(red: 0.91, green: 0.85, blue: 0.78)

    var body: some View {
        let shape = CompactTicketShape(cornerRadius: 20, notchRadius: 11)
        let isCourse = offer.productType.uppercased() == "COURSE"
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 9) {
                Text(isCourse ? "COURSE" : "CLASS TICKET")
                    .font(.caption.weight(.bold))
                    .tracking(1.2)
                    .foregroundColor(walletGold)
                Text(offer.name)
                    .font(.system(size: 28, weight: .bold, design: .serif))
                    .foregroundColor(walletInk)
                    .lineLimit(2)
                Text(offerStudioName(offer))
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(walletInk.opacity(0.82))
                    .lineLimit(1)
                Rectangle()
                    .fill(walletGold.opacity(0.45))
                    .frame(maxWidth: 320, maxHeight: 1)
                Text(isCourse ? (offer.description ?? "Video / audio course access") : classOfferDescription(offer))
                    .font(.subheadline)
                    .foregroundColor(walletMuted)
                    .lineLimit(3)
                HStack(spacing: 14) {
                    OfferMetricBlock(title: isCourse ? "Lifetime access" : ((offer.usageLimit ?? 1) <= 1 ? "Valid for 1 class" : "Valid for \(offer.usageLimit ?? 1) classes"), subtitle: isCourse ? "Course entitlement" : offerValidityLabel(offer.validityDays), accent: walletGold)
                    OfferMetricBlock(title: isCourse ? "Video / audio" : offerVisitCountLabel(offer.usageLimit), subtitle: isCourse ? "QR access card" : ((offer.usageLimit ?? 1) <= 1 ? "Single use" : "Multi-use"), accent: walletGold)
                }
                Button(action: onTap) {
                    Text("Buy now")
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .frame(height: 44)
                        .background(walletGold, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 20)
            .padding(.trailing, 16)
            .padding(.vertical, 18)
            .frame(maxWidth: .infinity, alignment: .leading)

            TicketVerticalDivider(color: walletGold.opacity(0.6))
                .padding(.vertical, 14)

            VStack(spacing: 10) {
                Circle()
                    .fill(walletGold.opacity(0.14))
                    .frame(width: 58, height: 58)
                    .overlay(
                        Text(walletInitials(offerStudioName(offer)))
                            .font(.headline.weight(.bold))
                            .foregroundColor(walletGold)
                    )
                Text("PRICE")
                    .font(.caption.weight(.semibold))
                    .tracking(1)
                    .foregroundColor(walletGold)
                Text("$\(String(format: "%.2f", offer.priceGross))")
                    .font(.system(size: 30, weight: .bold, design: .serif))
                    .foregroundColor(walletInk)
                BarcodeStub(code: offerDisplayCode(offer), color: walletInk)
                    .frame(height: 34)
                Text(offerDisplayCode(offer))
                    .font(.caption)
                    .foregroundColor(walletMuted)
                    .lineLimit(1)
            }
            .frame(width: 132)
            .padding(.horizontal, 14)
            .padding(.vertical, 18)
        }
        .background(shape.fill(walletCardCream))
        .clipShape(shape)
        .overlay(shape.stroke(border, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.08), radius: 6, y: 3)
    }
}

private struct PackOfferCard: View {
    let offer: WalletOfferModel
    let onTap: () -> Void

    private let border = Color(red: 0.84, green: 0.92, blue: 0.86)

    var body: some View {
        let shape = CompactTicketShape(cornerRadius: 20, notchRadius: 11)
        ZStack(alignment: .top) {
            ForEach(0..<2, id: \.self) { layer in
                shape
                    .fill(walletCardMint.opacity(layer == 0 ? 0.65 : 0.48))
                    .overlay(shape.stroke(border.opacity(0.7), lineWidth: 1))
                    .frame(height: 224)
                    .padding(.horizontal, CGFloat(10 + (layer * 8)))
                    .offset(y: CGFloat(12 + (layer * 8)))
            }

            ZStack(alignment: .topTrailing) {
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 9) {
                        Text("PACK")
                            .font(.caption.weight(.bold))
                            .tracking(1.2)
                            .foregroundColor(walletGreen)
                        Text(packOfferTitle(offer))
                            .font(.system(size: 26, weight: .bold, design: .serif))
                            .foregroundColor(Color(red: 0.08, green: 0.24, blue: 0.16))
                            .lineLimit(2)
                        Text(offerStudioName(offer))
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(Color(red: 0.15, green: 0.35, blue: 0.25))
                            .lineLimit(1)
                        Rectangle()
                            .fill(walletGreen.opacity(0.32))
                            .frame(maxWidth: 320, maxHeight: 1)
                        Text(packOfferDescription(offer))
                            .font(.subheadline)
                            .foregroundColor(walletMuted)
                            .lineLimit(3)
                        HStack(spacing: 14) {
                            OfferMetricBlock(title: offerValidityLabel(offer.validityDays), subtitle: "Flexible redemption", accent: walletGreen)
                            OfferMetricBlock(title: (offer.usageLimit ?? 1) > 1 ? "\(offer.usageLimit ?? 1) visits" : "Shareable", subtitle: (offer.usageLimit ?? 1) > 1 ? "Shareable pack" : "Multi-use", accent: walletGreen)
                        }
                    }
                    .padding(.leading, 20)
                    .padding(.trailing, 14)
                    .padding(.vertical, 18)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    TicketVerticalDivider(color: walletGreen.opacity(0.55))
                        .padding(.vertical, 14)

                    VStack(spacing: 10) {
                        Circle()
                            .fill(Color.white.opacity(0.58))
                            .frame(width: 88, height: 88)
                            .overlay(
                                VStack(spacing: 0) {
                                    Text("\(offer.usageLimit ?? 10)")
                                        .font(.system(size: 28, weight: .bold))
                                        .foregroundColor(Color(red: 0.10, green: 0.35, blue: 0.22))
                                    Text((offer.usageLimit ?? 10) == 1 ? "VISIT" : "VISITS")
                                        .font(.caption.weight(.semibold))
                                        .tracking(1)
                                        .foregroundColor(Color(red: 0.10, green: 0.35, blue: 0.22))
                                }
                            )
                        Text("$\(String(format: "%.2f", offer.priceGross))")
                            .font(.system(size: 28, weight: .bold, design: .serif))
                            .foregroundColor(Color(red: 0.06, green: 0.35, blue: 0.21))
                        Text((offer.promoText?.isEmpty == false ? offer.promoText! : "Flexible visits"))
                            .font(.caption)
                            .foregroundColor(walletMuted)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                        Button(action: onTap) {
                            Text("Buy now")
                                .font(.subheadline.weight(.bold))
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .frame(height: 44)
                                .background(walletGreen, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                    .frame(width: 138)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 18)
                }
                .background(shape.fill(walletCardMint))
                .clipShape(shape)
                .overlay(shape.stroke(border, lineWidth: 1))
                .shadow(color: Color.black.opacity(0.08), radius: 6, y: 3)

                if offer.promoText?.isEmpty == false || (offer.usageLimit ?? 0) > 1 {
                    Text(offer.promoText?.isEmpty == false ? offer.promoText! : "BEST VALUE")
                        .font(.caption.weight(.bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(walletGreen, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .padding(.top, 12)
                        .padding(.trailing, 14)
                }
            }
        }
        .padding(.bottom, 18)
    }
}

private struct MembershipOfferCard: View {
    let offer: WalletOfferModel
    let onTap: () -> Void

    private let border = Color(red: 0.88, green: 0.84, blue: 0.96)
    private let accent = Color(red: 0.48, green: 0.35, blue: 0.80)
    private let text = Color(red: 0.20, green: 0.14, blue: 0.36)

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("MEMBERSHIP")
                            .font(.caption.weight(.bold))
                            .tracking(1.2)
                            .foregroundColor(accent)
                        Text(offer.name)
                            .font(.system(size: 24, weight: .bold, design: .serif))
                            .foregroundColor(text)
                            .lineLimit(2)
                        Text("ALL ACCESS MEMBERSHIP")
                            .font(.caption.weight(.semibold))
                            .tracking(1.2)
                            .foregroundColor(walletGold)
                    }
                    Spacer()
                    Circle()
                        .fill(Color.white.opacity(0.75))
                        .frame(width: 52, height: 52)
                        .overlay(
                            Text(walletInitials(offerStudioName(offer)))
                                .font(.headline.weight(.bold))
                                .foregroundColor(walletGold)
                        )
                }

                HStack(alignment: .center, spacing: 16) {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 88, height: 88)
                        .overlay(
                            Text(walletInitials(offer.name))
                                .font(.system(size: 26, weight: .bold))
                                .tracking(1.2)
                                .foregroundColor(accent)
                        )
                    VStack(alignment: .leading, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Member")
                                .font(.caption)
                                .foregroundColor(accent)
                            Text("Guest Member")
                                .font(.title3.weight(.bold))
                                .foregroundColor(text)
                        }
                        Rectangle()
                            .fill(Color(red: 0.84, green: 0.80, blue: 0.93))
                            .frame(maxWidth: 220, maxHeight: 1)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Member ID")
                                .font(.caption)
                                .foregroundColor(accent)
                            Text(memberId(offer))
                                .font(.headline.weight(.semibold))
                                .foregroundColor(text)
                        }
                    }
                    Spacer(minLength: 0)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("BENEFITS")
                        .font(.caption.weight(.bold))
                        .tracking(1)
                        .foregroundColor(accent)
                    ForEach(membershipBenefits(offer), id: \.self) { benefit in
                        Text("✓ \(benefit)")
                            .font(.subheadline)
                            .foregroundColor(text)
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 16)

            Rectangle()
                .fill(border)
                .frame(height: 1)

            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Billed monthly")
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(text)
                    Text("Cancel anytime")
                        .font(.caption)
                        .foregroundColor(walletMuted)
                }
                Spacer()
                Text("$\(String(format: "%.2f", offer.priceGross))/month")
                    .font(.system(size: 28, weight: .bold, design: .serif))
                    .foregroundColor(Color(red: 0.35, green: 0.25, blue: 0.62))
                Button(action: onTap) {
                    Text("Join now")
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .frame(height: 44)
                        .background(accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
        }
        .background(walletCardLavender, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(border, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 6, y: 3)
    }
}

private struct OfferMetricBlock: View {
    let title: String
    let subtitle: String
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(walletInk)
                .lineLimit(2)
            Text(subtitle)
                .font(.caption.weight(.medium))
                .foregroundColor(accent)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct TicketVerticalDivider: View {
    let color: Color

    var body: some View {
        GeometryReader { proxy in
            Path { path in
                let x = proxy.size.width / 2
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: proxy.size.height))
            }
            .stroke(style: StrokeStyle(lineWidth: 1.2, dash: [5, 5]))
            .foregroundColor(color)
        }
        .frame(width: 1)
    }
}

private struct BarcodeStub: View {
    let code: String
    let color: Color

    var body: some View {
        Canvas { context, size in
            var x: CGFloat = 0
            for (index, scalar) in code.unicodeScalars.enumerated() {
                let width = CGFloat((Int(scalar.value) + index) % 3 + 1) * 1.6
                if index.isMultiple(of: 2) {
                    let rect = CGRect(x: x, y: 0, width: width, height: size.height)
                    context.fill(Path(rect), with: .color(color))
                }
                x += width + 1.4
                if x >= size.width { break }
            }
        }
    }
}

private func offerStudioName(_ offer: WalletOfferModel) -> String {
    (offer.sessionTypeName?.isEmpty == false ? offer.sessionTypeName! : "Studio access")
}

private func classOfferDescription(_ offer: WalletOfferModel) -> String {
    if let description = offer.description, !description.isEmpty { return description }
    return "A flexible single-class pass to book your next visit with ease."
}

private func packOfferTitle(_ offer: WalletOfferModel) -> String {
    let uses = offer.usageLimit ?? 0
    let trimmed = offer.name.trimmingCharacters(in: .whitespacesAndNewlines)
    if uses > 1, !trimmed.contains(String(uses)) { return "\(uses) Class Pack" }
    return trimmed.isEmpty ? (uses > 1 ? "\(uses) Class Pack" : "Class Pack") : trimmed
}

private func packOfferDescription(_ offer: WalletOfferModel) -> String {
    if let description = offer.description, !description.isEmpty { return description }
    return "Flexible visits to use on any eligible class. Shareable with friends or family."
}

private func offerValidityLabel(_ days: Int?) -> String {
    guard let days, days > 0 else { return "Flexible validity" }
    if days >= 120, days % 30 == 0 { return "Valid for \(days / 30) months" }
    if days >= 60 { return "Valid for \(days / 30) months" }
    if days == 30 { return "Valid for 30 days" }
    return "Valid for \(days) days"
}

private func offerVisitCountLabel(_ limit: Int?) -> String {
    guard let limit, limit > 1 else { return "1 visit" }
    return "\(limit) visits"
}

private func offerDisplayCode(_ offer: WalletOfferModel) -> String {
    let seed = (offer.productId.isEmpty ? offer.name : offer.productId)
        .uppercased()
        .filter { $0.isLetter || $0.isNumber }
    let chunks = stride(from: 0, to: min(seed.count, 12), by: 4).map { index -> String in
        let start = seed.index(seed.startIndex, offsetBy: index)
        let end = seed.index(start, offsetBy: min(4, seed.distance(from: start, to: seed.endIndex)), limitedBy: seed.endIndex) ?? seed.endIndex
        return String(seed[start..<end])
    }
    return chunks.isEmpty ? "TKT-0000" : chunks.joined(separator: "-")
}

private func memberId(_ offer: WalletOfferModel) -> String {
    let seed = (offer.productId.isEmpty ? offer.name : offer.productId)
        .uppercased()
        .filter { $0.isLetter || $0.isNumber }
    let suffix = String(seed.suffix(6)).leftPadding(toLength: 6, withPad: "0")
    return "MBR-\(suffix)"
}

private func membershipBenefits(_ offer: WalletOfferModel) -> [String] {
    if let description = offer.description, !description.isEmpty {
        let lines = description
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: " •-✓").union(.whitespacesAndNewlines)) }
            .filter { !$0.isEmpty }
        if !lines.isEmpty { return Array(lines.prefix(4)) }
    }
    return ["Unlimited classes", "Priority booking", "Guest passes each month", "10% off retail"]
}

private extension String {
    func leftPadding(toLength: Int, withPad character: Character) -> String {
        guard count < toLength else { return self }
        return String(repeating: String(character), count: toLength - count) + self
    }
}

// MARK: - Payment sheet

private struct BuyPaymentSheet: View {
    let offer: WalletOfferModel
    let languageCode: String
    let availableMethods: [String]
    let onCancel: () -> Void
    let onConfirm: (String) -> Void

    @State private var selected: String

    private let actionBlue = Color(red: 0.082, green: 0.408, blue: 0.957)
    private let ink = Color(red: 0.06, green: 0.10, blue: 0.18)
    private let muted = Color(red: 0.40, green: 0.44, blue: 0.52)
    private let line = Color(red: 0.88, green: 0.91, blue: 0.95)
    private let summaryBg = Color(red: 0.95, green: 0.975, blue: 1.0)

    init(offer: WalletOfferModel, languageCode: String, availableMethods: [String], onCancel: @escaping () -> Void, onConfirm: @escaping (String) -> Void) {
        self.offer = offer
        self.languageCode = languageCode
        self.availableMethods = availableMethods
        self.onCancel = onCancel
        self.onConfirm = onConfirm
        _selected = State(initialValue: availableMethods.first ?? "CARD")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Capsule(style: .continuous)
                .fill(actionBlue)
                .frame(width: 46, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.top, 2)
                .padding(.bottom, 4)

            Text(walletTr(languageCode, "Choose a payment method", "Izberite način plačila"))
                .font(.system(size: 19, weight: .regular))
                .foregroundColor(ink)
                .tracking(0.1)

            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(Color.white)
                    Image(systemName: "ticket.fill")
                        .font(.system(size: 21, weight: .semibold))
                        .foregroundColor(actionBlue)
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 3) {
                    Text(offer.name)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(ink)
                        .lineLimit(1)
                    Text(walletTr(languageCode, "Service", "Storitev"))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Rectangle()
                    .fill(line)
                    .frame(width: 1, height: 36)

                VStack(alignment: .trailing, spacing: 4) {
                    Text("\(String(format: "%.2f", offer.priceGross).replacingOccurrences(of: ".", with: ",")) \(offer.currency)")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(ink)
                        .lineLimit(1)
                    Text(walletTr(languageCode, "Amount", "Znesek"))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(muted)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .background(summaryBg, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            ForEach(availableMethods, id: \.self) { method in
                PaymentMethodRow(
                    method: method,
                    languageCode: languageCode,
                    selected: selected == method,
                    actionBlue: actionBlue,
                    ink: ink,
                    muted: muted,
                    line: line,
                    onSelect: { selected = method }
                )
            }

            Button {
                onConfirm(selected)
            } label: {
                Text(walletTr(languageCode, "Continue", "Nadaljuj"))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                    .background(
                        LinearGradient(colors: [actionBlue.opacity(0.96), actionBlue], startPoint: .leading, endPoint: .trailing),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
            }
            .buttonStyle(.plain)
            .padding(.top, 2)

            Button(action: onCancel) {
                Text(walletTr(languageCode, "Cancel", "Prekliči"))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(actionBlue)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 18)
        .background(Color.white)
    }
}

private struct PaymentMethodRow: View {
    let method: String
    let languageCode: String
    let selected: Bool
    let actionBlue: Color
    let ink: Color
    let muted: Color
    let line: Color
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 11) {
                ZStack {
                    Circle()
                        .stroke(selected ? actionBlue : muted, lineWidth: 2)
                        .frame(width: 20, height: 20)
                    if selected {
                        Circle()
                            .fill(actionBlue)
                            .frame(width: 10, height: 10)
                    }
                }
                .frame(width: 24, height: 24)

                ZStack {
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(Color.white)
                        .shadow(color: Color.black.opacity(selected ? 0.12 : 0.06), radius: selected ? 8 : 5, x: 0, y: selected ? 4 : 2)
                    Image(systemName: iconName)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(actionBlue)
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(ink)
                        .lineLimit(1)
                    Text(helper)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(muted)
                        .lineLimit(2)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(selected ? Color(red: 0.95, green: 0.975, blue: 1.0) : Color.white)
                    .shadow(color: Color.black.opacity(selected ? 0.08 : 0.04), radius: selected ? 8 : 5, x: 0, y: selected ? 4 : 2)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(selected ? actionBlue : line, lineWidth: selected ? 1.5 : 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var label: String { paymentMethodDisplayName(method, languageCode: languageCode) }
    private var helper: String { paymentMethodDescription(method, languageCode: languageCode) }

    private var iconName: String {
        switch method {
        case "BANK_TRANSFER": return "building.columns"
        case "PAYPAL": return "creditcard"
        default: return "creditcard"
        }
    }
}

// MARK: - Orders

/// Public invoice id `TENANTCODE-CLIENTID-counter` for bank transfers (see backend `InvoiceOrderIdService`).
private func walletBankTransferReference(for order: WalletOrderCardModel) -> String {
    if let s = order.invoiceOrderId?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty { return s }
    if let s = order.referenceCode?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty { return s }
    return "ORD-\(String(order.orderId.suffix(8)))"
}

private struct WalletPaymentInstructionsSheet: View {
    let order: WalletOrderCardModel
    let languageCode: String
    let onDismiss: () -> Void

    private var companyName: String {
        let n = order.paymentCompanyName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let n, !n.isEmpty { return n }
        let t = order.tenantName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { return t }
        return walletTr(languageCode, "Company name unavailable", "Ime podjetja ni na voljo")
    }

    private var companyAddress: String {
        let a = order.paymentCompanyAddress?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let a, !a.isEmpty { return a }
        return walletTr(languageCode, "Address unavailable", "Naslov ni na voljo")
    }

    private var iban: String {
        let i = order.paymentIban?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let i, !i.isEmpty { return i }
        return walletTr(languageCode, "IBAN unavailable", "IBAN ni na voljo")
    }

    private var bankReference: String { walletBankTransferReference(for: order) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(walletTr(languageCode, "Use these details to complete your bank transfer.", "Uporabite te podatke za bančno nakazilo."))
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(Color(red: 0.33, green: 0.38, blue: 0.49))

                    paymentInstructionField(label: walletTr(languageCode, "Company", "Podjetje"), value: companyName, copyValue: nil)
                    paymentInstructionField(label: walletTr(languageCode, "Address", "Naslov"), value: companyAddress, copyValue: nil)
                    paymentInstructionField(label: "IBAN", value: iban, copyValue: iban)
                    paymentInstructionField(label: walletTr(languageCode, "Reference", "Sklic"), value: bankReference, copyValue: bankReference)
                }
                .padding(20)
            }
            .background(Color(red: 0.98, green: 0.99, blue: 1.0))
            .navigationTitle(walletTr(languageCode, "Payment instructions", "Navodila za plačilo"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(walletTr(languageCode, "Close", "Zapri")) { onDismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private func paymentInstructionField(label: String, value: String, copyValue: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundColor(Color(red: 0.33, green: 0.38, blue: 0.49))
            HStack(alignment: .top, spacing: 10) {
                Text(value)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(red: 0.03, green: 0.11, blue: 0.30))
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let copyValue {
                    Button(walletTr(languageCode, "Copy", "Kopiraj")) {
                        UIPasteboard.general.string = copyValue
                    }
                    .font(.caption.weight(.bold))
                    .foregroundColor(Color(red: 0.0, green: 0.40, blue: 0.96))
                }
            }
        }
    }
}

private enum WalletOrderChipStatus {
    case paid
    case pending
    case refunded
    case cancelled
}

private struct WalletOrderStatusStyle {
    let label: String
    let foreground: Color
    let background: Color
    let iconName: String
    let receiptIconName: String
    let receiptBackground: Color
    let border: Color
}

private func walletOrderStatus(_ order: WalletOrderCardModel) -> WalletOrderChipStatus {
    let bill = order.billPaymentStatus?.uppercased()
    let status = order.status.uppercased()
    if status == "CANCELLED" || bill == "CANCELLED" { return .cancelled }
    if status == "REFUNDED" { return .refunded }
    if status == "PAID" && bill == "PAID" { return .paid }
    if order.paymentMethod.uppercased() == "BANK_TRANSFER" && bill == "PAYMENT_PENDING" { return .pending }
    if status == "PAID" { return .paid }
    return .pending
}

private func walletOrderStatusStyle(_ status: WalletOrderChipStatus, languageCode: String = "en") -> WalletOrderStatusStyle {
    switch status {
    case .paid:
        return WalletOrderStatusStyle(
            label: walletTr(languageCode, "Paid", "Plačano"),
            foreground: Color(red: 0.04, green: 0.62, blue: 0.38),
            background: Color(red: 0.87, green: 0.96, blue: 0.91),
            iconName: "checkmark.circle",
            receiptIconName: "doc.text",
            receiptBackground: Color(red: 0.92, green: 0.98, blue: 0.94),
            border: walletLine
        )
    case .pending:
        return WalletOrderStatusStyle(
            label: walletTr(languageCode, "Pending", "V čakanju"),
            foreground: Color(red: 0.73, green: 0.41, blue: 0.00),
            background: Color(red: 1.00, green: 0.95, blue: 0.87),
            iconName: "clock",
            receiptIconName: "doc.text",
            receiptBackground: Color(red: 1.00, green: 0.95, blue: 0.88),
            border: walletAmber.opacity(0.62)
        )
    case .refunded:
        return WalletOrderStatusStyle(
            label: walletTr(languageCode, "Refunded", "Vrnjeno"),
            foreground: Color(red: 0.36, green: 0.41, blue: 0.48),
            background: Color(red: 0.94, green: 0.95, blue: 0.96),
            iconName: "arrow.counterclockwise",
            receiptIconName: "arrow.counterclockwise",
            receiptBackground: Color(red: 0.94, green: 0.95, blue: 0.96),
            border: walletLine
        )
    case .cancelled:
        return WalletOrderStatusStyle(
            label: walletTr(languageCode, "Cancelled", "Preklicano"),
            foreground: Color(red: 0.54, green: 0.29, blue: 0.09),
            background: Color(red: 1.00, green: 0.94, blue: 0.88),
            iconName: "info.circle",
            receiptIconName: "info.circle",
            receiptBackground: Color(red: 1.00, green: 0.95, blue: 0.91),
            border: walletAmber.opacity(0.42)
        )
    }
}

private struct WalletOrderReceiptCard: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    let order: WalletOrderCardModel
    let isOpeningReceipt: Bool
    let onPaymentInstructions: () -> Void
    let onViewReceipt: () -> Void

    private var status: WalletOrderChipStatus { walletOrderStatus(order) }
    private var style: WalletOrderStatusStyle { walletOrderStatusStyle(status, languageCode: appUiLocaleStorage) }
    private var isPendingTransfer: Bool {
        status == .pending && order.paymentMethod.uppercased() == "BANK_TRANSFER"
    }
    private var reference: String {
        if let reference = order.referenceCode, !reference.isEmpty { return reference }
        return "ORD-\(order.orderId.suffix(8))"
    }

    private var displayOrderId: String {
        if let invoiceOrderId = order.invoiceOrderId, !invoiceOrderId.isEmpty { return invoiceOrderId }
        return reference
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(style.receiptBackground)
                    Image(systemName: style.receiptIconName)
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundColor(style.foreground)
                }
                .frame(width: 74, height: 74)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(order.productName ?? walletTr(appUiLocaleStorage, "Order", "Naročilo"))
                                .font(.system(size: 22, weight: .heavy))
                                .tracking(-0.35)
                                .foregroundColor(Color(red: 0.03, green: 0.11, blue: 0.30))
                                .lineLimit(1)
                            Text(order.tenantName)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(Color(red: 0.33, green: 0.38, blue: 0.49))
                                .lineLimit(1)
                            Text(displayOrderId)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(Color(red: 0.33, green: 0.38, blue: 0.49))
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        WalletOrderStatusBadge(style: style)
                    }
                }
            }

            Rectangle()
                .fill(walletLine.opacity(0.72))
                .frame(height: 1)

            VStack(spacing: 3) {
                WalletOrderDetailLine(label: walletTr(appUiLocaleStorage, "Total", "Skupaj"), value: String(format: "%.2f %@", order.totalGross, order.currency))
                WalletOrderDetailLine(label: walletTr(appUiLocaleStorage, "Ordered", "Naročeno"), value: order.createdAt.map(formatOrderDateShort) ?? "—")
                WalletOrderDetailLine(label: walletTr(appUiLocaleStorage, "Payment method", "Način plačila"), value: walletOrderPaymentLabel(order.paymentMethod, languageCode: appUiLocaleStorage))
                WalletOrderDetailLine(label: walletTr(appUiLocaleStorage, "Order ID", "ID naročila"), value: displayOrderId)
            }

            if status == .cancelled {
                WalletCancelledOrderCallout()
            } else if isPendingTransfer {
                WalletPendingTransferCallout(onOpenInstructions: onPaymentInstructions)
            } else {
                WalletViewReceiptButton(isLoading: isOpeningReceipt, onTap: onViewReceipt)
            }
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(style.border, lineWidth: 1))
        .shadow(color: Color.black.opacity(0.06), radius: 12, y: 6)
    }
}


private struct WalletCancelledOrderCallout: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "info.circle")
                .font(.system(size: 15, weight: .bold))
            Text(walletTr(appUiLocaleStorage, "Checkout was cancelled", "Plačilo je bilo preklicano"))
                .font(.system(size: 13, weight: .bold))
            Spacer(minLength: 0)
        }
        .foregroundColor(Color(red: 0.54, green: 0.29, blue: 0.09))
        .padding(11)
        .background(Color(red: 1.00, green: 0.95, blue: 0.88), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(walletAmber.opacity(0.18), lineWidth: 1))
    }
}

private struct WalletOrderStatusBadge: View {
    let style: WalletOrderStatusStyle

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: style.iconName)
                .font(.system(size: 15, weight: .bold))
            Text(style.label)
                .font(.system(size: 14, weight: .heavy))
        }
        .foregroundColor(style.foreground)
        .padding(.horizontal, 10)
        .frame(height: 38)
        .background(style.background, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct WalletOrderDetailLine: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(Color(red: 0.33, green: 0.38, blue: 0.49))
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(value)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Color(red: 0.03, green: 0.11, blue: 0.30))
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}

private struct WalletPendingTransferCallout: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    let onOpenInstructions: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "info.circle")
                .font(.system(size: 21, weight: .semibold))
                .foregroundColor(Color(red: 0.73, green: 0.41, blue: 0.00))
            VStack(alignment: .leading, spacing: 2) {
                Text(walletTr(appUiLocaleStorage, "Awaiting transfer", "Čaka na nakazilo"))
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundColor(Color(red: 0.73, green: 0.41, blue: 0.00))
                Text(walletTr(appUiLocaleStorage, "Please complete the bank transfer to process your order.", "Za obdelavo naročila dokončajte bančno nakazilo."))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(red: 0.03, green: 0.11, blue: 0.30))
                    .lineLimit(2)
            }
            Spacer(minLength: 6)
            Button(action: onOpenInstructions) {
                Text(walletTr(appUiLocaleStorage, "Payment instructions", "Navodila za plačilo"))
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .frame(height: 40)
                    .background(Color(red: 0.0, green: 0.40, blue: 0.96), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(Color(red: 1.00, green: 0.95, blue: 0.87).opacity(0.72), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color(red: 0.73, green: 0.41, blue: 0.00).opacity(0.20), lineWidth: 1))
    }
}

private struct WalletViewReceiptButton: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    let isLoading: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 9) {
                Image(systemName: "doc.text")
                    .font(.system(size: 20, weight: .semibold))
                Text(isLoading ? walletTr(appUiLocaleStorage, "Loading receipt…", "Nalaganje računa…") : walletTr(appUiLocaleStorage, "View receipt", "Prikaži račun"))
                    .font(.system(size: 16, weight: .heavy))
                Spacer()
                if isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(Color(red: 0.0, green: 0.40, blue: 0.96))
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 18, weight: .bold))
                }
            }
        }
        .buttonStyle(.plain)
        .foregroundColor(Color(red: 0.0, green: 0.40, blue: 0.96))
        .padding(.horizontal, 14)
        .frame(height: 48)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(walletLine, lineWidth: 1))
    }
}

private func orderBadgeLabel(_ order: WalletOrderCardModel) -> String {
    walletOrderStatusStyle(walletOrderStatus(order)).label
}

private func orderBadgeAccent(_ order: WalletOrderCardModel) -> Color {
    walletOrderStatusStyle(walletOrderStatus(order)).foreground
}

private func walletOrderPaymentLabel(_ raw: String, languageCode: String = "en") -> String {
    switch raw.uppercased() {
    case "BANK_TRANSFER": return walletTr(languageCode, "Bank transfer", "Bančno nakazilo")
    case "CARD": return walletTr(languageCode, "Card", "Kartica")
    case "PAYPAL": return "PayPal"
    case "OTHER": return walletTr(languageCode, "Other", "Drugo")
    case "ENTITLEMENT": return walletTr(languageCode, "Entitlement", "Vstopnica")
    default:
        return raw.replacingOccurrences(of: "_", with: " ").lowercased().capitalized
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

private let _orderDateShortFormatter: DateFormatter = {
    let df = DateFormatter()
    df.dateFormat = "dd MMM yyyy"
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

private func formatOrderDateShort(_ iso: String) -> String {
    guard let date = parseISO(iso) else { return iso.prefix(10).description }
    return _orderDateShortFormatter.string(from: date)
}

private func currencySymbol(_ currency: String) -> String {
    switch currency.uppercased() {
    case "EUR": return "€"
    case "USD": return "$"
    case "GBP": return "£"
    case "CHF": return "CHF "
    default: return "\(currency.uppercased()) "
    }
}

private func formatCompactPrice(_ amount: Double) -> String {
    let rounded = (amount * 100).rounded() / 100
    if rounded.truncatingRemainder(dividingBy: 1) == 0 {
        return String(format: "%.0f", rounded)
    }
    return String(format: "%.2f", rounded)
}

private func paymentMethodDisplayName(_ method: String, languageCode: String) -> String {
    switch method.uppercased() {
    case "CARD":          return walletTr(languageCode, "Credit / Debit card", "Kreditna / debetna kartica")
    case "BANK_TRANSFER": return walletTr(languageCode, "Bank transfer", "Bančno nakazilo")
    case "PAYPAL":        return "PayPal"
    default:              return method
    }
}

private func paymentMethodDescription(_ method: String, languageCode: String) -> String {
    switch method.uppercased() {
    case "CARD":          return walletTr(languageCode, "Pay securely with your card", "Plačajte varno s kartico")
    case "BANK_TRANSFER": return walletTr(languageCode, "Receive bank details and pay manually", "Prejmite bančne podatke in plačajte ročno")
    case "PAYPAL":        return walletTr(languageCode, "Pay with your PayPal account", "Plačajte s PayPal računom")
    default:              return ""
    }
}
