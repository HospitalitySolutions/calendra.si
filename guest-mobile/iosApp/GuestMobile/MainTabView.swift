import SwiftUI
import AVFoundation
import UIKit

struct MainTabView: View {
    enum Tab: String {
        case home, calendar, wallet, inbox, profile, book
    }

    private enum TenantPickerTarget {
        case calendar
        case wallet
        case inbox
    }

    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab: Tab = .home
    @State private var showAddOptions = false
    @State private var showManualCodeSheet = false
    @State private var showScannerSheet = false
    @State private var showWalletTenantPicker = false
    @State private var walletTenantDraftId: String?
    @State private var calendarScopedTenantId: String? = nil
    @State private var tenantPickerTarget: TenantPickerTarget = .wallet
    @State private var isNotificationsPresented = false
    @State private var headerAvatarImage: UIImage?
    @State private var rescheduleContext: BookRescheduleContext?
    @State private var bookLaunchRequest: BookLaunchRequest?
    @State private var bookReturnTab: Tab? = nil
    @State private var lastWalletOffersRefreshTenantId: String?
    @State private var lastWalletOffersRefreshAt: Date = .distantPast
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }
    private let brandBlue = Color(red: 0.07, green: 0.30, blue: 0.62)
    private let brandOrange = Color(red: 0.95, green: 0.59, blue: 0.23)
    private let walletOffersRefreshDebounceSeconds: TimeInterval = 1.5

    private var unreadNotifications: Int {
        store.guestAppNotificationUnreadCount
    }

    private var unreadInboxMessages: Int {
        store.inboxUnreadCount
    }

    private var inboxDialPhone: String? {
        let t = store.currentTenant.phone?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return t.isEmpty ? nil : t
    }

    private var canDialInboxTenant: Bool {
        guard let p = inboxDialPhone else { return false }
        return p.contains { $0.isNumber }
    }

    private var inboxSelectedTenant: TenantModel? {
        let selectedId = store.selectedTenantId ?? store.currentTenant.id
        return store.linkedTenants.first { $0.id == selectedId } ?? store.currentTenant
    }

    private var inboxDashboardTenantName: String? {
        guard let selectedId = inboxSelectedTenant?.id else { return nil }
        return store.tenantDashboards[selectedId]?.tenant.name
    }

    private var inboxPrimaryTenantName: String {
        let fallback = inboxSelectedTenant?.name ?? store.currentTenant.name
        let dashboardName = inboxDashboardTenantName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !dashboardName.isEmpty && dashboardName.caseInsensitiveCompare(fallback) != .orderedSame {
            return dashboardName
        }
        return fallback
    }

    private var inboxTenantSubtitle: String? {
        let fallback = inboxSelectedTenant?.name ?? store.currentTenant.name
        if inboxPrimaryTenantName.caseInsensitiveCompare(fallback) != .orderedSame {
            return fallback
        }
        let city = inboxSelectedTenant?.city?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !city.isEmpty && city.caseInsensitiveCompare(inboxPrimaryTenantName) != .orderedSame { return city }
        return nil
    }

    private var topBarSelectedTenant: TenantModel? {
        if selectedTab == .calendar {
            guard let tenantId = calendarScopedTenantId else { return nil }
            return store.linkedTenants.first { $0.id == tenantId }
        }
        if selectedTab == .wallet {
            if let tenantId = store.walletScopedTenantId {
                return store.linkedTenants.first { $0.id == tenantId } ?? store.linkedTenants.first
            }
            return store.linkedTenants.first
        }
        return inboxSelectedTenant
    }

    private var topBarSelectedTenantId: String? {
        if selectedTab == .calendar {
            return calendarScopedTenantId
        }
        if selectedTab == .wallet {
            return store.walletScopedTenantId
        }
        return store.selectedTenantId ?? store.currentTenant.id
    }

    private var topBarPrimaryTenantName: String {
        if selectedTab == .calendar, calendarScopedTenantId == nil {
            return isSl ? "Vsi ponudniki" : "All providers"
        }
        let fallback = topBarSelectedTenant?.name ?? store.currentTenant.name
        guard let tenantId = topBarSelectedTenant?.id else { return fallback }
        let dashboardName = store.tenantDashboards[tenantId]?.tenant.name.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !dashboardName.isEmpty && dashboardName.caseInsensitiveCompare(fallback) != .orderedSame {
            return dashboardName
        }
        return fallback
    }

    private var topBarTenantSubtitle: String? {
        if selectedTab == .calendar, calendarScopedTenantId == nil { return nil }
        let fallback = topBarSelectedTenant?.name ?? store.currentTenant.name
        if topBarPrimaryTenantName.caseInsensitiveCompare(fallback) != .orderedSame {
            return fallback
        }
        let city = topBarSelectedTenant?.city?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !city.isEmpty && city.caseInsensitiveCompare(topBarPrimaryTenantName) != .orderedSame { return city }
        return nil
    }

    private var headerAvatarTrigger: String {
        "\(store.user.id)-\(store.user.profilePicturePath ?? "")"
    }

    private var headerAvatarInitials: String {
        let first = store.user.firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let last = store.user.lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        let combined = [first.first, last.first].compactMap { $0 }.map { String($0).uppercased() }.joined()
        if !combined.isEmpty { return combined }
        if let fallback = first.first ?? store.user.email.first {
            return String(fallback).uppercased()
        }
        return "•"
    }

    private func loadHeaderAvatarIfNeeded() async {
        guard store.user.profilePicturePath?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false else {
            await MainActor.run { headerAvatarImage = nil }
            return
        }
        do {
            let data = try await store.downloadProfilePicture()
            let image = UIImage(data: data)
            await MainActor.run { headerAvatarImage = image }
        } catch {
            await MainActor.run { headerAvatarImage = nil }
        }
    }

    private func dialInboxTenant() {
        guard let raw = inboxDialPhone, canDialInboxTenant else { return }
        let cleaned = String(raw.unicodeScalars.filter { CharacterSet(charactersIn: "+0123456789").contains($0) })
        guard !cleaned.isEmpty, let url = URL(string: "tel:\(cleaned)") else { return }
        UIApplication.shared.open(url)
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            LinearGradient(
                colors: [Color(red: 0.95, green: 0.98, blue: 1.00), Color(red: 1.00, green: 0.95, blue: 0.88)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea(.container, edges: [.top, .bottom, .horizontal])

            VStack(spacing: 0) {
                if selectedTab != .book {
                    topUtilityBar
                }

                Group {
                    switch selectedTab {
                    case .home:
                        HomeView(
                            onChooseTenant: { showAddOptions = true },
                            onOpenNotifications: { isNotificationsPresented = true },
                            onBookNow: { selectedTab = .book },
                            onReschedule: { booking in
                                rescheduleContext = BookRescheduleContext(
                                    bookingId: booking.bookingId,
                                    companyId: booking.companyId,
                                    sessionTypeId: booking.sessionTypeId,
                                    sessionTypeName: booking.title
                                )
                            },
                            onCancelBooking: { booking in
                                Task {
                                    do {
                                        _ = try await store.cancelBooking(companyId: booking.companyId, bookingId: booking.bookingId)
                                        store.noticeMessage = "Booking cancelled."
                                    } catch {
                                        store.errorMessage = error.localizedDescription
                                    }
                                }
                            }
                        )
                    case .calendar:
                        CalendarView(
                            selectedTenantId: calendarScopedTenantId,
                            onOpenBooking: { booking in
                                rescheduleContext = BookRescheduleContext(
                                    bookingId: booking.bookingId.isEmpty ? booking.id : booking.bookingId,
                                    companyId: booking.companyId,
                                    sessionTypeId: booking.sessionTypeId,
                                    sessionTypeName: booking.title
                                )
                            },
                            onCancelBooking: { booking in
                                Task {
                                    do {
                                        let bookingId = booking.bookingId.isEmpty ? booking.id : booking.bookingId
                                        _ = try await store.cancelBooking(companyId: booking.companyId, bookingId: bookingId)
                                        store.noticeMessage = "Booking cancelled."
                                    } catch {
                                        store.errorMessage = error.localizedDescription
                                    }
                                }
                            }
                        )
                    case .book:
                        BookView(
                            onOpenNotifications: { isNotificationsPresented = true },
                            rescheduleContext: rescheduleContext,
                            launchRequest: bookLaunchRequest,
                            onLaunchRequestConsumed: { bookLaunchRequest = nil },
                            onRescheduleCompleted: {
                                rescheduleContext = nil
                                bookLaunchRequest = nil
                                bookReturnTab = nil
                                selectedTab = .home
                            },
                            onBookingCompleted: {
                                bookLaunchRequest = nil
                                bookReturnTab = nil
                                selectedTab = .home
                            },
                            onExit: {
                                let returnTab = bookReturnTab ?? .home
                                bookLaunchRequest = nil
                                bookReturnTab = nil
                                rescheduleContext = nil
                                selectedTab = returnTab
                            }
                        )
                    case .wallet:
                        WalletView(
                            onOpenNotifications: { isNotificationsPresented = true },
                            onOpenTenantPicker: { openWalletWithTenantSelection() },
                            onOpenBuyTab: { refreshWalletOffersIfNeeded() },
                            onBookWithEntitlement: { entitlement in
                                openBookWithEntitlement(entitlement)
                            }
                        )
                    case .inbox:
                        InboxView()
                    case .profile:
                        ProfileView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                bottomBar
            }
        }
        .task {
            if store.tenantDashboards.isEmpty, !store.linkedTenants.isEmpty {
                await store.refreshAllTenants()
            }
        }
        .task(id: headerAvatarTrigger) {
            await loadHeaderAvatarIfNeeded()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                Task { await store.refreshOnAppBecameActive() }
            }
        }
        .onChange(of: selectedTab) { nextTab in
            if nextTab == .wallet {
                refreshWalletOffersIfNeeded()
            }
        }
        .onChange(of: store.walletScopedTenantId) { tenantId in
            if selectedTab == .wallet {
                refreshWalletOffersIfNeeded(for: tenantId)
            }
        }
        .onChange(of: store.pendingInboxOpenCompanyId) { companyId in
            guard companyId != nil else { return }
            selectedTab = .inbox
            store.consumePendingInboxOpen()
        }
        .confirmationDialog(isSl ? "Dodaj ponudnika" : "Add tenancy", isPresented: $showAddOptions, titleVisibility: .visible) {
            Button(isSl ? "Ročno dodaj kodo" : "Add code manually") { showManualCodeSheet = true }
            Button(isSl ? "QR skeniranje" : "QR scan") { showScannerSheet = true }
            Button(isSl ? "Prekliči" : "Cancel", role: .cancel) { }
        }
        .sheet(isPresented: $showManualCodeSheet) {
            TenantCodeEntrySheet {
                showManualCodeSheet = false
            }
            .environmentObject(store)
        }
        .sheet(isPresented: $showScannerSheet) {
            TenantQRScannerSheet { raw in
                let code = extractTenantCode(from: raw)
                Task { await store.joinTenant(code: code) }
            }
        }
        .sheet(isPresented: $showWalletTenantPicker) {
            TenantSelectionBottomSheet(
                tenants: store.linkedTenants,
                selectedTenantId: {
                    switch tenantPickerTarget {
                    case .calendar:
                        return walletTenantDraftId ?? calendarScopedTenantId
                    case .wallet:
                        return walletTenantDraftId ?? store.walletScopedTenantId ?? store.linkedTenants.first?.id
                    case .inbox:
                        return walletTenantDraftId ?? store.selectedTenantId ?? store.linkedTenants.first?.id
                    }
                }(),
                allowsAllTenants: tenantPickerTarget == .calendar,
                languageCode: appUiLocaleStorage,
                onSelect: { tenantId in
                    walletTenantDraftId = tenantId
                    showWalletTenantPicker = false
                    switch tenantPickerTarget {
                    case .calendar:
                        selectedTab = .calendar
                        calendarScopedTenantId = tenantId
                    case .wallet:
                        selectedTab = .wallet
                        store.setWalletTenantFilter(tenantId)
                        refreshWalletOffersIfNeeded(for: tenantId)
                    case .inbox:
                        selectedTab = .inbox
                        store.setTenantFilter(tenantId)
                    }
                },
                onAddTenant: {
                    showWalletTenantPicker = false
                    showManualCodeSheet = true
                }
            )
            .presentationDetents([.height(468), .large])
            .presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $isNotificationsPresented) {
            NotificationsView()
                .environmentObject(store)
        }
        .fullScreenCover(item: $rescheduleContext) { context in
            RescheduleView(
                context: context,
                onClose: { rescheduleContext = nil },
                onOpenNotifications: { isNotificationsPresented = true }
            )
            .environmentObject(store)
        }
    }

    private func openWalletWithTenantSelection() {
        if store.linkedTenants.count <= 1 {
            store.setWalletTenantFilter(store.linkedTenants.first?.id)
            selectedTab = .wallet
            return
        }
        selectedTab = .wallet
        openTenantSelection(.wallet)
    }

    private func openTenantSelection(_ target: TenantPickerTarget) {
        guard !store.linkedTenants.isEmpty else { return }
        tenantPickerTarget = target
        switch target {
        case .calendar:
            walletTenantDraftId = calendarScopedTenantId
        case .wallet:
            walletTenantDraftId = store.walletScopedTenantId ?? store.linkedTenants.first?.id
        case .inbox:
            walletTenantDraftId = store.selectedTenantId ?? store.currentTenant.id
        }
        showWalletTenantPicker = true
    }

    private func refreshBookTenantIfNeeded() {
        let selected = store.selectedTenantId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallback = store.linkedTenants.first?.id.trimmingCharacters(in: .whitespacesAndNewlines)
        let companyId = (selected?.isEmpty == false ? selected : fallback)
        guard let companyId, companyId.isEmpty == false else { return }
        Task { try? await store.refreshTenant(companyId: companyId) }
    }

    private func refreshWalletOffersIfNeeded(for tenantId: String? = nil) {
        let resolvedTenantId = (tenantId ?? store.walletScopedTenantId)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let resolvedTenantId, !resolvedTenantId.isEmpty else { return }
        let now = Date()
        if lastWalletOffersRefreshTenantId == resolvedTenantId &&
            now.timeIntervalSince(lastWalletOffersRefreshAt) < walletOffersRefreshDebounceSeconds {
            return
        }
        lastWalletOffersRefreshTenantId = resolvedTenantId
        lastWalletOffersRefreshAt = now
        Task {
            try? await store.refreshTenant(companyId: resolvedTenantId)
        }
    }

    @ViewBuilder
    private var topTenantPicker: some View {
        if !store.linkedTenants.isEmpty, selectedTab != .profile {
            Button {
                openTenantSelection(selectedTab == .wallet ? .wallet : .inbox)
            } label: {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(Color(red: 0.07, green: 0.39, blue: 0.95))
                            .shadow(color: Color(red: 0.07, green: 0.39, blue: 0.95).opacity(0.28), radius: 6, y: 3)
                        Image(systemName: "building.2.fill")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)
                    }
                    .frame(width: 38, height: 38)

                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 5) {
                            Text(topBarPrimaryTenantName)
                                .font(.system(size: 17, weight: .bold))
                                .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                                .lineLimit(1)
                                .truncationMode(.tail)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                        }
                        if let topBarTenantSubtitle {
                            Text(topBarTenantSubtitle)
                                .font(.system(size: 14, weight: .regular))
                                .foregroundColor(Color(red: 0.36, green: 0.45, blue: 0.56))
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                    }
                    .frame(maxWidth: 210, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var topUtilityBar: some View {
        let isProfile = selectedTab == .profile
        let isHome = selectedTab == .home
        let usesHomeHeader = isProfile || isHome || selectedTab == .calendar || selectedTab == .wallet || selectedTab == .inbox
        return HStack(spacing: 0) {
            if usesHomeHeader {
                Image("CalendraBookLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 128, maxHeight: 34, alignment: .leading)
                    .layoutPriority(0)
            } else {
                topTenantPicker
            }
            Spacer(minLength: 0)
            HStack(spacing: 5) {
                if isHome {
                    Button {
                        showManualCodeSheet = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "person.badge.plus")
                                .font(.system(size: 14, weight: .medium))
                            Text(isSl ? "Dodaj ponudnika" : "Add tenant")
                                .font(.system(size: 10, weight: .semibold))
                                .lineLimit(1)
                        }
                        .foregroundColor(brandBlue)
                        .padding(.horizontal, 9)
                        .frame(height: 32)
                        .overlay(
                            RoundedRectangle(cornerRadius: 17, style: .continuous)
                                .stroke(brandBlue, lineWidth: 1.2)
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                } else if selectedTab == .calendar || selectedTab == .wallet || selectedTab == .inbox {
                    Button {
                        openTenantSelection(selectedTab == .calendar ? .calendar : (selectedTab == .wallet ? .wallet : .inbox))
                    } label: {
                        HStack(spacing: 7) {
                            Image(systemName: "person")
                                .font(.system(size: 14, weight: .medium))
                            Text(topBarPrimaryTenantName)
                                .font(.system(size: 10, weight: .semibold))
                                .lineLimit(1)
                                .truncationMode(.tail)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 10, weight: .bold))
                        }
                        .foregroundColor(brandBlue)
                        .padding(.horizontal, 9)
                        .frame(maxWidth: 124, minHeight: 32, maxHeight: 32)
                        .overlay(
                            RoundedRectangle(cornerRadius: 17, style: .continuous)
                                .stroke(brandBlue, lineWidth: 1.2)
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    isNotificationsPresented = true
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(Color.primary)
                            .frame(width: 34, height: 34)
                            .contentShape(Rectangle())
                        if unreadNotifications > 0 {
                            Text("\(min(unreadNotifications, 99))")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Capsule(style: .continuous).fill(brandOrange))
                                .offset(x: 4, y: -2)
                        }
                    }
                }
                .buttonStyle(.plain)
                .frame(width: 36, height: 36)
                .layoutPriority(2)

                Button {
                    selectedTab = .profile
                } label: {
                    ZStack {
                        Circle()
                            .fill(Color.white)
                            .frame(width: 34, height: 34)
                            .shadow(color: Color.black.opacity(0.08), radius: 5, x: 0, y: 2)
                        if let headerAvatarImage {
                            Image(uiImage: headerAvatarImage)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 34, height: 34)
                                .clipShape(Circle())
                        } else {
                            Circle()
                                .fill(Color(red: 0.91, green: 0.96, blue: 1.0))
                                .frame(width: 34, height: 34)
                            Text(headerAvatarInitials)
                                .font(.system(size: headerAvatarInitials.count > 1 ? 12 : 14, weight: .bold))
                                .foregroundColor(brandBlue)
                        }
                    }
                    .overlay(
                        Circle()
                            .stroke(selectedTab == .profile ? brandBlue : Color.white.opacity(0.9), lineWidth: 1.2)
                    )
                    .contentShape(Circle())
                    .frame(width: 38, height: 38)
                }
                .buttonStyle(.plain)
                .frame(width: 40, height: 40)
                .layoutPriority(3)
                .accessibilityLabel(isSl ? "Profil" : "Profile")
            }
            .fixedSize(horizontal: true, vertical: false)
            .layoutPriority(2)
        }
        .padding(.leading, 16)
        .padding(.trailing, 16)
        .frame(height: 56)
        .background((selectedTab == .inbox || selectedTab == .profile || selectedTab == .home || selectedTab == .calendar || selectedTab == .wallet) ? Color.clear : Color(.systemBackground))
    }

    private var bottomBar: some View {
        VStack(spacing: 0) {
            Divider().opacity(0.25)
            HStack(alignment: .center, spacing: 4) {
                navItem(.home, icon: "house", selectedIcon: "house.fill", title: isSl ? "Domov" : "Home")
                navItem(.wallet, icon: "wallet.pass", selectedIcon: "wallet.pass.fill", title: isSl ? "Denarnica" : "Wallet")
                bookTabItem
                navItem(.inbox, icon: "ellipsis.message", selectedIcon: "ellipsis.message.fill", title: isSl ? "Prejeto" : "Inbox")
                navItem(.calendar, icon: "calendar", selectedIcon: "calendar", title: isSl ? "Koledar" : "Calendar")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .frame(maxWidth: .infinity)
        .background(Color(.systemBackground))
    }

    private var bookTabItem: some View {
        Button {
            // Explicit "Book" entry must always start fresh flow.
            rescheduleContext = nil
            bookLaunchRequest = nil
            bookReturnTab = nil
            refreshBookTenantIfNeeded()
            selectedTab = .book
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(Color(red: 0.114, green: 0.400, blue: 0.957))
                        .frame(width: 46, height: 46)
                        .shadow(color: Color(red: 0.114, green: 0.400, blue: 0.957).opacity(0.22), radius: 12, x: 0, y: 6)
                    Image(systemName: "plus")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.white)
                }
                Text(isSl ? "Rezerviraj" : "Book")
                    .font(.system(size: 10, weight: selectedTab == .book ? .semibold : .medium))
                    .foregroundColor(selectedTab == .book ? Color(red: 0.114, green: 0.400, blue: 0.957) : Color(red: 0.369, green: 0.435, blue: 0.522))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isSl ? "Rezerviraj" : "Book")
    }

    private func openBookWithEntitlement(_ entitlement: AccessCardModel) {
        rescheduleContext = nil
        bookReturnTab = .wallet
        store.setTenantFilter(entitlement.companyId)
        store.setWalletTenantFilter(entitlement.companyId)
        bookLaunchRequest = BookLaunchRequest(
            companyId: entitlement.companyId,
            sessionTypeId: entitlement.sessionTypeId,
            entitlementName: entitlement.name,
            entitlementId: entitlement.entitlementId,
            preferredPaymentMethod: .entitlement
        )
        selectedTab = .book
    }

    private func navItem(_ tab: Tab, icon: String, selectedIcon: String, title: String) -> some View {
        Button {
            bookLaunchRequest = nil
            bookReturnTab = nil
            if tab == .wallet {
                rescheduleContext = nil
                selectedTab = .wallet
                refreshWalletOffersIfNeeded()
            } else {
                selectedTab = tab
            }
        } label: {
            VStack(spacing: 4) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: selectedTab == tab ? selectedIcon : icon)
                        .font(.system(size: 20, weight: .semibold))
                    if tab == .inbox, unreadInboxMessages > 0 {
                        Text("\(min(unreadInboxMessages, 99))")
                            .font(.caption2.weight(.bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Capsule(style: .continuous).fill(brandBlue))
                            .offset(x: 9, y: -6)
                    }
                }
                Text(title)
                    .font(.system(size: 10, weight: selectedTab == tab ? .semibold : .medium))
            }
            .foregroundColor(selectedTab == tab ? Color(red: 0.114, green: 0.400, blue: 0.957) : Color(red: 0.369, green: 0.435, blue: 0.522))
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

private struct TenantSelectionBottomSheet: View {
    let tenants: [TenantModel]
    let selectedTenantId: String?
    let allowsAllTenants: Bool
    let languageCode: String
    let onSelect: (String?) -> Void
    let onAddTenant: () -> Void

    @State private var searchText = ""

    private var isSl: Bool { languageCode.lowercased().hasPrefix("sl") }
    private var brandBlue: Color { Color(red: 0.082, green: 0.408, blue: 0.957) }
    private var brandBlueSoft: Color { brandBlue }
    private var brandOrange: Color { Color(red: 0.95, green: 0.59, blue: 0.23) }
    private var ink: Color { Color(red: 0.06, green: 0.10, blue: 0.18) }
    private var muted: Color { Color(red: 0.40, green: 0.44, blue: 0.52) }
    private var line: Color { Color(red: 0.84, green: 0.87, blue: 0.92) }

    private var filteredTenants: [TenantModel] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return tenants }
        return tenants.filter { tenant in
            tenant.name.localizedCaseInsensitiveContains(query) ||
            (tenant.city ?? "").localizedCaseInsensitiveContains(query) ||
            (tenant.companyAddress ?? "").localizedCaseInsensitiveContains(query)
        }
    }

    private var confirmSelectionTenantId: String? {
        selectedTenantId ?? filteredTenants.first?.id
    }

    private var canConfirmSelection: Bool {
        allowsAllTenants || confirmSelectionTenantId != nil
    }

    private func confirmSelection() {
        if allowsAllTenants && selectedTenantId == nil {
            onSelect(nil)
        } else if let tenantId = confirmSelectionTenantId {
            onSelect(tenantId)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule(style: .continuous)
                .fill(brandBlue.opacity(0.28))
                .frame(width: 48, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
                .padding(.bottom, 16)

            Text(isSl ? "Izberi ponudnika" : "Select tenant")
                .font(.system(size: 23, weight: .bold))
                .foregroundColor(ink)
                .padding(.horizontal, 20)

            Text(allowsAllTenants ? (isSl ? "Izberite enega ponudnika ali prikažite termine vseh ponudnikov." : "Choose one provider or show sessions from all providers.") : (isSl ? "Izberite ponudnika za upravljanje rezervacij in plačil." : "Choose a tenant for bookings and payments."))
                .font(.system(size: 13, weight: .regular))
                .foregroundColor(muted)
                .padding(.horizontal, 20)
                .padding(.top, 6)
                .padding(.bottom, 16)

            HStack(spacing: 10) {
                HStack(spacing: 9) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(brandBlue)
                    TextField("", text: $searchText, prompt: Text(isSl ? "Išči ponudnika ..." : "Search tenant ...").foregroundColor(muted))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(ink)
                        .tint(brandBlue)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                .padding(.horizontal, 13)
                .frame(height: 44)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.white)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(line, lineWidth: 1)
                        )
                )

                Button {} label: {
                    Image(systemName: "slider.horizontal.3")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(brandBlue)
                        .frame(width: 38, height: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color.white)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(line, lineWidth: 1)
                                )
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)

            ScrollView(showsIndicators: filteredTenants.count > 4) {
                VStack(spacing: 10) {
                    if allowsAllTenants {
                        TenantSelectionAllBottomSheetRow(
                            isSelected: selectedTenantId == nil,
                            isSl: isSl,
                            brandBlue: brandBlue,
                            brandBlueSoft: brandBlueSoft,
                            brandOrange: brandOrange,
                            muted: muted,
                            line: line,
                            onTap: { onSelect(nil) }
                        )
                    }
                    ForEach(Array(filteredTenants.enumerated()), id: \.element.id) { index, tenant in
                        TenantSelectionBottomSheetRow(
                            tenant: tenant,
                            isSelected: tenant.id == selectedTenantId,
                            index: index,
                            brandBlue: brandBlue,
                            brandBlueSoft: brandBlueSoft,
                            brandOrange: brandOrange,
                            ink: ink,
                            muted: muted,
                            line: line,
                            onTap: { onSelect(tenant.id) }
                        )
                    }
                    if filteredTenants.isEmpty {
                        Text(isSl ? "Ni najdenih ponudnikov." : "No tenants found.")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(brandBlue.opacity(0.68))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 24)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 2)
            }
            .frame(maxHeight: 292)

            Button(action: confirmSelection) {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .semibold))
                    Text(isSl ? "Izberi ponudnika" : "Select tenant")
                        .font(.system(size: 16, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 58)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [brandBlue.opacity(0.96), brandBlue],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .shadow(color: brandBlue.opacity(0.22), radius: 14, x: 0, y: 6)
                )
                .opacity(canConfirmSelection ? 1 : 0.48)
            }
            .disabled(!canConfirmSelection)
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 24)
        }
        .background(Color.white)
    }
}

