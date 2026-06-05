import SwiftUI
import AVFoundation
import UIKit

struct JoinTenantView: View {
    @EnvironmentObject private var store: AppStore
    @State private var tenantCode: String = ""
    @State private var selectedMode: JoinTenantMode = .browse
    @State private var showCodePopup = false
    @State private var showScanPopup = false
    @State private var selectedCategory: JoinTenantCategory = .all
    @State private var tenantQuery: String = ""
    @State private var selectedCardIndex: Int = 0
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    let onJoin: () -> Void

    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }

    private var previewTenants: [JoinTenantPreviewTenant] {
        [
            JoinTenantPreviewTenant(name: "Luxe Salon", type: .salon, location: isSl ? "Pritličje, lokal G-12" : "Ground Floor, Shop G-12", description: isSl ? "Premium lepotne in frizerske storitve v sodobnem prostoru." : "Premium beauty and hair care services in a modern luxury space."),
            JoinTenantPreviewTenant(name: "Power Fit", type: .gym, location: isSl ? "1. nadstropje, studio 8" : "Level 1, Studio 8", description: isSl ? "Vadba za moč, kardio in osebni treningi na enem mestu." : "Strength, cardio and personal training sessions in one place."),
            JoinTenantPreviewTenant(name: "Serene Spa", type: .spa, location: isSl ? "1. nadstropje, soba 5" : "First Floor, Suite 5", description: isSl ? "Sproščujoči wellness rituali, masaže in skrb zase." : "Relaxing wellness rituals, massages and self-care experiences."),
            JoinTenantPreviewTenant(name: "Calm Therapy", type: .therapy, location: isSl ? "2. nadstropje, pisarna 3" : "Second Floor, Office 3", description: isSl ? "Strokovni terapevtski in podporni termini v mirnem okolju." : "Professional therapy and support appointments in a calm environment.")
        ]
    }

    private var filteredTenants: [JoinTenantPreviewTenant] {
        previewTenants.filter { tenant in
            let matchesCategory = selectedCategory == .all || tenant.type == selectedCategory
            let query = tenantQuery.trimmingCharacters(in: .whitespacesAndNewlines)
            let matchesQuery = query.isEmpty || tenant.name.localizedCaseInsensitiveContains(query) || tenant.location.localizedCaseInsensitiveContains(query)
            return matchesCategory && matchesQuery
        }
    }

    var body: some View {
        ZStack {
            Color(red: 0.961, green: 0.968, blue: 0.984)
                .ignoresSafeArea()

            Image("AddTenantBackground")
                .resizable()
                .scaledToFill()
                .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    brandHeader
                        .padding(.horizontal, 16)

                    VStack(alignment: .leading, spacing: 16) {
                        modeButtons
                        searchField
                        categoryChips
                        tenantCarousel
                    }
                    .padding(.horizontal, 28)
                }
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
        }
        .sheet(isPresented: $showCodePopup) {
            JoinCodePopup(
                tenantCode: $tenantCode,
                isSl: isSl,
                onCancel: { showCodePopup = false },
                onJoin: {
                    Task {
                        await store.joinTenant(code: tenantCode)
                        if store.errorMessage == nil {
                            showCodePopup = false
                            onJoin()
                        }
                    }
                }
            )
            .presentationDetents([.height(260)])
        }
        .sheet(isPresented: $showScanPopup) {
            ScanQrPopup(
                isSl: isSl,
                onCancel: { showScanPopup = false },
                onCodeScanned: { raw in
                    let code = addTenantExtractTenantCode(from: raw)
                    Task {
                        await store.joinTenant(code: code)
                        if store.errorMessage == nil {
                            showScanPopup = false
                            onJoin()
                        }
                    }
                }
            )
            .presentationDetents([.height(410)])
        }
    }

    private var brandHeader: some View {
        HStack {
            Image("CalendraBookLogo")
                .resizable()
                .scaledToFit()
                .frame(maxWidth: 128, maxHeight: 34, alignment: .leading)
            Spacer(minLength: 0)
        }
        .frame(height: 56)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var modeButtons: some View {
        HStack(spacing: 12) {
            JoinTenantModeButton(title: isSl ? "Vnesi kodo" : "Enter tenant code", mode: .code, selected: selectedMode == .code) {
                selectedMode = .code
                showCodePopup = true
            }
            JoinTenantModeButton(title: isSl ? "Skeniraj QR" : "Scan QR", mode: .scan, selected: selectedMode == .scan) {
                selectedMode = .scan
                showScanPopup = true
            }
            JoinTenantModeButton(title: isSl ? "Brskaj ponudnike" : "Browse tenant", mode: .browse, selected: selectedMode == .browse) { selectedMode = .browse }
        }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))
            TextField(
                "",
                text: $tenantQuery,
                prompt: Text(isSl ? "Poišči ponudnika" : "Search tenant").foregroundColor(Color(red: 0.400, green: 0.463, blue: 0.576).opacity(0.92))
            )
            .font(.system(size: 14))
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()

            if !tenantQuery.isEmpty {
                Button {
                    tenantQuery = ""
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))
                        .frame(width: 20, height: 20)
                        .background(Circle().fill(Color(red: 0.914, green: 0.933, blue: 0.973)))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: 1)
                )
        )
    }

    private var categoryChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(JoinTenantCategory.allCases, id: \.self) { category in
                    Button {
                        selectedCategory = category
                    } label: {
                        HStack(spacing: 6) {
                            if let symbol = category.symbol {
                                Image(systemName: symbol)
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            Text(category.title(isSl: isSl))
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(selectedCategory == category ? Color.white : Color(red: 0.086, green: 0.408, blue: 0.957))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule(style: .continuous)
                                .fill(selectedCategory == category ? Color(red: 0.086, green: 0.408, blue: 0.957) : Color.white)
                        )
                        .overlay(
                            Capsule(style: .continuous)
                                .stroke(selectedCategory == category ? Color.clear : Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: 1)
                        )
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private var tenantCarousel: some View {
        let screenWidth = UIScreen.main.bounds.width
        let cardWidth = screenWidth * 0.56
        let sidePadding = (screenWidth - cardWidth) / 2

        return VStack(spacing: 10) {
            if filteredTenants.isEmpty {
                GuestSurfaceCard(background: .white, contentPadding: 18, cornerRadius: 30) {
                    VStack(spacing: 0) {
                        Image("AddTenantEmptyIllustration")
                            .resizable()
                            .scaledToFit()
                            .frame(maxWidth: .infinity)

                        Text(isSl ? "Ni najdenih javnih ponudnikov" : "No public tenants found")
                            .font(.system(size: 24, weight: .heavy))
                            .foregroundStyle(Color(red: 0.075, green: 0.149, blue: 0.290))
                            .multilineTextAlignment(.center)
                            .padding(.top, 14)

                        Text(isSl ? "Trenutno ne najdemo javnih ponudnikov, ki bi ustrezali vašemu iskanju." : "We couldn’t find any public tenants matching your search right now.")
                            .font(.system(size: 15, weight: .regular))
                            .lineSpacing(5)
                            .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 18)
                            .padding(.top, 10)
                            .padding(.bottom, 4)
                    }
                    .frame(maxWidth: .infinity)
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(Array(filteredTenants.enumerated()), id: \.offset) { index, tenant in
                            JoinTenantPreviewCard(tenant: tenant, isSl: isSl) {
                                store.noticeMessage = isSl ? "Izbira ponudnika je trenutno pripravljena kot oblikovni predogled." : "Browse selection preview implemented for design alignment."
                            }
                            .frame(width: cardWidth)
                            .opacity(index == selectedCardIndex ? 1.0 : 0.62)
                            .id(index)
                        }
                    }
                    .padding(.horizontal, sidePadding)
                }
                .frame(width: screenWidth, height: 396)
                .offset(x: -22)
                .onAppear { selectedCardIndex = min(selectedCardIndex, max(filteredTenants.count - 1, 0)) }

                HStack(spacing: 8) {
                    ForEach(Array(filteredTenants.enumerated()), id: \.offset) { index, _ in
                        Capsule(style: .continuous)
                            .fill(index == selectedCardIndex ? Color(red: 0.086, green: 0.408, blue: 0.957) : Color(red: 0.843, green: 0.867, blue: 0.910))
                            .frame(width: index == selectedCardIndex ? 28 : 10, height: 6)
                    }
                }
            }
        }
    }


}

