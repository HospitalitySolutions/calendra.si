import PhotosUI
import SwiftUI
import UIKit

struct ProfileView: View {
    private enum TenantSubscriptionAction {
        case unsubscribe
        case anonymize

        var title: String {
            switch self {
            case .unsubscribe: return "Unsubscribe"
            case .anonymize: return "Anonymize"
            }
        }

        var confirmationTitle: String {
            switch self {
            case .unsubscribe: return "Unsubscribe from tenant?"
            case .anonymize: return "Anonymize tenant data?"
            }
        }

        var confirmationMessage: String {
            switch self {
            case .unsubscribe:
                return "You can only unsubscribe when there are no active sessions or entitlements for this tenancy."
            case .anonymize:
                return "This anonymizes your tenant data and marks the tenancy inactive. You can only do this when there are no active sessions or entitlements."
            }
        }
    }

    private struct TenantActionTarget: Identifiable {
        let id = UUID()
        let tenant: TenantModel
        let action: TenantSubscriptionAction
    }

    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL
    @State private var profile = StoredGuestProfile(firstName: "", lastName: "", email: "", phone: "", language: "en", cards: [])
    @State private var showingEditSheet = false
    @State private var showLanguagePicker = false
    @State private var showNotificationsSheet = false
    @State private var showInvoicingSheet = false
    @State private var showSubscribedTenantsSheet = false
    @State private var showAccountDeletionConfirmation = false
    @State private var remoteError: String?
    @State private var loadingRemoteSettings = false
    @State private var savingPreference = false
    @State private var savingProfile = false
    @State private var notifyMessagesEnabled = true
    @State private var notifyRemindersEnabled = true
    @State private var invoiceSettings = GuestInvoiceSettingsModel()
    @State private var photoPickerItem: PhotosPickerItem?
    @State private var avatarImage: UIImage?
    @State private var uploadingAvatar = false
    @State private var tenantActionTarget: TenantActionTarget?
    @State private var tenantActionInFlightId: String?

    private let accountDeletionUrl = URL(string: "https://calendra.si/account-deletion")!

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

    private var invoiceSummary: String {
        invoiceSettings.recipientType.uppercased() == "COMPANY" ? "Company" : "Individual"
    }

    private var activeTenantId: String? {
        store.currentTenant.id
    }

    private var avatarPickerTrigger: String {
        "\(store.user.id)-\(store.user.profilePicturePath ?? "")"
    }

    var body: some View {
        ZStack {
            ProfileSoftBackground()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    GuestSurfaceCard(contentPadding: 18, cornerRadius: 28) {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack(spacing: 12) {
                                PhotosPicker(selection: $photoPickerItem, matching: .images, photoLibrary: .shared()) {
                                    ProfileAvatarButton(avatarImage: avatarImage, uploading: uploadingAvatar)
                                }
                                .buttonStyle(.plain)
                                .disabled(loadingRemoteSettings || uploadingAvatar)

                                VStack(alignment: .leading, spacing: 5) {
                                    Text("\(profile.firstName) \(profile.lastName)".trimmingCharacters(in: .whitespaces))
                                        .font(.system(size: 19, weight: .bold))
                                        .foregroundColor(Color(red: 0.024, green: 0.106, blue: 0.227))
                                        .lineLimit(1)
                                    Text(profile.email)
                                        .font(.system(size: 11, weight: .regular))
                                        .foregroundColor(Color(red: 0.384, green: 0.447, blue: 0.541))
                                        .lineLimit(1)
                                }
                            }

                            Button {
                                showingEditSheet = true
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "pencil")
                                        .font(.system(size: 12, weight: .semibold))
                                    Text("Edit personal data")
                                        .font(.system(size: 10, weight: .bold))
                                }
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity, minHeight: 42)
                                .background(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .fill(Color(red: 0.035, green: 0.408, blue: 0.961))
                                )
                            }
                            .buttonStyle(.plain)
                            .disabled(loadingRemoteSettings || savingProfile)