private struct TenantSelectionAllBottomSheetRow: View {
    let isSelected: Bool
    let isSl: Bool
    let brandBlue: Color
    let brandBlueSoft: Color
    let brandOrange: Color
    let muted: Color
    let line: Color
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(brandBlue.opacity(0.13))
                    Image(systemName: "square.grid.2x2.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(brandBlue)
                }
                .frame(width: 42, height: 42)

                VStack(alignment: .leading, spacing: 3) {
                    Text(isSl ? "Vsi ponudniki" : "All providers")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(Color(red: 0.06, green: 0.10, blue: 0.18))
                        .lineLimit(1)
                    Text(isSl ? "Prikaži termine vseh povezanih ponudnikov" : "Show sessions from every linked provider")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(muted)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(brandBlue))
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(brandBlue.opacity(0.62))
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 58)
            .background(
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .fill(isSelected ? Color(red: 0.96, green: 0.985, blue: 1.0) : Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                            .stroke(isSelected ? brandBlueSoft : line, lineWidth: isSelected ? 1.6 : 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

private struct TenantSelectionBottomSheetRow: View {
    let tenant: TenantModel
    let isSelected: Bool
    let index: Int
    let brandBlue: Color
    let brandBlueSoft: Color
    let brandOrange: Color
    let ink: Color
    let muted: Color
    let line: Color
    let onTap: () -> Void

    private var subtitle: String {
        let city = tenant.city?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !city.isEmpty { return city }
        let address = tenant.companyAddress?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !address.isEmpty { return address }
        return "Slovenija"
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(iconBackground)
                    Image(systemName: iconName)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(iconForeground)
                }
                .frame(width: 42, height: 42)

                VStack(alignment: .leading, spacing: 3) {
                    Text(tenant.name)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(brandBlue)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(muted)
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(brandBlue))
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(brandBlue.opacity(0.62))
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 58)
            .background(
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .fill(isSelected ? Color(red: 0.96, green: 0.985, blue: 1.0) : Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: 15, style: .continuous)
                            .stroke(isSelected ? brandBlueSoft : line, lineWidth: isSelected ? 1.6 : 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private var iconName: String {
        switch index % 4 {
        case 1: return "mountain.2.fill"
        case 2: return "leaf.fill"
        case 3: return "water.waves"
        default: return "calendar.badge.clock"
        }
    }

    private var iconBackground: Color {
        switch index % 4 {
        case 1: return brandBlue.opacity(0.13)
        case 2: return Color(red: 1.0, green: 0.94, blue: 0.82)
        case 3: return Color(red: 0.05, green: 0.13, blue: 0.28)
        default: return brandOrange.opacity(0.14)
        }
    }

    private var iconForeground: Color {
        switch index % 4 {
        case 1: return brandBlue
        case 2: return Color(red: 0.47, green: 0.36, blue: 0.16)
        case 3: return .white
        default: return brandOrange
        }
    }
}

private struct TenantCodeEntrySheet: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }
    @Environment(\.dismiss) private var dismiss
    @State private var tenantCode: String = "FIT-8K2L"
    let onJoined: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Image("CalendraBookLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 128, maxHeight: 34, alignment: .leading)
                    Spacer(minLength: 0)
                }
                .frame(height: 56)
                .frame(maxWidth: .infinity, alignment: .leading)

                Text(isSl ? "Dodaj ponudnika s kodo" : "Add tenancy with code")
                    .font(.title2.weight(.bold))
                Text(isSl ? "Vnesite kodo, ki ste jo prejeli od podjetja." : "Enter the tenancy code you received from the company.")
                    .foregroundColor(.secondary)
                TextField(isSl ? "Koda ponudnika" : "Tenant code", text: $tenantCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 17, style: .continuous).fill(Color(.secondarySystemBackground)))
                Button {
                    Task {
                        await store.joinTenant(code: tenantCode)
                        if store.errorMessage == nil {
                            onJoined()
                            dismiss()
                        }
                    }
                } label: {
                    Text(isSl ? "Pridruži se ponudniku" : "Join tenancy")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
                .buttonStyle(.borderedProminent)
                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 0)
            .padding(.bottom, 24)
        }
    }
}