private struct JoinCodePopup: View {
    @Binding var tenantCode: String
    let isSl: Bool
    let onCancel: () -> Void
    let onJoin: () -> Void

    private var actionBlue: Color { Color(red: 0.09, green: 0.41, blue: 0.96) }
    private var mutedBlue: Color { actionBlue.opacity(0.66) }
    private var fieldLine: Color { actionBlue.opacity(0.22) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(isSl ? "Pridružitev s kodo ponudnika" : "Join with tenant code")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(actionBlue)
            Text(isSl ? "Vnesite kodo, ki vam jo je posredoval ponudnik." : "Enter the code provided by the tenant.")
                .font(.system(size: 14))
                .foregroundStyle(mutedBlue)

            HStack(spacing: 10) {
                CodeModeGlyph()
                    .foregroundStyle(actionBlue)
                    .frame(width: 26, height: 20)
                TextField("e.g. TEN-7X9K", text: $tenantCode)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(actionBlue)
                    .tint(actionBlue)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 12)
            .frame(height: 52)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(fieldLine, lineWidth: 1)
                    )
            )

            HStack(spacing: 12) {
                Button(action: onCancel) {
                    Text(isSl ? "Prekliči" : "Cancel")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(actionBlue)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color.white)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(fieldLine, lineWidth: 1)
                                )
                        )
                }
                Button(action: onJoin) {
                    Text(isSl ? "Pridruži se" : "Join")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(actionBlue)
                        )
                }
            }
        }
        .padding(22)
        .background(Color(red: 0.961, green: 0.968, blue: 0.984))
    }
}

