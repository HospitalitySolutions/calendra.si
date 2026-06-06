import PhotosUI
import SwiftUI
import UIKit

struct ProfileView: View {
    private enum TenantSubscriptionAction {
        case unsubscribe
        case anonymize

        func title(isSl: Bool) -> String {
            switch self {
            case .unsubscribe: return isSl ? "Odjavi se" : "Unsubscribe"
            case .anonymize: return isSl ? "Anonimiziraj" : "Anonymize"
            }
        }

        func confirmationTitle(isSl: Bool) -> String {
            switch self {
            case .unsubscribe: return isSl ? "Odjava od ponudnika?" : "Unsubscribe from tenant?"
            case .anonymize: return isSl ? "Anonimiziram podatke ponudnika?" : "Anonymize tenant data?"
            }
        }

        func confirmationMessage(isSl: Bool) -> String {
            switch self {
            case .unsubscribe:
                return isSl ? "Odjavite se lahko samo, če pri tem ponudniku nimate aktivnih terminov ali ugodnosti." : "You can only unsubscribe when there are no active sessions or entitlements for this tenancy."
            case .anonymize:
                return isSl ? "To anonimizira vaše podatke pri ponudniku in označi povezavo kot neaktivno. To lahko naredite samo, če nimate aktivnih terminov ali ugodnosti." : "This anonymizes your tenant data and marks the tenancy inactive. You can only do this when there are no active sessions or entitlements."
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
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    private let accountDeletionUrl = URL(string: "https://calendra.si/account-deletion")!
    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }
    private func tr(_ en: String, _ sl: String) -> String { isSl ? sl : en }

    private var languageDisplay: String {
        profile.language.lowercased() == "sl" ? "Slovenščina" : "English"
    }

    private var notificationsSummary: String {
        switch (notifyMessagesEnabled, notifyRemindersEnabled) {
        case (true, true): return tr("On", "Vklopljeno")
        case (false, false): return tr("Off", "Izklopljeno")
        case (true, false): return tr("Messages only", "Samo sporočila")
        case (false, true): return tr("Reminders only", "Samo opomniki")
        }
    }

    private var invoiceSummary: String {
        invoiceSettings.recipientType.uppercased() == "COMPANY" ? tr("Company", "Podjetje") : tr("Individual", "Fizična oseba")
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
                VStack(alignment: .leading, spacing: 12) {
                    GuestSurfaceCard(background: .white, contentPadding: 18, cornerRadius: 28) {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(spacing: 12) {
                                PhotosPicker(selection: $photoPickerItem, matching: .images, photoLibrary: .shared()) {
                                    ProfileAvatarButton(avatarImage: avatarImage, uploading: uploadingAvatar)
                                }
                                .buttonStyle(.plain)
                                .disabled(loadingRemoteSettings || uploadingAvatar)

                                VStack(alignment: .leading, spacing: 5) {
                                    Text("\(profile.firstName) \(profile.lastName)".trimmingCharacters(in: .whitespaces))
                                        .font(.system(size: 23, weight: .bold))
                                        .foregroundColor(Color(red: 0.024, green: 0.106, blue: 0.227))
                                        .lineLimit(1)
                                    Text(profile.email)
                                        .font(.system(size: 15, weight: .regular))
                                        .foregroundColor(Color(red: 0.384, green: 0.447, blue: 0.541))
                                        .lineLimit(1)
                                }
                            }

                            Button {
                                showingEditSheet = true
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "pencil")
                                        .font(.system(size: 16, weight: .semibold))
                                    Text(tr("Edit personal data", "Uredi osebne podatke"))
                                        .font(.system(size: 15, weight: .bold))
                                }
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity, minHeight: 46)
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
                        Text(tr("Preferences", "Nastavitve"))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(Color(red: 0.365, green: 0.447, blue: 0.553))
                            .tracking(2.4)
                            .textCase(.uppercase)
                            .padding(.leading, 4)

                        VStack(spacing: 0) {
                            preferenceNavigationRow(
                                title: tr("Language", "Jezik"),
                                value: languageDisplay,
                                systemImage: "globe",
                                iconColor: Color(red: 0.035, green: 0.408, blue: 0.961)
                            ) {
                                showLanguagePicker = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            preferenceNavigationRow(
                                title: tr("Notifications", "Obvestila"),
                                value: notificationsSummary,
                                systemImage: "bell",
                                iconColor: Color(red: 1.0, green: 0.541, blue: 0.0)
                            ) {
                                showNotificationsSheet = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            preferenceNavigationRow(
                                title: tr("Invoicing", "Računi"),
                                value: invoiceSummary,
                                systemImage: "doc.text",
                                iconColor: Color(red: 0.035, green: 0.408, blue: 0.961)
                            ) {
                                showInvoicingSheet = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            preferenceNavigationRow(
                                title: tr("Subscribed tenants", "Naročeni ponudniki"),
                                value: "\(store.linkedTenants.count)",
                                systemImage: "building.2",
                                iconColor: Color(red: 1.0, green: 0.541, blue: 0.0)
                            ) {
                                showSubscribedTenantsSheet = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            dangerNavigationRow(
                                title: tr("Delete account", "Izbriši račun"),
                                systemImage: "trash"
                            ) {
                                showAccountDeletionConfirmation = true
                            }
                            Divider().background(Color(red: 0.898, green: 0.925, blue: 0.961))
                            dangerNavigationRow(
                                title: tr("Log out", "Odjava"),
                                systemImage: "rectangle.portrait.and.arrow.right"
                            ) {
                                store.logout()
                            }
                        }
                        .background(
                            RoundedRectangle(cornerRadius: 28, style: .continuous)
                                .fill(Color.white)
                                .shadow(color: .black.opacity(0.055), radius: 20, x: 0, y: 10)
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 96)
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
        .confirmationDialog(tr("Language", "Jezik"), isPresented: $showLanguagePicker, titleVisibility: .visible) {
            Button("English") {
                Task { await updateLanguage("en") }
            }
            Button("Slovenščina") {
                Task { await updateLanguage("sl") }
            }
            Button(tr("Cancel", "Prekliči"), role: .cancel) {}
        }
        .sheet(isPresented: $showingEditSheet) {
            ProfileEditSheet(
                profile: profile,
                saving: savingProfile,
                isSl: isSl
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
                isSl: isSl,
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
                saving: savingPreference,
                isSl: isSl
            ) { updated in
                Task { await saveInvoiceSettings(updated) }
            }
        }
        .sheet(isPresented: $showSubscribedTenantsSheet) {
            NavigationStack {
                List {
                    if store.linkedTenants.isEmpty {
                        Text(tr("No subscribed tenants yet.", "Ni še naročenih ponudnikov."))
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
                                            Text(tr("Unsubscribe", "Odjavi se"))
                                        }
                                        Button(role: .destructive) {
                                            tenantActionTarget = TenantActionTarget(tenant: tenant, action: .anonymize)
                                        } label: {
                                            Text(tr("Anonymize", "Anonimiziraj"))
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
                .navigationTitle(tr("Subscribed tenants", "Naročeni ponudniki"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(tr("Done", "Končano")) {
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
                title: Text(target.action.confirmationTitle(isSl: isSl)),
                message: Text(target.action.confirmationMessage(isSl: isSl)),
                primaryButton: .destructive(Text(target.action.title(isSl: isSl))) {
                    Task { await performTenantAction(target) }
                },
                secondaryButton: .cancel()
            )
        }
        .alert(tr("Delete account?", "Izbrišem račun?"), isPresented: $showAccountDeletionConfirmation) {
            Button(tr("Cancel", "Prekliči"), role: .cancel) {}
            Button(tr("Open deletion page", "Odpri stran za izbris"), role: .destructive) {
                openURL(accountDeletionUrl)
            }
        } message: {
            Text(tr("This opens the public Calendra account deletion page where you can request deletion of your Guest App account and associated personal data.", "Odpre se javna stran Calendra za izbris računa, kjer lahko zahtevate izbris računa Guest App in povezanih osebnih podatkov."))
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
        let normalizedLanguage = profile.language.lowercased()
        if normalizedLanguage == "en" || normalizedLanguage == "sl" {
            appUiLocaleStorage = normalizedLanguage
        }
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
            if invoice.companyName.nilIfBlank == nil { return tr("Company name is required.", "Naziv podjetja je obvezen.") }
            if invoice.companyAddressLine.nilIfBlank == nil { return tr("Company address is required.", "Naslov podjetja je obvezen.") }
            if invoice.companyPostalCode.nilIfBlank == nil { return tr("Company postal code is required.", "Poštna številka podjetja je obvezna.") }
            if invoice.companyCity.nilIfBlank == nil { return tr("Company city is required.", "Kraj podjetja je obvezen.") }
            if invoice.companyVatId.nilIfBlank == nil { return tr("Company VAT ID is required.", "Davčna številka podjetja je obvezna.") }
            return nil
        }
        if invoice.personAddressLine.nilIfBlank == nil { return tr("Address is required.", "Naslov je obvezen.") }
        if invoice.personPostalCode.nilIfBlank == nil { return tr("Postal code is required.", "Poštna številka je obvezna.") }
        if invoice.personCity.nilIfBlank == nil { return tr("City is required.", "Kraj je obvezen.") }
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
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(red: 0.839, green: 0.161, blue: 0.114))
                    .frame(width: 22, alignment: .center)
                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(Color(red: 0.839, green: 0.161, blue: 0.114))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Color(red: 0.839, green: 0.161, blue: 0.114))
            }
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
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
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(iconColor)
                    .frame(width: 22, alignment: .center)
                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(Color(red: 0.024, green: 0.106, blue: 0.227))
                Spacer()
                Text(value)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundColor(Color(red: 0.384, green: 0.447, blue: 0.541))
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Color(red: 0.604, green: 0.659, blue: 0.722))
            }
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
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
                .frame(width: 80, height: 80)
            Circle()
                .trim(from: 0.58, to: 0.92)
                .stroke(Color(red: 1.0, green: 0.541, blue: 0.0), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 80, height: 80)
                .rotationEffect(.degrees(10))
            if uploading {
                ProgressView()
            } else if let avatarImage {
                Image(uiImage: avatarImage)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 80, height: 80)
                    .clipShape(Circle())
            } else {
                Image(systemName: "person")
                    .font(.system(size: 34, weight: .medium))
                    .foregroundColor(Color(red: 0.035, green: 0.408, blue: 0.961))
            }
        }
        .frame(width: 80, height: 80)
        .contentShape(Circle())
    }
}

// MARK: - Notification preferences sheet

private struct NotificationPreferencesSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var messagesEnabled: Bool
    @Binding var remindersEnabled: Bool
    let saving: Bool
    let isSl: Bool
    private func tr(_ en: String, _ sl: String) -> String { isSl ? sl : en }
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
                            Text(tr("Messages", "Sporočila"))
                                .font(.headline)
                            Text(tr("New inbox messages from your provider", "Nova sporočila ponudnika"))
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
                            Text(tr("Reminders", "Opomniki"))
                                .font(.headline)
                            Text(tr("Appointment reminders and updates", "Opomniki in posodobitve terminov"))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .disabled(saving)
                } footer: {
                    Text(tr("Choose which push notifications you want to receive on this device when the app is in the background.", "Izberite, katera potisna obvestila želite prejemati na tej napravi, ko je aplikacija v ozadju."))
                }
            }
            .navigationTitle(tr("Notifications", "Obvestila"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? tr("Saving…", "Shranjevanje…") : tr("Done", "Končano")) { dismiss() }
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
    let isSl: Bool
    private func tr(_ en: String, _ sl: String) -> String { isSl ? sl : en }
    let onSave: (GuestInvoiceSettingsModel) -> Void

    init(settings: GuestInvoiceSettingsModel, saving: Bool, isSl: Bool, onSave: @escaping (GuestInvoiceSettingsModel) -> Void) {
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
        self.isSl = isSl
        self.onSave = onSave
    }

    private var isCompany: Bool { recipientType == "COMPANY" }

    var body: some View {
        NavigationStack {
            Form {
                Picker(tr("Recipient type", "Tip prejemnika"), selection: $recipientType) {
                    Text(tr("Individual", "Fizična oseba")).tag("PERSON")
                    Text(tr("Company", "Podjetje")).tag("COMPANY")
                }
                .pickerStyle(.segmented)
                .disabled(saving)

                if isCompany {
                    TextField(tr("Company name", "Naziv podjetja"), text: $companyName).disabled(saving)
                    TextField(tr("Address", "Naslov"), text: $companyAddressLine).disabled(saving)
                    TextField(tr("Postal code", "Poštna številka"), text: $companyPostalCode).disabled(saving)
                    TextField(tr("City", "Kraj"), text: $companyCity).disabled(saving)
                    TextField(tr("VAT ID", "Davčna številka"), text: $companyVatId).disabled(saving)
                } else {
                    TextField(tr("Address", "Naslov"), text: $personAddressLine).disabled(saving)
                    TextField(tr("Postal code", "Poštna številka"), text: $personPostalCode).disabled(saving)
                    TextField(tr("City", "Kraj"), text: $personCity).disabled(saving)
                }
            }
            .navigationTitle(tr("Invoicing", "Računi"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel", "Prekliči")) { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? tr("Saving…", "Shranjevanje…") : tr("Save", "Shrani")) {
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
    let isSl: Bool
    private func tr(_ en: String, _ sl: String) -> String { isSl ? sl : en }
    let onSave: (StoredGuestProfile) -> Void

    var body: some View {
        NavigationStack {
            Form {
                TextField(tr("First name", "Ime"), text: $profile.firstName)
                    .disabled(saving)
                TextField(tr("Last name", "Priimek"), text: $profile.lastName)
                    .disabled(saving)
                TextField(tr("Email", "E-pošta"), text: $profile.email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .disabled(saving)
                TextField(tr("Phone", "Telefon"), text: $profile.phone)
                    .keyboardType(.phonePad)
                    .disabled(saving)
            }
            .navigationTitle(tr("Edit personal data", "Uredi osebne podatke"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel", "Prekliči")) { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? tr("Saving…", "Shranjevanje…") : tr("Save", "Shrani")) {
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
    var languageCode: String = "en"
    private var isSl: Bool { languageCode.lowercased().hasPrefix("sl") }
    private func tr(_ en: String, _ sl: String) -> String { isSl ? sl : en }
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
                TextField(tr("Cardholder", "Imetnik kartice"), text: $cardholder)
                Section {
                    TextField(tr("Card number", "Številka kartice"), text: cardNumberBinding)
                        .keyboardType(.numbersAndPunctuation)
                        .textContentType(.none)
                        .autocorrectionDisabled()
                } footer: {
                    if panDigits.isEmpty {
                        Text(tr("Enter digits; card type is detected automatically.", "Vnesite številke; vrsta kartice se zazna samodejno."))
                    } else if panValid {
                        Text(tr("\(brand.displayName) · valid number", "\(brand.displayName) · veljavna številka")).foregroundColor(.green)
                    } else if panDigits.count >= 13, !GuestPaymentCard.luhnValid(panDigits) {
                        Text(tr("Card number is not valid", "Številka kartice ni veljavna")).foregroundColor(.red)
                    } else {
                        Text(tr("\(brand.displayName) · \(panDigits.count) digits", "\(brand.displayName) · \(panDigits.count) številk"))
                    }
                }
                Section {
                    TextField("MM/YY", text: expiryBinding)
                        .keyboardType(.numbersAndPunctuation)
                        .textContentType(.none)
                        .autocorrectionDisabled()
                } footer: {
                    if expiry.isEmpty {
                        Text(tr("Expiry in MM/YY format.", "Veljavnost v obliki MM/LL."))
                    } else if !expiryFormatOk {
                        Text(tr("Use format MM/YY", "Uporabite obliko MM/LL")).foregroundColor(.red)
                    } else if !expiryValid {
                        Text(tr("Expiry date is in the past", "Datum veljavnosti je v preteklosti")).foregroundColor(.red)
                    } else {
                        Text(tr("Looks good", "Videti je v redu")).foregroundColor(.green)
                    }
                }
            }
            .navigationTitle(tr("Add card", "Dodaj kartico"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Cancel", "Prekliči")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("Save", "Shrani")) {
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
