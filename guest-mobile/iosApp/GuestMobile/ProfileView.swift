import SwiftUI

struct ProfileView: View {
    @EnvironmentObject private var store: AppStore
    @State private var profile = StoredGuestProfile(firstName: "", lastName: "", email: "", phone: "", language: "en", cards: [])
    @State private var showingEditSheet = false
    @State private var showingAddCardSheet = false
    @State private var showLanguagePicker = false
    @State private var showStoredSheet = false

    private var languageDisplay: String {
        profile.language.lowercased() == "sl" ? "Slovenščina" : "English"
    }

    private var storedCardsSummary: String {
        profile.cards.isEmpty ? "No saved cards" : "\(profile.cards.count) saved"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GuestSectionHeader(title: "Profile", subtitle: "Account and preferences")

                GuestSurfaceCard {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 14) {
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .fill(Color.accentColor.opacity(0.12))
                                .frame(width: 56, height: 56)
                                .overlay {
                                    Image(systemName: "person.fill")
                                        .foregroundStyle(Color.accentColor)
                                }
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(profile.firstName) \(profile.lastName)".trimmingCharacters(in: .whitespaces))
                                    .font(.title3.weight(.semibold))
                                Text(profile.email)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Button("Edit personal data") {
                            showingEditSheet = true
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Preferences")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)
                        .padding(.leading, 4)
                    VStack(spacing: 0) {
                        preferenceNavigationRow(title: "Language", value: languageDisplay, systemImage: "globe") {
                            showLanguagePicker = true
                        }
                        Divider().opacity(0.45)
                        preferenceNavigationRow(title: "Stored cards", value: storedCardsSummary, systemImage: "creditcard.fill") {
                            showStoredSheet = true
                        }
                        Divider().opacity(0.45)
                        Button {
                            store.logout()
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                    .font(.body)
                                    .foregroundStyle(Color.red)
                                    .frame(width: 22, alignment: .leading)
                                Text("Log out")
                                    .font(.headline)
                                    .foregroundStyle(Color.red)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                    }
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Color(.secondarySystemGroupedBackground))
                    )
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 110)
        }
        .onAppear {
            profile = LocalProfileStore.shared.load(from: store.user)
        }
        .confirmationDialog("Language", isPresented: $showLanguagePicker, titleVisibility: .visible) {
            Button("English") {
                profile.language = "en"
                LocalProfileStore.shared.save(profile)
            }
            Button("Slovenščina") {
                profile.language = "sl"
                LocalProfileStore.shared.save(profile)
            }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $showStoredSheet) {
            NavigationStack {
                Form {
                    if profile.cards.isEmpty {
                        Text("No saved cards yet.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(profile.cards, id: \.self) { card in
                            StoredCardListRow(line: card)
                        }
                    }
                    Section {
                        Button {
                            showStoredSheet = false
                            showingAddCardSheet = true
                        } label: {
                            Label("Add card", systemImage: "plus")
                        }
                    }
                }
                .navigationTitle("Stored cards")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { showStoredSheet = false }
                    }
                }
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            ProfileEditSheet(profile: profile) { updated in
                profile = updated
                LocalProfileStore.shared.save(updated)
            }
        }
        .sheet(isPresented: $showingAddCardSheet) {
            AddCardSheet { card in
                profile.cards.append(card)
                LocalProfileStore.shared.save(profile)
            }
        }
    }

    private func preferenceNavigationRow(title: String, value: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(width: 22, alignment: .leading)
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
                Text(value)
                    .foregroundStyle(.secondary)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

}

// MARK: - Stored card display (brand mark to the right of last4)

private struct StoredCardDisplay {
    let brand: GuestPaymentCardBrand
    let last4: String
    let expiry: String

    static func parse(_ line: String) -> StoredCardDisplay? {
        let parts = line.components(separatedBy: " •••• ")
        guard parts.count == 2 else { return nil }
        let brand = GuestPaymentCardBrand.fromDisplayName(parts[0])
        let tail = parts[1].components(separatedBy: " · ")
        guard tail.count == 2 else { return nil }
        let last4 = tail[0].trimmingCharacters(in: .whitespacesAndNewlines)
        guard last4.count == 4, last4.allSatisfy({ $0.isNumber }) else { return nil }
        return StoredCardDisplay(brand: brand, last4: last4, expiry: tail[1].trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

private struct StoredCardListRow: View {
    let line: String

    var body: some View {
        if let p = StoredCardDisplay.parse(line) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    Text(p.brand.displayName)
                        .font(.body.weight(.medium))
                    Text(" · ")
                        .foregroundStyle(.secondary)
                    Text("•••• ")
                        .foregroundStyle(.secondary)
                    Text(p.last4)
                        .font(.body.weight(.semibold))
                    Spacer().frame(width: 6)
                    CardBrandMark(brand: p.brand)
                    Text(" · ")
                        .foregroundStyle(.secondary)
                    Text(p.expiry)
                        .foregroundStyle(.secondary)
                }
            }
        } else {
            Text(line)
        }
    }
}