private struct ScanQrPopup: View {
    let isSl: Bool
    let onCancel: () -> Void
    let onCodeScanned: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(isSl ? "Skeniraj QR" : "Scan QR")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color(red: 0.075, green: 0.149, blue: 0.290))
            Text(isSl ? "Poravnajte QR kodo ponudnika z okvirjem." : "Align the provider QR in the frame.")
                .font(.system(size: 14))
                .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))

            ZStack {
                AddTenantQRScannerView(onCodeScanned: onCodeScanned)
                    .clipShape(TopRoundedHeroShape(radius: 24))

                ScanFrameIllustration()
                    .allowsHitTesting(false)
            }
            .frame(height: 220)
            .background(
                TopRoundedHeroShape(radius: 24)
                    .fill(Color(red: 0.965, green: 0.973, blue: 0.988))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: 1)
                    )
            )

            Button(action: onCancel) {
                Text(isSl ? "Prekliči" : "Cancel")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957))
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Color.white)
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: 1)
                            )
                    )
            }
        }
        .padding(22)
        .background(Color(red: 0.961, green: 0.968, blue: 0.984))
    }
}

private struct ScanFrameIllustration: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let blue = Color(red: 0.086, green: 0.408, blue: 0.957)
            let orange = Color(red: 1.0, green: 0.616, blue: 0.106)
            let inset: CGFloat = 28
            let corner: CGFloat = 44
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: inset, y: inset + corner)); p.addLine(to: CGPoint(x: inset, y: inset)); p.addLine(to: CGPoint(x: inset + corner, y: inset))
                    p.move(to: CGPoint(x: w - inset - corner, y: inset)); p.addLine(to: CGPoint(x: w - inset, y: inset)); p.addLine(to: CGPoint(x: w - inset, y: inset + corner))
                    p.move(to: CGPoint(x: inset, y: h - inset - corner)); p.addLine(to: CGPoint(x: inset, y: h - inset)); p.addLine(to: CGPoint(x: inset + corner, y: h - inset))
                    p.move(to: CGPoint(x: w - inset - corner, y: h - inset)); p.addLine(to: CGPoint(x: w - inset, y: h - inset)); p.addLine(to: CGPoint(x: w - inset, y: h - inset - corner))
                }
                .stroke(blue, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))

                Path { p in
                    p.move(to: CGPoint(x: w * 0.22, y: h * 0.52))
                    p.addLine(to: CGPoint(x: w * 0.78, y: h * 0.52))
                }
                .stroke(orange, style: StrokeStyle(lineWidth: 3, lineCap: .round))
            }
        }
    }
}