                            if loadingRemoteSettings {
                                ProgressView()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            if let remoteError, !remoteError.isEmpty {
                                Text(remoteError)
                                    .font(.caption)
                                    .foregroundColor(.red)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Preferences")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(Color(red: 0.365, green: 0.447, blue: 0.553))
                            .tracking(2.4)
                            .textCase(.uppercase)
                            .padding(.leading, 4)

                        VStack(spacing: 0) {
                            preferenceNavigationRow(
                                title: "Language",
                                value: languageDisplay,
                                systemImage: "globe",
                                iconColor: Color(red: 0.035, green: 0.408, blue: 0.961)
                            ) {
                                showLanguagePicker = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            preferenceNavigationRow(
                                title: "Notifications",
                                value: notificationsSummary,
                                systemImage: "bell",
                                iconColor: Color(red: 1.0, green: 0.541, blue: 0.0)
                            ) {
                                showNotificationsSheet = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            preferenceNavigationRow(
                                title: "Invoicing",
                                value: invoiceSummary,
                                systemImage: "doc.text",
                                iconColor: Color(red: 0.035, green: 0.408, blue: 0.961)
                            ) {
                                showInvoicingSheet = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            preferenceNavigationRow(
                                title: "Subscribed tenants",
                                value: "\(store.linkedTenants.count)",
                                systemImage: "building.2",
                                iconColor: Color(red: 1.0, green: 0.541, blue: 0.0)
                            ) {
                                showSubscribedTenantsSheet = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            dangerNavigationRow(
                                title: "Delete account",
                                systemImage: "trash"
                            ) {
                                showAccountDeletionConfirmation = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            dangerNavigationRow(
                                title: "Log out",
                                systemImage: "rectangle.portrait.and.arrow.right"
                            ) {
                                store.logout()
                            }
                        }
                        .background(
                            RoundedRectangle(cornerRadius: 28, style: .continuous)
                                .fill(Color(.systemBackground))
                                .shadow(color: .black.opacity(0.055), radius: 20, x: 0, y: 10)
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 100)
            }
        }
        .task(id: activeTenantId) {
            profile = LocalProfileStore.shared.load(from: store.user)
            await loadRemoteSettings()
        }
        .task(id: avatarPickerTrigger) {
            await refreshAvatar()
        }
        .onChange(of: photoPickerItem) { newItem in
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
        .sheet(isPresented: $showInvoicingSheet) {
            InvoiceSettingsSheet(
                settings: invoiceSettings,
                saving: savingPreference
            ) { updated in
                Task { await saveInvoiceSettings(updated) }
            }
        }
        .sheet(isPresented: $showSubscribedTenantsSheet) {
            NavigationStack {
                List {
                    if store.linkedTenants.isEmpty {
                        Text("No subscribed tenants yet.")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(store.linkedTenants, id: \.id) { tenant in
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(tenant.name)
                                        .font(.body.weight(.semibold))
                                    if let city = tenant.city, !city.isEmpty {
                                        Text(city)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                                Spacer()
                                if tenantActionInFlightId == tenant.id {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Menu {
                                        Button(role: .destructive) {
                                            tenantActionTarget = TenantActionTarget(tenant: tenant, action: .unsubscribe)
                                        } label: {
                                            Text("Unsubscribe")
                                        }
                                        Button(role: .destructive) {
                                            tenantActionTarget = TenantActionTarget(tenant: tenant, action: .anonymize)
                                        } label: {
                                            Text("Anonymize")
                                                .foregroundColor(.red)
                                        }
                                    } label: {
                                        Image(systemName: "ellipsis")
                                            .rotationEffect(.degrees(90))
                                            .foregroundColor(.secondary)
                                            .frame(width: 28, height: 28)
                                    }
                                    .disabled(tenantActionInFlightId != nil)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
                .navigationTitle("Subscribed tenants")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            showSubscribedTenantsSheet = false
                            if store.linkedTenants.isEmpty {
                                store.logout()
                            }
                        }
                    }
                }
            }
        }
        .alert(item: $tenantActionTarget) { target in
            Alert(
                title: Text(target.action.confirmationTitle),
                message: Text(target.action.confirmationMessage),
                primaryButton: .destructive(Text(target.action.title)) {
                    Task { await performTenantAction(target) }
                },
                secondaryButton: .cancel()
            )
        }
        .alert("Delete account?", isPresented: $showAccountDeletionConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Open deletion page", role: .destructive) {
                openURL(accountDeletionUrl)
            }
        } message: {
            Text("This opens the public Calendra account deletion page where you can request deletion of your Guest App account and associated personal data.")
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
        invoiceSettings = settings.invoiceSettings
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

    private func saveInvoiceSettings(_ updated: GuestInvoiceSettingsModel) async {
        let validationError = invoiceValidationError(updated)
        guard validationError == nil else {
            remoteError = validationError
            return
        }
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
                    invoiceRecipientType: updated.recipientType,
                    invoicePersonAddressLine: updated.personAddressLine?.nilIfBlank,
                    invoicePersonPostalCode: updated.personPostalCode?.nilIfBlank,
                    invoicePersonCity: updated.personCity?.nilIfBlank,
                    invoiceCompanyName: updated.companyName?.nilIfBlank,
                    invoiceCompanyAddressLine: updated.companyAddressLine?.nilIfBlank,
                    invoiceCompanyPostalCode: updated.companyPostalCode?.nilIfBlank,
                    invoiceCompanyCity: updated.companyCity?.nilIfBlank,
                    invoiceCompanyVatId: updated.companyVatId?.nilIfBlank
                )
            )
            remoteError = nil
            applyRemoteSettings(settings)
            showInvoicingSheet = false
        } catch {
            remoteError = error.localizedDescription
        }
    }

    private func invoiceValidationError(_ invoice: GuestInvoiceSettingsModel) -> String? {
        let isCompany = invoice.recipientType.uppercased() == "COMPANY"
        if isCompany {
            if invoice.companyName.nilIfBlank == nil { return "Company name is required." }
            if invoice.companyAddressLine.nilIfBlank == nil { return "Company address is required." }
            if invoice.companyPostalCode.nilIfBlank == nil { return "Company postal code is required." }
            if invoice.companyCity.nilIfBlank == nil { return "Company city is required." }
            if invoice.companyVatId.nilIfBlank == nil { return "Company VAT ID is required." }
            return nil
        }
        if invoice.personAddressLine.nilIfBlank == nil { return "Address is required." }
        if invoice.personPostalCode.nilIfBlank == nil { return "Postal code is required." }
        if invoice.personCity.nilIfBlank == nil { return "City is required." }
        return nil
    }

    private func performTenantAction(_ target: TenantActionTarget) async {
        guard tenantActionInFlightId == nil else { return }
        tenantActionInFlightId = target.tenant.id
        defer { tenantActionInFlightId = nil }
        do {
            switch target.action {
            case .unsubscribe:
                try await store.unsubscribeTenant(companyId: target.tenant.id)
            case .anonymize:
                try await store.anonymizeTenant(companyId: target.tenant.id)
            }
            remoteError = nil
        } catch {
            remoteError = error.localizedDescription
        }
    }

    private func dangerNavigationRow(
        title: String,
        systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(red: 0.839, green: 0.161, blue: 0.114))
                    .frame(width: 22, alignment: .center)
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(red: 0.839, green: 0.161, blue: 0.114))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(red: 0.839, green: 0.161, blue: 0.114))
            }
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

    private func preferenceNavigationRow(
        title: String,
        value: String,
        systemImage: String,
        iconColor: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(iconColor)
                    .frame(width: 22, alignment: .center)
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(red: 0.024, green: 0.106, blue: 0.227))
                Spacer()
                Text(value)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(Color(red: 0.384, green: 0.447, blue: 0.541))
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(red: 0.604, green: 0.659, blue: 0.722))
            }
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        }
        .buttonStyle(.plain)
    }

}