private struct TenantQRScannerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }
    let onCodeScanned: (String) -> Void

    var body: some View {
        ZStack(alignment: .bottom) {
            QRScannerView { code in
                onCodeScanned(code)
                dismiss()
            }
            .ignoresSafeArea()

            VStack(spacing: 12) {
                Text(isSl ? "Skeniraj QR ponudnika" : "Scan tenancy QR")
                    .font(.headline.weight(.semibold))
                    .foregroundColor(.white)
                Text(isSl ? "Postavite QR kodo na sredino okvirja." : "Center the QR code inside the frame.")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.8))
                Button(isSl ? "Zapri" : "Close") { dismiss() }
                    .buttonStyle(.borderedProminent)
                    .tint(.white)
                    .foregroundColor(.black)
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(LinearGradient(colors: [Color.clear, Color.black.opacity(0.72)], startPoint: .top, endPoint: .bottom))
        }
    }
}

private struct QRScannerView: UIViewControllerRepresentable {
    let onCodeScanned: (String) -> Void

    func makeUIViewController(context: Context) -> QRScannerViewController {
        let controller = QRScannerViewController()
        controller.onCodeScanned = onCodeScanned
        return controller
    }

    func updateUIViewController(_ uiViewController: QRScannerViewController, context: Context) {}
}