private struct AddTenantQRScannerView: UIViewControllerRepresentable {
    let onCodeScanned: (String) -> Void

    func makeUIViewController(context: Context) -> AddTenantQRScannerViewController {
        let controller = AddTenantQRScannerViewController()
        controller.onCodeScanned = onCodeScanned
        return controller
    }

    func updateUIViewController(_ uiViewController: AddTenantQRScannerViewController, context: Context) {}
}

private final class AddTenantQRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
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

private func addTenantExtractTenantCode(from raw: String) -> String {
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


private enum JoinTenantMode {
    case code
    case scan
    case browse
}

private enum JoinTenantCategory: CaseIterable {
    case all
    case salon
    case gym
    case spa
    case therapy

    func title(isSl: Bool) -> String {
        switch self {
        case .all: return isSl ? "Vse" : "All"
        case .salon: return "Salon"
        case .gym: return isSl ? "Fitnes" : "Gym"
        case .spa: return "Spa"
        case .therapy: return isSl ? "Terapija" : "Therapy"
        }
    }

    var symbol: String? {
        switch self {
        case .all: return nil
        case .salon: return "scissors"
        case .gym: return "dumbbell"
        case .spa: return "leaf"
        case .therapy: return "cross.case"
        }
    }
}

private struct JoinTenantPreviewTenant: Identifiable {
    let id = UUID()
    let name: String
    let type: JoinTenantCategory
    let location: String
    let description: String
}

private struct JoinTenantModeButton: View {
    let title: String
    let mode: JoinTenantMode
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                JoinModeIllustration(mode: mode)
                    .frame(width: 30, height: 30)
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color(red: 0.075, green: 0.149, blue: 0.290))
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                Capsule(style: .continuous)
                    .fill(selected ? Color(red: 0.086, green: 0.408, blue: 0.957) : Color.clear)
                    .frame(width: 34, height: 3)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 102)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(selected ? Color(red: 0.086, green: 0.408, blue: 0.957) : Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: selected ? 1.6 : 1)
                    )
                    .shadow(color: .black.opacity(selected ? 0.05 : 0), radius: 10, x: 0, y: 6)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct JoinModeIllustration: View {
    let mode: JoinTenantMode

    var body: some View {
        switch mode {
        case .code:
            CodeModeGlyph()
        case .scan:
            ScanModeGlyph()
        case .browse:
            BrowseModeGlyph()
        }
    }
}

private struct CodeModeGlyph: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .stroke(Color(red: 0.086, green: 0.408, blue: 0.957), lineWidth: 2)
            Text("</>")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color(red: 1.0, green: 0.616, blue: 0.106))
        }
    }
}

private struct ScanModeGlyph: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let line = Color(red: 0.086, green: 0.408, blue: 0.957)
            let orange = Color(red: 1.0, green: 0.616, blue: 0.106)
            let inset = w * 0.14
            let short = w * 0.24
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: inset, y: inset + short))
                    p.addLine(to: CGPoint(x: inset, y: inset))
                    p.addLine(to: CGPoint(x: inset + short, y: inset))

                    p.move(to: CGPoint(x: w - inset - short, y: inset))
                    p.addLine(to: CGPoint(x: w - inset, y: inset))
                    p.addLine(to: CGPoint(x: w - inset, y: inset + short))

                    p.move(to: CGPoint(x: inset, y: h - inset - short))
                    p.addLine(to: CGPoint(x: inset, y: h - inset))
                    p.addLine(to: CGPoint(x: inset + short, y: h - inset))

                    p.move(to: CGPoint(x: w - inset - short, y: h - inset))
                    p.addLine(to: CGPoint(x: w - inset, y: h - inset))
                    p.addLine(to: CGPoint(x: w - inset, y: h - inset - short))
                }
                .stroke(line, style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))

                ForEach(0..<3) { idx in
                    let positions = [CGPoint(x: w * 0.38, y: h * 0.36), CGPoint(x: w * 0.56, y: h * 0.36), CGPoint(x: w * 0.38, y: h * 0.54)]
                    Rectangle()
                        .fill(line)
                        .frame(width: 4.5, height: 4.5)
                        .position(positions[idx])
                }

                Circle()
                    .stroke(orange, lineWidth: 2.1)
                    .frame(width: w * 0.28, height: w * 0.28)
                    .position(x: w * 0.76, y: h * 0.70)
                Path { p in
                    p.move(to: CGPoint(x: w * 0.82, y: h * 0.76))
                    p.addLine(to: CGPoint(x: w * 0.92, y: h * 0.88))
                }
                .stroke(orange, style: StrokeStyle(lineWidth: 2.1, lineCap: .round))
            }
        }
    }
}