private struct ProfileSoftBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.965, green: 0.984, blue: 1.0),
                    Color(red: 0.953, green: 0.976, blue: 1.0),
                    Color(red: 1.0, green: 0.972, blue: 0.925)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            Circle()
                .fill(Color(red: 0.812, green: 0.894, blue: 1.0).opacity(0.45))
                .frame(width: 260, height: 260)
                .offset(x: -190, y: -365)
            Circle()
                .fill(Color(red: 0.910, green: 0.957, blue: 1.0).opacity(0.62))
                .frame(width: 170, height: 170)
                .offset(x: 170, y: -175)
            Circle()
                .stroke(Color(red: 1.0, green: 0.541, blue: 0.0).opacity(0.32), lineWidth: 2)
                .frame(width: 360, height: 360)
                .offset(x: 238, y: 282)
        }
        .ignoresSafeArea()
    }
}

private struct ProfileAvatarButton: View {
    let avatarImage: UIImage?
    let uploading: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(red: 0.910, green: 0.957, blue: 1.0))
                .frame(width: 76, height: 76)
            Circle()
                .trim(from: 0.58, to: 0.92)
                .stroke(Color(red: 1.0, green: 0.541, blue: 0.0), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 76, height: 76)
                .rotationEffect(.degrees(10))
            if uploading {
                ProgressView()
            } else if let avatarImage {
                Image(uiImage: avatarImage)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 76, height: 76)
                    .clipShape(Circle())
            } else {
                Image(systemName: "person")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundColor(Color(red: 0.035, green: 0.408, blue: 0.961))
            }
        }
        .frame(width: 76, height: 76)
        .contentShape(Circle())
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
                                .foregroundColor(.secondary)
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
                                .foregroundColor(.secondary)
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

