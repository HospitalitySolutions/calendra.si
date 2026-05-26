import SwiftUI
import AVFoundation
import UIKit

struct MainTabView: View {
    enum Tab: String {
        case home, wallet, inbox, profile, book
    }

    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab: Tab = .home
    @State private var showAddOptions = false
    @State private var showManualCodeSheet = false
    @State private var showScannerSheet = false
    @State private var showWalletTenantPicker = false
    @State private var walletTenantDraftId: String?
    @State private var isNotificationsPresented = false
    @State private var rescheduleContext: BookRescheduleContext?
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
                if !store.linkedTenants.isEmpty, selectedTab != .book, selectedTab != .home, selectedTab != .wallet {
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
                    case .book:
                        BookView(
                            onOpenNotifications: { isNotificationsPresented = true },
                            onBookingCompleted: { selectedTab = .home }
                        )
                    case .wallet:
                        WalletView(
                            onOpenNotifications: { isNotificationsPresented = true },
                            onOpenTenantPicker: { openWalletWithTenantSelection() },
                            onOpenBuyTab: { refreshWalletOffersIfNeeded() }
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
            WalletTenantPickerSheet(
                tenants: store.linkedTenants,
                selectedTenantId: walletTenantDraftId ?? store.walletScopedTenantId,
                onCancel: { showWalletTenantPicker = false },
                onConfirm: { tenantId in
                    walletTenantDraftId = tenantId
                    store.setWalletTenantFilter(tenantId)
                    showWalletTenantPicker = false
                    selectedTab = .wallet
                }
            )
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
        walletTenantDraftId = store.walletScopedTenantId
        showWalletTenantPicker = true
    }

    private func refreshBookTenantIfNeeded() {
        let selected = store.selectedTenantId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallback = store.linkedTenants.first?.id?.trimmingCharacters(in: .whitespacesAndNewlines)
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
    private var inboxTenantPicker: some View {
        if selectedTab == .inbox, !store.linkedTenants.isEmpty {
            Menu {
                ForEach(store.linkedTenants, id: \.id) { tenant in
                    Button {
                        store.selectedTenantId = tenant.id
                        store.currentTenant = tenant
                    } label: {
                        if tenant.id == (store.selectedTenantId ?? store.currentTenant.id) {
                            Label(tenant.name, systemImage: "checkmark")
                        } else {
                            Text(tenant.name)
                        }
                    }
                }
            } label: {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(Color(red: 0.07, green: 0.39, blue: 0.95))
                            .shadow(color: Color(red: 0.07, green: 0.39, blue: 0.95).opacity(0.28), radius: 6, y: 3)
                        Image(systemName: "dumbbell.fill")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.white)
                    }
                    .frame(width: 44, height: 44)

                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 5) {
                            Text(inboxPrimaryTenantName)
                                .font(.system(size: 17, weight: .bold))
                                .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                                .lineLimit(1)
                                .truncationMode(.tail)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                        }
                        if let inboxTenantSubtitle {
                            Text(inboxTenantSubtitle)
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
        let isInbox = selectedTab == .inbox
        let isProfile = selectedTab == .profile
        return HStack(spacing: 0) {
            if isProfile {
                Image("CalendraBookLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 38)
            } else {
                inboxTenantPicker
            }
            Spacer(minLength: 0)
            HStack(spacing: 0) {
                if !isProfile {
                    Button {
                        if isInbox {
                            dialInboxTenant()
                        } else {
                            showAddOptions = true
                        }
                    } label: {
                        if isInbox {
                            Image(systemName: "phone.fill")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(canDialInboxTenant ? Color.primary : Color.primary.opacity(0.35))
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        } else {
                            Image(systemName: "plus")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(Color.primary)
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(isInbox && !canDialInboxTenant)
                }

                Button {
                    isNotificationsPresented = true
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(Color.primary)
                            .frame(width: 44, height: 44)
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
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .frame(height: 56)
        .background((selectedTab == .inbox || selectedTab == .profile) ? Color.clear : Color(.systemBackground))
    }

    private var bottomBar: some View {
        VStack(spacing: 0) {
            Divider().opacity(0.25)
            HStack(alignment: .center, spacing: 4) {
                navItem(.home, icon: "house", selectedIcon: "house.fill", title: isSl ? "Domov" : "Home")
                navItem(.wallet, icon: "wallet.pass", selectedIcon: "wallet.pass.fill", title: isSl ? "Denarnica" : "Wallet")
                bookTabItem
                navItem(.inbox, icon: "ellipsis.message", selectedIcon: "ellipsis.message.fill", title: isSl ? "Prejeto" : "Inbox")
                navItem(.profile, icon: "person", selectedIcon: "person.fill", title: isSl ? "Profil" : "Profile")
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

    private func navItem(_ tab: Tab, icon: String, selectedIcon: String, title: String) -> some View {
        Button {
            if tab == .wallet {
                openWalletWithTenantSelection()
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

private struct WalletTenantPickerSheet: View {
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }
    let tenants: [TenantModel]
    let selectedTenantId: String?
    let onCancel: () -> Void
    let onConfirm: (String) -> Void

    @State private var draftTenantId: String?

    init(
        tenants: [TenantModel],
        selectedTenantId: String?,
        onCancel: @escaping () -> Void,
        onConfirm: @escaping (String) -> Void
    ) {
        self.tenants = tenants
        self.selectedTenantId = selectedTenantId
        self.onCancel = onCancel
        self.onConfirm = onConfirm
        _draftTenantId = State(initialValue: selectedTenantId ?? tenants.first?.id)
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text(isSl ? "Izberi ponudnika" : "Select tenancy")
                    .font(.title2.weight(.bold))
                Text(isSl ? "Izberite ponudnika, preden si ogledate kartice ali kupite članstva." : "Choose a subscribed tenant before viewing tickets or buying memberships.")
                    .foregroundColor(.secondary)

                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(tenants, id: \.id) { tenant in
                            Button {
                                draftTenantId = tenant.id
                            } label: {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(tenant.name)
                                            .font(.headline)
                                            .foregroundColor(.primary)
                                        if let city = tenant.city, !city.isEmpty {
                                            Text(city)
                                                .font(.subheadline)
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                    Spacer()
                                    Image(systemName: draftTenantId == tenant.id ? "largecircle.fill.circle" : "circle")
                                        .foregroundColor(draftTenantId == tenant.id ? walletBlue : .secondary)
                                }
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(Color(.secondarySystemBackground))
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Button {
                    if let tenantId = draftTenantId ?? tenants.first?.id {
                        onConfirm(tenantId)
                    } else {
                        onCancel()
                    }
                } label: {
                    Text(isSl ? "Nadaljuj v denarnico" : "Continue to Wallet")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.borderedProminent)

                Button(isSl ? "Prekliči" : "Cancel", role: .cancel) { onCancel() }
                    .frame(maxWidth: .infinity)
            }
            .padding(20)
            .navigationBarTitleDisplayMode(.inline)
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
                Text(isSl ? "Dodaj ponudnika s kodo" : "Add tenancy with code")
                    .font(.title2.weight(.bold))
                Text(isSl ? "Vnesite kodo, ki ste jo prejeli od podjetja." : "Enter the tenancy code you received from the company.")
                    .foregroundColor(.secondary)
                TextField(isSl ? "Koda ponudnika" : "Tenant code", text: $tenantCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color(.secondarySystemBackground)))
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
            .padding(24)
            .navigationTitle(isSl ? "Dodaj ponudnika" : "Add tenancy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isSl ? "Zapri" : "Close") { dismiss() }
                }
            }
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
