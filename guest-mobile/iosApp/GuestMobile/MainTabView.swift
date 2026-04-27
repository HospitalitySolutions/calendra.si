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
    @State private var isNotificationsPresented = false
    private let brandBlue = Color(red: 0.07, green: 0.30, blue: 0.62)
    private let brandOrange = Color(red: 0.95, green: 0.59, blue: 0.23)

    private var unreadNotifications: Int {
        store.notifications.filter { $0.readAt == nil }.count
    }

    private var inboxDialPhone: String? {
        let t = store.currentTenant.phone?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return t.isEmpty ? nil : t
    }

    private var canDialInboxTenant: Bool {
        guard let p = inboxDialPhone else { return false }
        return p.contains { $0.isNumber }
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
                if !store.linkedTenants.isEmpty, selectedTab != .book {
                    topUtilityBar
                }

                Group {
                    switch selectedTab {
                    case .home:
                        HomeView()
                    case .book:
                        BookView(onOpenNotifications: { isNotificationsPresented = true })
                    case .wallet:
                        WalletView()
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
        .onChange(of: store.pendingInboxOpenCompanyId) { companyId in
            guard companyId != nil else { return }
            selectedTab = .inbox
            store.consumePendingInboxOpen()
        }
        .confirmationDialog("Add tenancy", isPresented: $showAddOptions, titleVisibility: .visible) {
            Button("Add code manually") { showManualCodeSheet = true }
            Button("QR scan") { showScannerSheet = true }
            Button("Cancel", role: .cancel) { }
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
        .sheet(isPresented: $isNotificationsPresented) {
            NotificationsView()
                .environmentObject(store)
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
                HStack(spacing: 4) {
                    Text(store.currentTenant.name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(Color.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.primary)
                }
                .frame(maxWidth: 240, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var topUtilityBar: some View {
        let isInbox = selectedTab == .inbox
        return HStack(spacing: 0) {
            inboxTenantPicker
            Spacer(minLength: 0)
            HStack(spacing: 0) {
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
        .background(Color(.systemBackground))
    }

    private var bottomBar: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(Color(.separator).opacity(0.45))
                .frame(height: 0.5)
            ZStack {
                HStack(spacing: 8) {
                    navItem(.home, icon: "house.fill", title: "Home")
                    navItem(.wallet, icon: "wallet.pass.fill", title: "Wallet")
                    Spacer(minLength: 72)
                    navItem(.inbox, icon: "tray.full.fill", title: "Inbox")
                    navItem(.profile, icon: "person.crop.circle.fill", title: "Profile")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)

                Button {
                    selectedTab = .book
                } label: {
                    ZStack {
                        Image(systemName: "calendar")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(selectedTab == .book ? Color.white : brandBlue)
                            .offset(y: -1)
                        Circle()
                            .fill(brandOrange)
                            .frame(width: 16, height: 16)
                            .overlay(
                                Image(systemName: "plus")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(Color.white)
                            )
                            .offset(x: 13, y: 13)
                    }
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(selectedTab == .book ? brandBlue : Color(.secondarySystemBackground)))
                    .shadow(color: .black.opacity(0.12), radius: 14, x: 0, y: 6)
                }
                .buttonStyle(.plain)
                .offset(y: -18)
                .accessibilityLabel("Book")
            }
            .frame(maxWidth: .infinity)
            .background(
                Color(.systemBackground)
                    .ignoresSafeArea(edges: .bottom)
            )
        }
        .frame(maxWidth: .infinity)
    }

    private func navItem(_ tab: Tab, icon: String, title: String) -> some View {
        Button {
            selectedTab = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                Text(title)
                    .font(.caption2.weight(selectedTab == tab ? .semibold : .medium))
            }
            .foregroundColor(selectedTab == tab ? brandBlue : Color.secondary)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}

private struct TenantCodeEntrySheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var tenantCode: String = "FIT-8K2L"
    let onJoined: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Text("Add tenancy with code")
                    .font(.title2.weight(.bold))
                Text("Enter the tenancy code you received from the company.")
                    .foregroundColor(.secondary)
                TextField("Tenant code", text: $tenantCode)
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
                    Text("Join tenancy")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                }
                .buttonStyle(.borderedProminent)
                Spacer()
            }
            .padding(24)
            .navigationTitle("Add tenancy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

private struct TenantQRScannerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onCodeScanned: (String) -> Void

    var body: some View {
        ZStack(alignment: .bottom) {
            QRScannerView { code in
                onCodeScanned(code)
                dismiss()
            }
            .ignoresSafeArea()

            VStack(spacing: 12) {
                Text("Scan tenancy QR")
                    .font(.headline.weight(.semibold))
                    .foregroundColor(.white)
                Text("Center the QR code inside the frame.")
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.8))
                Button("Close") { dismiss() }
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