private struct CardBrandMark: View {
    let brand: GuestPaymentCardBrand

    var body: some View {
        Group {
            if brand == .mastercard {
                ZStack {
                    Circle()
                        .fill(Color(red: 235 / 255, green: 0, blue: 27 / 255))
                        .frame(width: 14, height: 14)
                        .offset(x: -5)
                    Circle()
                        .fill(Color(red: 247 / 255, green: 158 / 255, blue: 27 / 255))
                        .frame(width: 14, height: 14)
                        .offset(x: 5)
                }
                .frame(width: 30, height: 20)
            } else {
                Text(chipLabel)
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(chipForeground)
                    .padding(.horizontal, 4)
                    .frame(minWidth: 34, maxWidth: 52, minHeight: 20, maxHeight: 20)
                    .background(chipBackground, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
        }
        .accessibilityHidden(true)
    }

    private var chipLabel: String {
        switch brand {
        case .visa: return "VISA"
        case .mastercard: return "MC"
        case .amex: return "AMEX"
        case .discover: return "DISC"
        case .diners: return "DC"
        case .jcb: return "JCB"
        case .unionPay: return "UP"
        case .unknown: return "CARD"
        }
    }

    private var chipBackground: Color {
        switch brand {
        case .visa: return Color(red: 26 / 255, green: 31 / 255, blue: 113 / 255)
        case .mastercard: return .clear
        case .amex: return Color(red: 0, green: 111 / 255, blue: 207 / 255)
        case .discover: return Color(red: 1, green: 96 / 255, blue: 0)
        case .diners: return Color(red: 0, green: 121 / 255, blue: 190 / 255)
        case .jcb: return Color(red: 12 / 255, green: 77 / 255, blue: 162 / 255)
        case .unionPay: return Color(red: 226 / 255, green: 24 / 255, blue: 54 / 255)
        case .unknown: return Color(.tertiarySystemFill)
        }
    }

    private var chipForeground: Color {
        brand == .unknown ? Color.secondary : .white
    }
}

private struct ProfileEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var profile: StoredGuestProfile
    let onSave: (StoredGuestProfile) -> Void

    var body: some View {
        NavigationStack {
            Form {
                TextField("First name", text: $profile.firstName)
                TextField("Last name", text: $profile.lastName)
                TextField("Email", text: $profile.email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                TextField("Phone", text: $profile.phone)
                    .keyboardType(.phonePad)
            }
            .navigationTitle("Edit personal data")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(profile)
                        dismiss()
                    }
                }
            }
        }
    }
}

struct AddCardSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var cardholder = ""
    @State private var cardNumberDisplay = ""
    @State private var expiry = ""
    let onSave: (String) -> Void

    private var panDigits: String { GuestPaymentCard.digitsOnly(cardNumberDisplay) }
    private var brand: GuestPaymentCardBrand { GuestPaymentCardBrand.fromPan(panDigits) }
    private var panValid: Bool { GuestPaymentCard.isCompleteValidPan(panDigits) }
    private var expiryValid: Bool { GuestPaymentCard.expiryIsValid(expiry) }
    private var expiryFormatOk: Bool {
        expiry.range(of: #"^(0[1-9]|1[0-2])/(\d{2})$"#, options: .regularExpression) != nil
    }
    private var canSave: Bool {
        !cardholder.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && panValid && expiryValid
    }

    private var cardNumberBinding: Binding<String> {
        Binding(
            get: { cardNumberDisplay },
            set: { raw in
                let d = GuestPaymentCard.digitsOnly(raw)
                cardNumberDisplay = GuestPaymentCard.formatGroupedPan(d)
            }
        )
    }

    private var expiryBinding: Binding<String> {
        Binding(
            get: { expiry },
            set: { raw in expiry = GuestPaymentCard.formatExpiryInput(raw) }
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Cardholder", text: $cardholder)
                Section {
                    TextField("Card number", text: cardNumberBinding)
                        .keyboardType(.numbersAndPunctuation)
                        .textContentType(.none)
                        .autocorrectionDisabled()
                } footer: {
                    if panDigits.isEmpty {
                        Text("Enter digits; card type is detected automatically.")
                    } else if panValid {
                        Text("\(brand.displayName) · valid number").foregroundStyle(.green)
                    } else if panDigits.count >= 13, !GuestPaymentCard.luhnValid(panDigits) {
                        Text("Card number is not valid").foregroundStyle(.red)
                    } else {
                        Text("\(brand.displayName) · \(panDigits.count) digits")
                    }
                }
                Section {
                    TextField("MM/YY", text: expiryBinding)
                        .keyboardType(.numbersAndPunctuation)
                        .textContentType(.none)
                        .autocorrectionDisabled()
                } footer: {
                    if expiry.isEmpty {
                        Text("Expiry in MM/YY format.")
                    } else if !expiryFormatOk {
                        Text("Use format MM/YY").foregroundStyle(.red)
                    } else if !expiryValid {
                        Text("Expiry date is in the past").foregroundStyle(.red)
                    } else {
                        Text("Looks good").foregroundStyle(.green)
                    }
                }
            }
            .navigationTitle("Add card")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let last4 = String(panDigits.suffix(4))
                        onSave("\(brand.displayName) •••• \(last4) · \(expiry)")
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
        }
    }
}