private struct BrowseModeGlyph: View {
    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Image(systemName: "building.2")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957))
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(Color(red: 1.0, green: 0.616, blue: 0.106))
                .frame(width: 8, height: 10)
        }
    }
}

private struct TopRoundedHeroShape: Shape {
    var radius: CGFloat = 24

    func path(in rect: CGRect) -> Path {
        let r = min(radius, min(rect.width / 2, rect.height / 2))
        var path = Path()
        path.move(to: CGPoint(x: 0, y: rect.maxY))
        path.addLine(to: CGPoint(x: 0, y: r))
        path.addQuadCurve(to: CGPoint(x: r, y: 0), control: CGPoint(x: 0, y: 0))
        path.addLine(to: CGPoint(x: rect.maxX - r, y: 0))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: r), control: CGPoint(x: rect.maxX, y: 0))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

private struct JoinTenantPreviewCard: View {
    let tenant: JoinTenantPreviewTenant
    let isSl: Bool
    let onSelect: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottom) {
                TopRoundedHeroShape(radius: 24)
                    .fill(heroBackground)
                    .frame(height: 174)
                    .overlay { TenantHeroStorefrontIllustration(type: tenant.type, accent: accent) }
                    .overlay { heroOverlay }
                    .clipShape(TopRoundedHeroShape(radius: 24))
                    .padding(.horizontal, 8)
                    .padding(.top, 8)

                Circle()
                    .fill(Color.white)
                    .frame(width: 78, height: 78)
                    .shadow(color: .black.opacity(0.08), radius: 10, x: 0, y: 5)
                    .overlay {
                        Circle()
                            .fill(accent)
                            .padding(9)
                            .overlay {
                                Image(systemName: heroSymbol)
                                    .font(.system(size: 27, weight: .semibold))
                                    .foregroundStyle(Color.white)
                            }
                    }
                    .offset(y: 32)
                    .zIndex(2)
            }
            .zIndex(2)

            Spacer().frame(height: 36)

            Text(tenant.name)
                .font(.system(size: 18, weight: .heavy))
                .tracking(-0.8)
                .foregroundStyle(Color(red: 0.075, green: 0.149, blue: 0.290))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .padding(.horizontal, 22)

            Spacer().frame(height: 7)

            HStack(spacing: 6) {
                Image(systemName: tenant.type.symbol ?? "tag")
                    .font(.system(size: 11, weight: .semibold))
                Text(tenant.type.title(isSl: isSl))
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule(style: .continuous).fill(Color(red: 0.918, green: 0.945, blue: 1.0)))

            Spacer().frame(height: 10)

            HStack(spacing: 6) {
                Image(systemName: "mappin.and.ellipse")
                    .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957))
                Text(tenant.location)
                    .lineLimit(1)
            }
            .font(.system(size: 11, weight: .regular))
            .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))
            .padding(.horizontal, 28)

            Spacer().frame(height: 8)

            Button(action: onSelect) {
                Text(isSl ? "Izberi ponudnika" : "Select tenant")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(
                        RoundedRectangle(cornerRadius: 17, style: .continuous)
                            .fill(Color(red: 0.086, green: 0.408, blue: 0.957))
                    )
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 28)
            .padding(.bottom, 4)
        }
        .frame(maxWidth: .infinity, minHeight: 368)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color.white.opacity(0.98), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.06), radius: 16, x: 0, y: 8)
        )
    }

    @ViewBuilder
    private var heroOverlay: some View {
        LinearGradient(colors: [Color.clear, Color.clear, Color.black.opacity(0.08)], startPoint: .top, endPoint: .bottom)
            .clipShape(TopRoundedHeroShape(radius: 24))
            .padding(.horizontal, 8)
            .padding(.top, 8)
    }

    private var heroBackground: LinearGradient {
        switch tenant.type {
        case .salon: return LinearGradient(colors: [Color(red: 0.991, green: 0.936, blue: 0.949), Color(red: 0.955, green: 0.849, blue: 0.894)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .gym: return LinearGradient(colors: [Color(red: 0.874, green: 0.938, blue: 0.989), Color(red: 0.655, green: 0.816, blue: 0.967)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .spa: return LinearGradient(colors: [Color(red: 0.905, green: 0.955, blue: 0.880), Color(red: 0.729, green: 0.856, blue: 0.690)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .therapy: return LinearGradient(colors: [Color(red: 0.914, green: 0.936, blue: 0.983), Color(red: 0.741, green: 0.811, blue: 0.939)], startPoint: .topLeading, endPoint: .bottomTrailing)
        case .all: return LinearGradient(colors: [Color(red: 0.965, green: 0.973, blue: 0.988), Color(red: 0.898, green: 0.929, blue: 0.984)], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }

    private var accent: Color {
        switch tenant.type {
        case .salon: return Color(red: 0.902, green: 0.435, blue: 0.580)
        case .gym: return Color(red: 0.078, green: 0.471, blue: 0.831)
        case .spa: return Color(red: 0.361, green: 0.549, blue: 0.345)
        case .therapy: return Color(red: 0.427, green: 0.439, blue: 0.851)
        case .all: return Color(red: 0.086, green: 0.408, blue: 0.957)
        }
    }

    private var heroSymbol: String {
        switch tenant.type {
        case .salon: return "scissors"
        case .gym: return "dumbbell"
        case .spa: return "leaf"
        case .therapy: return "cross.case"
        case .all: return "building.2"
        }
    }
}

private struct TenantHeroStorefrontIllustration: View {
    let type: JoinTenantCategory
    let accent: Color

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.22))
                    .frame(width: w * 0.48, height: w * 0.48)
                    .offset(x: w * 0.26, y: -h * 0.18)
                Circle()
                    .fill(Color.white.opacity(0.18))
                    .frame(width: w * 0.32, height: w * 0.32)
                    .offset(x: -w * 0.30, y: -h * 0.12)

                VStack(spacing: 0) {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color.white.opacity(0.78))
                        .frame(width: w * 0.44, height: h * 0.12)
                        .padding(.bottom, -2)

                    ZStack(alignment: .top) {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color(red: 1.0, green: 0.98, blue: 0.93))
                            .frame(width: w * 0.54, height: h * 0.47)

                        HStack(spacing: 0) {
                            ForEach(0..<7, id: \.self) { idx in
                                Rectangle()
                                    .fill(idx.isMultiple(of: 2) ? accent.opacity(0.90) : Color.white.opacity(0.94))
                                    .frame(width: w * 0.075, height: h * 0.14)
                            }
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .offset(y: h * 0.10)

                        HStack(spacing: w * 0.05) {
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(accent.opacity(0.84))
                                .frame(width: w * 0.13, height: h * 0.18)
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(Color(red: 0.72, green: 0.84, blue: 0.96).opacity(0.84))
                                .frame(width: w * 0.17, height: h * 0.13)
                        }
                        .offset(y: h * 0.29)
                    }

                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(Color(red: 0.88, green: 0.82, blue: 0.74))
                        .frame(width: w * 0.62, height: h * 0.04)
                }
                .offset(y: h * 0.08)

                plant
                    .frame(width: w * 0.12, height: h * 0.25)
                    .offset(x: -w * 0.34, y: h * 0.20)
                plant
                    .frame(width: w * 0.12, height: h * 0.25)
                    .offset(x: w * 0.34, y: h * 0.20)
            }
        }
    }

    private var plant: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle().fill(Color(red: 0.45, green: 0.66, blue: 0.39)).frame(width: 15, height: 15).offset(x: -7, y: 1)
                Circle().fill(Color(red: 0.55, green: 0.75, blue: 0.48)).frame(width: 15, height: 15).offset(x: 6, y: -7)
                Circle().fill(Color(red: 0.49, green: 0.70, blue: 0.43)).frame(width: 13, height: 13).offset(x: 8, y: 8)
            }
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(Color(red: 0.90, green: 0.88, blue: 0.83))
                .frame(width: 24, height: 28)
        }
    }
}
