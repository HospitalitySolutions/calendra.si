import SwiftUI

struct JoinTenantView: View {
    @EnvironmentObject private var store: AppStore
    @State private var tenantCode: String = ""
    @State private var selectedMode: JoinTenantMode = .browse
    @State private var showCodePopup = false
    @State private var showScanPopup = false
    @State private var selectedCategory: JoinTenantCategory = .all
    @State private var tenantQuery: String = ""
    @State private var selectedCardIndex: Int = 0

    let onJoin: () -> Void

    private let previewTenants: [JoinTenantPreviewTenant] = [
        JoinTenantPreviewTenant(name: "Luxe Salon", type: .salon, location: "Ground Floor, Shop G-12", description: "Premium beauty and hair care services in a modern luxury space."),
        JoinTenantPreviewTenant(name: "Power Fit", type: .gym, location: "Level 1, Studio 8", description: "Strength, cardio and personal training sessions in one place."),
        JoinTenantPreviewTenant(name: "Serene Spa", type: .spa, location: "First Floor, Suite 5", description: "Relaxing wellness rituals, massages and self-care experiences."),
        JoinTenantPreviewTenant(name: "Calm Therapy", type: .therapy, location: "Second Floor, Office 3", description: "Professional therapy and support appointments in a calm environment.")
    ]

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
                    modeButtons
                    searchField
                    categoryChips
                    tenantCarousel
                }
                .padding(.horizontal, 22)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
        }
        .sheet(isPresented: $showCodePopup) {
            JoinCodePopup(
                tenantCode: $tenantCode,
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
                onCancel: { showScanPopup = false },
                onOpenScanner: {
                    showScanPopup = false
                    store.noticeMessage = "QR scanner opens from this popup. Connect the existing native scanner here."
                }
            )
            .presentationDetents([.height(360)])
        }
    }

    private var brandHeader: some View {
        Image("CalendraLogo")
            .resizable()
            .scaledToFit()
            .frame(height: 36)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var modeButtons: some View {
        HStack(spacing: 12) {
            JoinTenantModeButton(title: "Enter tenant code", mode: .code, selected: selectedMode == .code) {
                selectedMode = .code
                showCodePopup = true
            }
            JoinTenantModeButton(title: "Scan QR", mode: .scan, selected: selectedMode == .scan) {
                selectedMode = .scan
                showScanPopup = true
            }
            JoinTenantModeButton(title: "Browse tenant", mode: .browse, selected: selectedMode == .browse) { selectedMode = .browse }
        }
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))
            TextField("Search tenant", text: $tenantQuery)
                .font(.system(size: 15))
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
        }
        .padding(.horizontal, 16)
        .frame(height: 42)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
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
                            Text(category.title)
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(selectedCategory == category ? Color.white : Color(red: 0.086, green: 0.408, blue: 0.957))
                        .padding(.horizontal, 14)
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
        VStack(spacing: 8) {
            if filteredTenants.isEmpty {
                GuestSurfaceCard(background: .white, contentPadding: 24, cornerRadius: 28) {
                    VStack(spacing: 12) {
                        Image(systemName: "building.2")
                            .font(.system(size: 32, weight: .semibold))
                            .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957))
                        Text("No public tenants found")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(Color(red: 0.075, green: 0.149, blue: 0.290))
                        Text("Try another category or search term.")
                            .font(.system(size: 14))
                            .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 70)
                }
            } else {
                TabView(selection: $selectedCardIndex) {
                    ForEach(Array(filteredTenants.enumerated()), id: \.offset) { index, tenant in
                        JoinTenantPreviewCard(tenant: tenant) {
                            store.noticeMessage = "Browse selection preview implemented for design alignment."
                        }
                        .padding(.horizontal, 4)
                        .tag(index)
                    }
                }
                .frame(height: 446)
                .tabViewStyle(.page(indexDisplayMode: .automatic))
            }
        }
    }

}