// MARK: - Card validation (Luhn, brands, MM/YY)

enum GuestPaymentCardBrand: String, CaseIterable {
    case visa = "Visa"
    case mastercard = "Mastercard"
    case amex = "American Express"
    case discover = "Discover"
    case diners = "Diners Club"
    case jcb = "JCB"
    case unionPay = "UnionPay"
    case unknown = "Card"

    var displayName: String { rawValue }

    static func fromDisplayName(_ raw: String) -> GuestPaymentCardBrand {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return GuestPaymentCardBrand.allCases.first { $0.displayName.caseInsensitiveCompare(t) == .orderedSame } ?? .unknown
    }

    static func fromPan(_ d: String) -> GuestPaymentCardBrand {
        if d.isEmpty { return .unknown }
        if d.hasPrefix("4") { return .visa }
        if d.hasPrefix("34") || d.hasPrefix("37") { return .amex }
        if d.count >= 2, d.hasPrefix("35"), let ch = d.dropFirst().first, let v = ch.wholeNumberValue, (1...8).contains(v) { return .jcb }
        if d.hasPrefix("62") { return .unionPay }
        if d.hasPrefix("30") || d.hasPrefix("36") || d.hasPrefix("38") || d.hasPrefix("39") { return .diners }
        if d.hasPrefix("6011") || d.hasPrefix("65") { return .discover }
        if d.count >= 3, let three = Int(d.prefix(3)), (644...649).contains(three) { return .discover }
        if ["51", "52", "53", "54", "55"].contains(where: { d.hasPrefix($0) }) { return .mastercard }
        if d.count >= 4, let four = Int(d.prefix(4)), (2221...2720).contains(four) { return .mastercard }
        return .unknown
    }
}

enum GuestPaymentCard {
    private static let maxPanDigits = 19

    static func digitsOnly(_ raw: String) -> String {
        String(raw.filter(\.isNumber).prefix(maxPanDigits))
    }

    static func formatGroupedPan(_ digits: String) -> String {
        var out = ""
        for (i, ch) in digits.enumerated() {
            if i > 0 && i % 4 == 0 { out.append(" ") }
            out.append(ch)
        }
        return out
    }

    static func luhnValid(_ digits: String) -> Bool {
        guard digits.count >= 2 else { return false }
        var sum = 0
        var alt = false
        for ch in digits.reversed() {
            guard var n = ch.wholeNumberValue else { return false }
            if alt {
                n *= 2
                if n > 9 { n -= 9 }
            }
            sum += n
            alt.toggle()
        }
        return sum % 10 == 0
    }

    static func isCompleteValidPan(_ digits: String) -> Bool {
        guard digits.count >= 13, digits.count <= maxPanDigits, luhnValid(digits) else { return false }
        let b = GuestPaymentCardBrand.fromPan(digits)
        switch b {
        case .amex: return digits.count == 15
        case .diners: return digits.count == 14 || digits.count == 16
        case .visa: return [13, 16, 19].contains(digits.count)
        case .mastercard, .discover, .jcb, .unionPay: return (16...maxPanDigits).contains(digits.count)
        case .unknown: return (16...maxPanDigits).contains(digits.count)
        }
    }

    static func formatExpiryInput(_ raw: String) -> String {
        let digits = String(raw.filter(\.isNumber).prefix(4))
        switch digits.count {
        case 0: return ""
        case 1:
            if let f = digits.first, f > "1" { return "0\(digits)/" }
            return digits
        case 2:
            guard let m = Int(digits) else { return digits }
            if m == 0 || m > 12 { return String(digits.dropLast()) }
            return "\(digits)/"
        default:
            return "\(digits.prefix(2))/\(digits.dropFirst(2).prefix(2))"
        }
    }

    static func expiryIsValid(_ text: String, now: Date = Date()) -> Bool {
        guard let range = text.range(of: #"^(0[1-9]|1[0-2])/(\d{2})$"#, options: .regularExpression),
              range.lowerBound == text.startIndex, range.upperBound == text.endIndex else { return false }
        let parts = text.split(separator: "/")
        guard parts.count == 2, let mm = Int(parts[0]), let yy = Int(parts[1]) else { return false }
        let cal = Calendar(identifier: .gregorian)
        let y = cal.component(.year, from: now)
        let m = cal.component(.month, from: now)
        let fullY = 2000 + yy
        if fullY > y { return true }
        if fullY < y { return false }
        return mm >= m
    }
}