private final class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onCodeScanned: ((String) -> Void)?
    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var didEmitCode = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureSession()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if !session.isRunning { session.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning { session.stopRunning() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        updatePreviewOrientation()
    }

    private func configureSession() {
        guard let captureDevice = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: captureDevice),
              session.canAddInput(input) else { return }

        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        output.metadataObjectTypes = [.qr]

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)
        previewLayer = preview
        updatePreviewOrientation()
    }

    private func updatePreviewOrientation() {
        guard let connection = previewLayer?.connection else { return }
        guard connection.isVideoOrientationSupported else { return }
        let interfaceOrientation = view.window?.windowScene?.interfaceOrientation ?? .portrait
        connection.videoOrientation = switch interfaceOrientation {
        case .landscapeLeft: .landscapeLeft
        case .landscapeRight: .landscapeRight
        case .portraitUpsideDown: .portraitUpsideDown
        default: .portrait
        }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !didEmitCode,
              let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              metadataObject.type == .qr,
              let value = metadataObject.stringValue else { return }
        didEmitCode = true
        session.stopRunning()
        onCodeScanned?(value)
    }
}

private func extractTenantCode(from raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let components = URLComponents(string: trimmed), components.scheme != nil else {
        return trimmed
    }

    if let queryValue = components.queryItems?.first(where: { $0.name == "tenantCode" || $0.name == "code" })?.value, !queryValue.isEmpty {
        return queryValue
    }

    if let lastPath = components.path.split(separator: "/").last, !lastPath.isEmpty {
        return String(lastPath)
    }

    return trimmed
}
