import PhotosUI
import SwiftUI
import UIKit

struct ProfileView: View {
    @EnvironmentObject private var store: AppStore
    @State private var profile = StoredGuestProfile(firstName: "", lastName: "", email: "", phone: "", language: "en", cards: [])
    @State private var showingEditSheet = false
    @State private var showLanguagePicker = false
    @State private var showNotificationsSheet = false
    @State private var remoteError: String?
    @State private var loadingRemoteSettings = false
    @State private var savingPreference = false
    @State private var savingProfile = false
    @State private var notifyMessagesEnabled = true
    @State private var notifyRemindersEnabled = true
    @State private var photoPickerItem: PhotosPickerItem?
    @State private var avatarImage: UIImage?
    @State private var uploadingAvatar = false

    private var languageDisplay: String {
        profile.language.lowercased() == "sl" ? "Slovenščina" : "English"
    }

    private var notificationsSummary: String {
        switch (notifyMessagesEnabled, notifyRemindersEnabled) {
        case (true, true): return "On"
        case (false, false): return "Off"
        case (true, false): return "Messages only"
        case (false, true): return "Reminders only"
        }
    }

    private var activeTenantId: String? {
        store.currentTenant.id
    }

    private var avatarPickerTrigger: String {
        "\(store.user.id)-\(store.user.profilePicturePath ?? "")"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GuestSectionHeader(title: "Profile", subtitle: "Account and preferences")

                GuestSurfaceCard {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 14) {
                            PhotosPicker(selection: $photoPickerItem, matching: .images, photoLibrary: .shared()) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                                        .fill(Color.accentColor.opacity(0.12))
                                        .frame(width: 56, height: 56)
                                    if uploadingAvatar {
                                        ProgressView()
                                    } else if let avatarImage {
                                        Image(uiImage: avatarImage)
                                            .resizable()
                                            .scaledToFill()
                                            .frame(width: 56, height: 56)
                                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                                    } else {
                                        Image(systemName: "person.fill")
                                            .foregroundStyle(Color.accentColor)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .disabled(loadingRemoteSettings || uploadingAvatar)
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
                        .disabled(loadingRemoteSettings || savingProfile)

                        if loadingRemoteSettings {
                            ProgressView()
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        if let remoteError, !remoteError.isEmpty {
                            Text(remoteError)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
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
                        preferenceNavigationRow(title: "Notifications", value: notificationsSummary, systemImage: "bell.fill") {
                            showNotificationsSheet = true
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
        .task(id: activeTenantId) {
            profile = LocalProfileStore.shared.load(from: store.user)
            await loadRemoteSettings()
        }
        .task(id: avatarPickerTrigger) {
            await refreshAvatar()
        }
        .onChange(of: photoPickerItem) { _, newItem in
            Task { await handlePickedPhoto(newItem) }
        }
        .confirmationDialog("Language", isPresented: $showLanguagePicker, titleVisibility: .visible) {
            Button("English") {
                Task { await updateLanguage("en") }
            }
            Button("Slovenščina") {
                Task { await updateLanguage("sl") }
            }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $showingEditSheet) {
            ProfileEditSheet(
                profile: profile,
                saving: savingProfile
            ) { updated in
                Task {
                    await saveProfile(updated)
                }
            }
        }
        .sheet(isPresented: $showNotificationsSheet) {
            NotificationPreferencesSheet(
                messagesEnabled: $notifyMessagesEnabled,
                remindersEnabled: $notifyRemindersEnabled,
                saving: savingPreference,
                onChangeMessages: { newValue in
                    Task { await updateNotificationPreferences(messages: newValue, reminders: nil) }
                },
                onChangeReminders: { newValue in
                    Task { await updateNotificationPreferences(messages: nil, reminders: newValue) }
                }
            )
        }
    }

    private func refreshAvatar() async {
        guard store.user.profilePicturePath?.isEmpty == false else {
            await MainActor.run { avatarImage = nil }
            return
        }
        do {
            let data = try await store.downloadProfilePicture()
            let image = UIImage(data: data)
            await MainActor.run { avatarImage = image }
        } catch {
            await MainActor.run { avatarImage = nil }
        }
    }

    private func handlePickedPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        await MainActor.run { uploadingAvatar = true }
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                await MainActor.run { uploadingAvatar = false; photoPickerItem = nil }
                return
            }
            _ = try await store.uploadProfilePicture(fileName: "profile.jpg", contentType: "image/jpeg", data: data)
            await refreshAvatar()
            await MainActor.run { uploadingAvatar = false; photoPickerItem = nil }
        } catch {
            await MainActor.run {
                uploadingAvatar = false
                remoteError = error.localizedDescription
                photoPickerItem = nil
            }
        }
    }

    private func applyRemoteSettings(_ settings: GuestProfileSettingsModel) {
        profile.firstName = settings.guestUser.firstName
        profile.lastName = settings.guestUser.lastName
        profile.email = settings.guestUser.email
        profile.phone = settings.guestUser.phone ?? ""
        profile.language = settings.guestUser.language ?? profile.language
        notifyMessagesEnabled = settings.notifyMessagesEnabled
        notifyRemindersEnabled = settings.notifyRemindersEnabled
        LocalProfileStore.shared.save(profile)
    }

    private func updateNotificationPreferences(messages: Bool?, reminders: Bool?) async {
        let previousMessages = notifyMessagesEnabled
        let previousReminders = notifyRemindersEnabled
        if let messages { notifyMessagesEnabled = messages }
        if let reminders { notifyRemindersEnabled = reminders }
        savingPreference = true
        defer { savingPreference = false }
        do {
            let settings = try await store.updateProfileSettings(
                UpdateGuestProfileSettingsPayload(
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    email: profile.email,
                    phone: profile.phone.nilIfBlank,
                    language: profile.language,
                    companyId: activeTenantId,
                    linkedCompanyId: nil,
                    batchPaymentEnabled: nil,
                    notifyMessagesEnabled: messages,
                    notifyRemindersEnabled: reminders
                )
            )
            remoteError = nil
            applyRemoteSettings(settings)
        } catch {
            remoteError = error.localizedDescription
            notifyMessagesEnabled = previousMessages
            notifyRemindersEnabled = previousReminders
        }
    }

    private func loadRemoteSettings() async {
        loadingRemoteSettings = true
        defer { loadingRemoteSettings = false }
        do {
            let settings = try await store.loadProfileSettings(companyId: activeTenantId)
            remoteError = nil
            applyRemoteSettings(settings)
        } catch {
            remoteError = error.localizedDescription
        }
    }

    private func saveProfile(_ updated: StoredGuestProfile) async {
        savingProfile = true
        defer { savingProfile = false }
        do {
            let settings = try await store.updateProfileSettings(
                UpdateGuestProfileSettingsPayload(
                    firstName: updated.firstName,
                    lastName: updated.lastName,
                    email: updated.email,
                    phone: updated.phone.nilIfBlank,
                    language: updated.language,
                    companyId: activeTenantId,
                    linkedCompanyId: nil,
                    batchPaymentEnabled: nil
                )
            )
            remoteError = nil
            applyRemoteSettings(settings)
            showingEditSheet = false
        } catch {
            remoteError = error.localizedDescription
        }
    }

    private func updateLanguage(_ language: String) async {
        savingPreference = true
        defer { savingPreference = false }
        do {
            let settings = try await store.updateProfileSettings(
                UpdateGuestProfileSettingsPayload(
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    email: profile.email,
                    phone: profile.phone.nilIfBlank,
                    language: language,
                    companyId: activeTenantId,
                    linkedCompanyId: nil,
                    batchPaymentEnabled: nil
                )
            )
            remoteError = nil
            applyRemoteSettings(settings)
            showLanguagePicker = false
        } catch {
            remoteError = error.localizedDescription
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

// MARK: - Notification preferences sheet

private struct NotificationPreferencesSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var messagesEnabled: Bool
    @Binding var remindersEnabled: Bool
    let saving: Bool
    let onChangeMessages: (Bool) -> Void
    let onChangeReminders: (Bool) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle(isOn: Binding(
                        get: { messagesEnabled },
                        set: { newValue in
                            messagesEnabled = newValue
                            onChangeMessages(newValue)
                        }
                    )) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Messages")
                                .font(.headline)
                            Text("New inbox messages from your provider")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .disabled(saving)

                    Toggle(isOn: Binding(
                        get: { remindersEnabled },
                        set: { newValue in
                            remindersEnabled = newValue
                            onChangeReminders(newValue)
                        }
                    )) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Reminders")
                                .font(.headline)
                            Text("Appointment reminders and updates")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .disabled(saving)
                } footer: {
                    Text("Choose which push notifications you want to receive on this device when the app is in the background.")
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Done") { dismiss() }
                        .disabled(saving)
                }
            }
        }
    }
}

private struct ProfileEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var profile: StoredGuestProfile
    let saving: Bool
    let onSave: (StoredGuestProfile) -> Void

    var body: some View {
        NavigationStack {
            Form {
                TextField("First name", text: $profile.firstName)
                    .disabled(saving)
                TextField("Last name", text: $profile.lastName)
                    .disabled(saving)
                TextField("Email", text: $profile.email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .disabled(saving)
                TextField("Phone", text: $profile.phone)
                    .keyboardType(.phonePad)
                    .disabled(saving)
            }
            .navigationTitle("Edit personal data")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") {
                        onSave(profile)
                    }
                    .disabled(saving)
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