private struct JoinCodePopup: View {
    @Binding var tenantCode: String
    let onCancel: () -> Void
    let onJoin: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Join with tenant code")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color(red: 0.075, green: 0.149, blue: 0.290))
            Text("Enter the code provided by the tenant.")
                .font(.system(size: 14))
                .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))

            HStack(spacing: 10) {
                CodeModeGlyph()
                    .frame(width: 26, height: 20)
                TextField("e.g. TEN-7X9K", text: $tenantCode)
                    .font(.system(size: 15))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
            }
            .padding(.horizontal, 14)
            .frame(height: 52)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: 1)
                    )
            )

            HStack(spacing: 12) {
                Button(action: onCancel) {
                    Text("Cancel")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957))
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color.white)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: 1)
                                )
                        )
                }
                Button(action: onJoin) {
                    Text("Join")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color(red: 0.086, green: 0.408, blue: 0.957))
                        )
                }
            }
        }
        .padding(22)
        .background(Color(red: 0.961, green: 0.968, blue: 0.984))
    }
}

private struct ScanQrPopup: View {
    let onCancel: () -> Void
    let onOpenScanner: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Scan QR")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Color(red: 0.075, green: 0.149, blue: 0.290))
            Text("Align the provider QR in the frame.")
                .font(.system(size: 14))
                .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))

            ZStack {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color(red: 0.965, green: 0.973, blue: 0.988))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: 1)
                    )
                ScanFrameIllustration()
                ScanModeGlyph()
                    .frame(width: 42, height: 42)
            }
            .frame(height: 190)

            HStack(spacing: 12) {
                Button(action: onCancel) {
                    Text("Cancel")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957))
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color.white)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: 1)
                                )
                        )
                }
                Button(action: onOpenScanner) {
                    Text("Open scanner")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color(red: 0.086, green: 0.408, blue: 0.957))
                        )
                }
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

    var title: String {
        switch self {
        case .all: return "All"
        case .salon: return "Salon"
        case .gym: return "Gym"
        case .spa: return "Spa"
        case .therapy: return "Therapy"
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
                    .font(.system(size: 14, weight: .semibold))
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

private struct JoinTenantPreviewCard: View {
    let tenant: JoinTenantPreviewTenant
    let onSelect: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [Color(red: 0.965, green: 0.973, blue: 0.988), Color(red: 0.898, green: 0.929, blue: 0.984)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(height: 162)
                    .overlay(alignment: .center) {
                        Image(systemName: heroSymbol)
                            .font(.system(size: 46, weight: .medium))
                            .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957).opacity(0.70))
                    }

                Circle()
                    .fill(Color.white)
                    .frame(width: 78, height: 78)
                    .shadow(color: .black.opacity(0.08), radius: 10, x: 0, y: 5)
                    .overlay {
                        Text(initials)
                            .font(.system(size: 22, weight: .bold))
                            .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957))
                    }
                    .offset(y: 34)
            }

            Spacer().frame(height: 44)

            Text(tenant.name)
                .font(.system(size: 24, weight: .bold))
                .foregroundStyle(Color(red: 0.075, green: 0.149, blue: 0.290))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 22)

            Spacer().frame(height: 8)

            HStack(spacing: 5) {
                Image(systemName: tenant.type.symbol ?? "building.2")
                    .font(.system(size: 12, weight: .semibold))
                Text(tenant.type.title)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(Color(red: 0.086, green: 0.408, blue: 0.957))
            .padding(.horizontal, 11)
            .padding(.vertical, 5)
            .background(
                Capsule(style: .continuous)
                    .fill(Color(red: 0.918, green: 0.945, blue: 1.0))
            )

            Spacer().frame(height: 10)

            HStack(spacing: 4) {
                Image(systemName: "mappin.and.ellipse")
                Text(tenant.location)
                    .lineLimit(1)
            }
            .font(.system(size: 14))
            .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))
            .padding(.horizontal, 24)

            Spacer().frame(height: 10)

            Text(tenant.description)
                .font(.system(size: 14))
                .foregroundStyle(Color(red: 0.400, green: 0.463, blue: 0.576))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(height: 38)
                .padding(.horizontal, 24)

            Spacer()

            Button(action: onSelect) {
                Text("Select tenancy")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                    .background(
                        RoundedRectangle(cornerRadius: 17, style: .continuous)
                            .fill(Color(red: 0.086, green: 0.408, blue: 0.957))
                    )
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            .padding(.bottom, 20)
        }
        .frame(maxWidth: .infinity, minHeight: 430)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color.white)
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color(red: 0.867, green: 0.890, blue: 0.937), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.06), radius: 14, x: 0, y: 8)
        )
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

    private var initials: String {
        tenant.name.split(separator: " ").prefix(2).compactMap { $0.first }.map { String($0) }.joined()
    }
}