private struct InvoiceSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var recipientType: String
    @State private var personAddressLine: String
    @State private var personPostalCode: String
    @State private var personCity: String
    @State private var companyName: String
    @State private var companyAddressLine: String
    @State private var companyPostalCode: String
    @State private var companyCity: String
    @State private var companyVatId: String
    let saving: Bool
    let onSave: (GuestInvoiceSettingsModel) -> Void

    init(settings: GuestInvoiceSettingsModel, saving: Bool, onSave: @escaping (GuestInvoiceSettingsModel) -> Void) {
        _recipientType = State(initialValue: settings.recipientType.uppercased())
        _personAddressLine = State(initialValue: settings.personAddressLine ?? "")
        _personPostalCode = State(initialValue: settings.personPostalCode ?? "")
        _personCity = State(initialValue: settings.personCity ?? "")
        _companyName = State(initialValue: settings.companyName ?? "")
        _companyAddressLine = State(initialValue: settings.companyAddressLine ?? "")
        _companyPostalCode = State(initialValue: settings.companyPostalCode ?? "")
        _companyCity = State(initialValue: settings.companyCity ?? "")
        _companyVatId = State(initialValue: settings.companyVatId ?? "")
        self.saving = saving
        self.onSave = onSave
    }

    private var isCompany: Bool { recipientType == "COMPANY" }

    var body: some View {
        NavigationStack {
            Form {
                Picker("Recipient type", selection: $recipientType) {
                    Text("Individual").tag("PERSON")
                    Text("Company").tag("COMPANY")
                }
                .pickerStyle(.segmented)
                .disabled(saving)

                if isCompany {
                    TextField("Company name", text: $companyName).disabled(saving)
                    TextField("Address", text: $companyAddressLine).disabled(saving)
                    TextField("Postal code", text: $companyPostalCode).disabled(saving)
                    TextField("City", text: $companyCity).disabled(saving)
                    TextField("VAT ID", text: $companyVatId).disabled(saving)
                } else {
                    TextField("Address", text: $personAddressLine).disabled(saving)
                    TextField("Postal code", text: $personPostalCode).disabled(saving)
                    TextField("City", text: $personCity).disabled(saving)
                }
            }
            .navigationTitle("Invoicing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") {
                        onSave(
                            GuestInvoiceSettingsModel(
                                recipientType: recipientType,
                                personAddressLine: personAddressLine,
                                personPostalCode: personPostalCode,
                                personCity: personCity,
                                companyName: companyName,
                                companyAddressLine: companyAddressLine,
                                companyPostalCode: companyPostalCode,
                                companyCity: companyCity,
                                companyVatId: companyVatId
                            )
                        )
                    }
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
                        Text("\(brand.displayName) · valid number").foregroundColor(.green)
                    } else if panDigits.count >= 13, !GuestPaymentCard.luhnValid(panDigits) {
                        Text("Card number is not valid").foregroundColor(.red)
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
                        Text("Use format MM/YY").foregroundColor(.red)
                    } else if !expiryValid {
                        Text("Expiry date is in the past").foregroundColor(.red)
                    } else {
                        Text("Looks good").foregroundColor(.green)
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
