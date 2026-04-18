import SwiftUI

struct BookView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL

    @State private var currentStep: BookFlowStep = .provider
    @State private var selectedProviderId: String?
    @State private var selectedServiceId: String?
    @State private var selectedDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var visibleMonth: Date = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: Date())) ?? Date()
    @State private var slots: [AvailabilitySlotModel] = []
    @State private var selectedSlotId: String?
    @State private var selectedPaymentMethod: GuestBookingPaymentChoice = .card
    @State private var isLoadingSlots = false
    @State private var isSubmitting = false
    @State private var notice: String?
    @State private var storedProfile = StoredGuestProfile(firstName: "", lastName: "", email: "", phone: "", language: "en", cards: [])
    @State private var selectedStoredCard: String?
    @State private var showingStoredCardSheet = false
    @State private var showingAddCardSheet = false

    private var providers: [TenantModel] {
        store.linkedTenants.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private var servicesForSelectedProvider: [ServiceOptionModel] {
        store.serviceOptions
            .filter { $0.companyId == selectedProviderId }
            .sorted { lhs, rhs in
                if lhs.priceGross == rhs.priceGross {
                    return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                }
                return lhs.priceGross < rhs.priceGross
            }
    }

    private var selectedProvider: TenantModel? {
        providers.first(where: { $0.id == selectedProviderId })
    }

    private var selectedService: ServiceOptionModel? {
        servicesForSelectedProvider.first(where: { $0.id == selectedServiceId })
    }

    private var selectedSlot: AvailabilitySlotModel? {
        slots.first(where: { $0.id == selectedSlotId })
    }

    private var continueDisabled: Bool {
        switch currentStep {
        case .provider:
            return selectedProvider == nil
        case .service:
            return selectedService == nil
        case .dateTime:
            return selectedSlot == nil
        case .paymentReview:
            if isSubmitting { return true }
            if selectedPaymentMethod == .payPal { return true }
            if selectedPaymentMethod == .card { return selectedStoredCard == nil }
            return false
        }
    }

    private var primaryButtonTitle: String {
        currentStep == .paymentReview ? "Confirm booking" : "Continue"
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                header
                stepper
                stepContent
                primaryActionButton
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 120)
        }
        .onAppear {
            storedProfile = LocalProfileStore.shared.load(from: store.user)
            selectedStoredCard = storedProfile.cards.first
            if selectedProviderId == nil {
                selectedProviderId = store.selectedTenantId ?? providers.first?.id
            }
        }
        .onChange(of: store.user.id) { _ in
            storedProfile = LocalProfileStore.shared.load(from: store.user)
            if storedProfile.cards.contains(selectedStoredCard ?? "") == false {
                selectedStoredCard = storedProfile.cards.first
            }
        }
        .onChange(of: providers.map(\.id)) { ids in
            if ids.contains(selectedProviderId ?? "") == false {
                selectedProviderId = ids.first
            }
        }
        .onChange(of: selectedProviderId) { providerId in
            if servicesForSelectedProvider.contains(where: { $0.id == selectedServiceId }) == false {
                selectedServiceId = nil
                selectedSlotId = nil
                slots = []
            }
            if providerId == nil {
                currentStep = .provider
            }
        }
        .onChange(of: selectedServiceId) { _ in
            selectedSlotId = nil
        }
        .onChange(of: selectedDate) { newDate in
            selectedSlotId = nil
            let cal = Calendar.current
            let monthStart = cal.date(from: cal.dateComponents([.year, .month], from: newDate)) ?? newDate
            if !cal.isDate(visibleMonth, equalTo: monthStart, toGranularity: .month) {
                visibleMonth = monthStart
            }
        }
        .task(id: availabilityTaskKey) {
            guard let selectedService, currentStep.rawValue >= BookFlowStep.dateTime.rawValue else { return }
            await loadAvailability(for: selectedService)
        }
        .sheet(isPresented: $showingStoredCardSheet) {
            StoredCardPickerSheet(
                cards: storedProfile.cards,
                selectedCard: $selectedStoredCard,
                onAddNewCard: {
                    showingStoredCardSheet = false
                    showingAddCardSheet = true
                }
            )
        }
        .sheet(isPresented: $showingAddCardSheet) {
            AddCardSheet { card in
                storedProfile.cards.append(card)
                LocalProfileStore.shared.save(storedProfile)
                selectedStoredCard = card
            }
        }
        .alert("Booking update", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("OK", role: .cancel) { notice = nil }
        } message: {
            Text(notice ?? "")
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            Button {
                moveBack()
            } label: {
                Image(systemName: "arrow.left")
                    .font(.system(size: 24, weight: .medium))
                    .foregroundStyle(.primary)
            }
            .buttonStyle(.plain)

            Text("Book a session")
                .font(.system(size: 27, weight: .bold))
                .foregroundStyle(.primary)
        }
        .padding(.top, 4)
    }

    private var stepper: some View {
        let steps = BookFlowStep.allCases
        let stateIndex = currentStep.rawValue
        return HStack(alignment: .top, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.element.id) { idx, step in
                let active = step == currentStep
                let completed = step.rawValue < stateIndex
                let isFirst = idx == 0
                let isLast = idx == steps.count - 1
                let leftActive = !isFirst && step.rawValue <= stateIndex
                let rightActive = !isLast && step.rawValue < stateIndex

                Button {
                    guard canNavigate(to: step) else { return }
                    currentStep = step
                } label: {
                    VStack(spacing: 6) {
                        ZStack {
                            HStack(spacing: 0) {
                                Rectangle()
                                    .fill(isFirst ? Color.clear : (leftActive ? Color.primary : Color(.systemGray4)))
                                    .frame(height: 2)
                                Spacer().frame(width: 36)
                                Rectangle()
                                    .fill(isLast ? Color.clear : (rightActive ? Color.primary : Color(.systemGray4)))
                                    .frame(height: 2)
                            }
                            Circle()
                                .fill(active || completed ? Color.primary : Color(.secondarySystemBackground))
                                .frame(width: 36, height: 36)
                                .overlay(
                                    Group {
                                        if completed {
                                            Image(systemName: "checkmark")
                                                .font(.system(size: 14, weight: .bold))
                                                .foregroundStyle(Color.white)
                                        } else {
                                            Text("\(step.rawValue)")
                                                .font(.subheadline.weight(.semibold))
                                                .foregroundStyle(active ? Color.white : Color.secondary)
                                        }
                                    }
                                )
                        }
                        .frame(height: 36)

                        Text(step.shortTitle)
                            .font(.caption.weight(active ? .semibold : .regular))
                            .foregroundStyle(active ? Color.primary : Color.secondary)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var stepContent: some View {
        switch currentStep {
        case .provider:
            providerStep
        case .service:
            serviceStep
        case .dateTime:
            dateStep
        case .paymentReview:
            paymentReviewStep
        }
    }

    private var providerStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            GuestSurfaceCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("1. Select provider")
                        .font(.system(size: 24, weight: .bold))
                    Text("Choose a tenancy/organization you’re subscribed to")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            }

            if providers.isEmpty {
                GuestSurfaceCard {
                    Text("No subscribed providers yet. Join a tenancy first to start booking.")
                        .foregroundStyle(.secondary)
                }
            } else {
                VStack(spacing: 14) {
                    ForEach(providers) { provider in
                        let subtitle = provider.description.nilIfBlank ?? provider.city.nilIfBlank ?? "Subscribed organization"

                        Button {
                            selectedProviderId = provider.id
                        } label: {
                            selectableRowCard(
                                title: provider.name,
                                subtitle: subtitle,
                                selected: selectedProviderId == provider.id,
                                trailing: AnyView(
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 18, weight: .medium))
                                        .foregroundStyle(Color.secondary)
                                )
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var serviceStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            GuestSurfaceCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("2. Select service")
                        .font(.system(size: 24, weight: .bold))
                    Text("Choose a service from the options provided by \(selectedProvider?.name ?? "your provider")")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            }

            if selectedProvider == nil {
                GuestSurfaceCard {
                    Text("Select a provider first.")
                        .foregroundStyle(.secondary)
                }
            } else if servicesForSelectedProvider.isEmpty {
                GuestSurfaceCard {
                    Text("No guest-enabled services are available for this provider.")
                        .foregroundStyle(.secondary)
                }
            } else {
                VStack(spacing: 14) {
                    ForEach(servicesForSelectedProvider) { service in
                        Button {
                            selectedServiceId = service.id
                        } label: {
                            GuestSurfaceCard(background: selectedServiceId == service.id ? Color(red: 0.88, green: 0.91, blue: 1.0) : Color(.systemBackground)) {
                                VStack(alignment: .leading, spacing: 14) {
                                    HStack(alignment: .top, spacing: 14) {
                                        selectionIndicator(selected: selectedServiceId == service.id)
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(service.name)
                                                .font(.system(size: 22, weight: .bold))
                                                .foregroundStyle(.primary)
                                            Text(service.description.nilIfBlank ?? "Bookable service")
                                                .font(.title3)
                                                .foregroundStyle(.secondary)
                                                .multilineTextAlignment(.leading)
                                        }
                                        Spacer(minLength: 12)
                                        priceBadge(value: "\(priceString(service.priceGross)) \(service.currency)")
                                    }

                                    HStack(spacing: 10) {
                                        bookInfoPill(title: service.tenantName)
                                        if let durationMinutes = service.durationMinutes {
                                            bookInfoPill(title: "\(durationMinutes) min")
                                        }
                                    }
                                    .padding(.leading, 42)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var dateStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            GuestSurfaceCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("3. Select date & time")
                        .font(.system(size: 24, weight: .bold))
                    Text("Pick a date and an available time slot")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            }

            if selectedService != nil {
                GuestSurfaceCard {
                    VStack(alignment: .leading, spacing: 16) {
                        MonthCalendarView(
                            visibleMonth: $visibleMonth,
                            selectedDate: $selectedDate
                        )

                        Text(selectedDate.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.primary)

                        if isLoadingSlots {
                            ProgressView("Loading available times…")
                                .padding(.vertical, 8)
                        } else if slots.isEmpty {
                            Text("No slots available on the selected date.")
                                .foregroundStyle(.secondary)
                                .padding(.bottom, 6)
                        } else {
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 10) {
                                ForEach(slots) { slot in
                                    Button {
                                        selectedSlotId = slot.id
                                    } label: {
                                        Text(DateFormatting.prettyTime(slot.startsAt))
                                            .font(.system(size: 16, weight: .semibold))
                                            .foregroundStyle(selectedSlotId == slot.id ? Color.white : Color.primary)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 12)
                                            .background(
                                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                                    .fill(selectedSlotId == slot.id ? Color.primary : Color(.systemBackground))
                                            )
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                                    .strokeBorder(selectedSlotId == slot.id ? Color.clear : Color(.systemGray4), lineWidth: 1)
                                            )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
            } else {
                GuestSurfaceCard {
                    Text("Select a service first.")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var paymentReviewStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            GuestSurfaceCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("4. Payment & review")
                        .font(.system(size: 24, weight: .bold))
                    Text("Choose your preferred payment method")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            }

            GuestSurfaceCard {
                VStack(alignment: .leading, spacing: 0) {
                    paymentMethodRow(
                        title: "Credit Card",
                        subtitle: creditCardSubtitle,
                        choice: .card,
                        trailing: AnyView(HStack(spacing: 6) {
                            paymentBrandBadge("VISA")
                            paymentBrandBadge("MC")
                        }),
                        onChevronTap: {
                            if storedProfile.cards.isEmpty {
                                showingAddCardSheet = true
                            } else {
                                showingStoredCardSheet = true
                            }
                        }
                    )

                    Divider().opacity(0.35)
                    paymentMethodRow(title: "Bank Transfer", subtitle: nil, choice: .bankTransfer, trailing: nil)
                    Divider().opacity(0.35)
                    paymentMethodRow(title: "PayPal", subtitle: "Coming soon", choice: .payPal, trailing: nil, disabled: true)
                }
            }

            if let service = selectedService {
                HStack {
                    Text("Booking summary")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(priceString(service.priceGross)) \(service.currency)")
                        .font(.system(size: 20, weight: .semibold))
                }
                .padding(.horizontal, 4)

                if let slot = selectedSlot {
                    GuestSurfaceCard {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(service.name)
                                .font(.system(size: 18, weight: .semibold))
                            Text(DateFormatting.prettyRange(start: slot.startsAt, end: slot.endsAt))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private var creditCardSubtitle: String {
        if let card = selectedStoredCard, !card.isEmpty {
            return card
        }
        return storedProfile.cards.isEmpty
            ? "Add a card to pay by credit card"
            : "Tap to choose a stored card"
    }

    private var primaryActionButton: some View {
        Button {
            handlePrimaryAction()
        } label: {
            HStack(spacing: 10) {
                if isSubmitting {
                    ProgressView().tint(.white)
                }
                Text(primaryButtonTitle)
                    .font(.system(size: 17, weight: .semibold))
            }
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(continueDisabled ? Color.primary.opacity(0.4) : Color.primary)
            )
        }
        .buttonStyle(.plain)
        .disabled(continueDisabled)
        .padding(.top, 8)
    }

    private func moveBack() {
        if let previous = BookFlowStep(rawValue: max(BookFlowStep.provider.rawValue, currentStep.rawValue - 1)) {
            currentStep = previous
        }
    }

    private func canNavigate(to step: BookFlowStep) -> Bool {
        switch step {
        case .provider:
            return true
        case .service:
            return selectedProvider != nil
        case .dateTime:
            return selectedService != nil
        case .paymentReview:
            return selectedSlot != nil
        }
    }

    private func handlePrimaryAction() {
        switch currentStep {
        case .provider:
            currentStep = .service
        case .service:
            currentStep = .dateTime
        case .dateTime:
            currentStep = .paymentReview
        case .paymentReview:
            guard let selectedService, let selectedSlot else { return }
            Task { await confirmBooking(service: selectedService, slot: selectedSlot) }
        }
    }

    private func loadAvailability(for service: ServiceOptionModel) async {
        guard currentStep.rawValue >= BookFlowStep.dateTime.rawValue else { return }
        do {
            isLoadingSlots = true
            slots = try await store.loadAvailability(companyId: service.companyId, sessionTypeId: service.sessionTypeId, date: selectedDate)
            if slots.contains(where: { $0.id == selectedSlotId }) == false {
                selectedSlotId = nil
            }
            isLoadingSlots = false
        } catch {
            isLoadingSlots = false
            slots = []
            selectedSlotId = nil
            store.errorMessage = error.localizedDescription
        }
    }

    private func confirmBooking(service: ServiceOptionModel, slot: AvailabilitySlotModel) async {
        do {
            isSubmitting = true
            let checkout = try await store.createOrder(
                companyId: service.companyId,
                productId: service.productId,
                slotId: slot.id,
                paymentMethod: selectedPaymentMethod.apiValue
            )
            isSubmitting = false

            if let checkoutUrl = checkout.checkoutUrl, let url = URL(string: checkoutUrl) {
                openURL(url)
                notice = "Payment page opened."
            } else if let bankTransfer = checkout.bankTransfer {
                notice = bankTransfer.instructions
            } else {
                notice = checkout.status == "PAID" ? "Booking confirmed successfully." : checkout.status
            }
        } catch {
            isSubmitting = false
            notice = error.localizedDescription
        }
    }

    private var availabilityTaskKey: String {
        "\(selectedService?.id ?? "none")-\(DateFormatting.dayString(selectedDate))"
    }

    private func priceString(_ value: Double) -> String {
        if value.rounded() == value { return String(Int(value)) }
        return String(format: "%.2f", value)
    }

    private func selectableRowCard(title: String, subtitle: String, selected: Bool, trailing: AnyView? = nil) -> some View {
        GuestSurfaceCard(background: Color(.systemBackground)) {
            HStack(spacing: 14) {
                selectionIndicator(selected: selected)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.primary)
                    Text(subtitle)
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                if let trailing {
                    trailing
                }
            }
        }
    }

    private func selectionIndicator(selected: Bool) -> some View {
        ZStack {
            Circle()
                .stroke(selected ? Color.primary : Color.secondary.opacity(0.35), lineWidth: 2)
                .frame(width: 34, height: 34)
            if selected {
                Circle()
                    .fill(Color.primary)
                    .frame(width: 34, height: 34)
                Image(systemName: "checkmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color.white)
            }
        }
    }

    private func bookInfoPill(title: String) -> some View {
        Text(title)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Capsule(style: .continuous).fill(Color(.secondarySystemBackground)))
    }

    private func priceBadge(value: String) -> some View {
        Text(value)
            .font(.headline.weight(.semibold))
            .foregroundStyle(.primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Capsule(style: .continuous).fill(Color(.secondarySystemBackground)))
    }

    private func paymentBrandBadge(_ title: String) -> some View {
        Text(title)
            .font(.caption2.weight(.bold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color(.secondarySystemBackground)))
    }

    private func paymentMethodRow(
        title: String,
        subtitle: String?,
        choice: GuestBookingPaymentChoice,
        trailing: AnyView?,
        disabled: Bool = false,
        onChevronTap: (() -> Void)? = nil
    ) -> some View {
        HStack(alignment: .center, spacing: 14) {
            Button {
                guard !disabled else { return }
                selectedPaymentMethod = choice
            } label: {
                HStack(alignment: .center, spacing: 14) {
                    selectionIndicator(selected: selectedPaymentMethod == choice)
                        .opacity(disabled ? 0.45 : 1)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(disabled ? Color.secondary : Color.primary)
                        if let subtitle {
                            Text(subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 8)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(disabled)

            if let trailing {
                trailing
            }
            if let onChevronTap {
                Button(action: onChevronTap) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .padding(6)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 14)
    }
}

private enum BookFlowStep: Int, CaseIterable, Identifiable {
    case provider = 1
    case service = 2
    case dateTime = 3
    case paymentReview = 4

    var id: Int { rawValue }

    var shortTitle: String {
        switch self {
        case .provider: return "Provider"
        case .service: return "Service"
        case .dateTime: return "Date & time"
        case .paymentReview: return "Payment & review"
        }
    }
}

private enum GuestBookingPaymentChoice: String {
    case card
    case bankTransfer
    case payPal

    var apiValue: String {
        switch self {
        case .card: return "CARD"
        case .bankTransfer: return "BANK_TRANSFER"
        case .payPal: return "PAYPAL"
        }
    }
}

private struct StoredCardPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let cards: [String]
    @Binding var selectedCard: String?
    let onAddNewCard: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if cards.isEmpty {
                    Text("No stored cards yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(cards, id: \.self) { card in
                        Button {
                            selectedCard = card
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(card)
                                        .foregroundStyle(.primary)
                                    Text("Stored on this device")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if selectedCard == card {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Color.primary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }

                Section {
                    Button {
                        dismiss()
                        onAddNewCard()
                    } label: {
                        Label("Add new card", systemImage: "plus")
                    }
                }
            }
            .navigationTitle("Stored cards")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private extension Optional where Wrapped == String {
    var nilIfBlank: String? {
        guard let self else { return nil }
        let trimmed = self.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

// MARK: - Custom month calendar view

private struct MonthCalendarView: View {
    @Binding var visibleMonth: Date
    @Binding var selectedDate: Date

    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        return cal
    }

    private var monthTitle: String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "LLLL yyyy"
        return fmt.string(from: visibleMonth)
    }

    private func monthName(_ offset: Int) -> String {
        guard let d = calendar.date(byAdding: .month, value: offset, to: visibleMonth) else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "LLLL"
        return fmt.string(from: d)
    }

    private var weekdaySymbols: [String] {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        let raw = fmt.shortWeekdaySymbols ?? []
        guard raw.count == 7 else { return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] }
        return Array(raw[1...6]) + [raw[0]]
    }

    private var days: [Date?] {
        guard let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: visibleMonth)),
              let range = calendar.range(of: .day, in: .month, for: monthStart) else {
            return []
        }
        let firstWeekday = calendar.component(.weekday, from: monthStart)
        let offset = (firstWeekday + 5) % 7
        var cells: [Date?] = Array(repeating: nil, count: offset)
        for day in range {
            if let d = calendar.date(byAdding: .day, value: day - 1, to: monthStart) {
                cells.append(d)
            }
        }
        while cells.count % 7 != 0 { cells.append(nil) }
        return cells
    }

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Button {
                    if let d = calendar.date(byAdding: .month, value: -1, to: visibleMonth) {
                        visibleMonth = d
                    }
                } label: {
                    HStack(spacing: 2) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text(monthName(-1))
                            .font(.subheadline)
                    }
                    .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)

                Spacer()

                Text(monthTitle)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.primary)

                Spacer()

                Button {
                    if let d = calendar.date(byAdding: .month, value: 1, to: visibleMonth) {
                        visibleMonth = d
                    }
                } label: {
                    HStack(spacing: 2) {
                        Text(monthName(1))
                            .font(.subheadline)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 0) {
                ForEach(weekdaySymbols, id: \.self) { sym in
                    Text(sym)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 6) {
                ForEach(Array(days.enumerated()), id: \.offset) { _, dateOrNil in
                    if let date = dateOrNil {
                        let isSelected = calendar.isDate(date, inSameDayAs: selectedDate)
                        let isPast = calendar.startOfDay(for: date) < calendar.startOfDay(for: Date())
                        Button {
                            if !isPast {
                                selectedDate = date
                            }
                        } label: {
                            ZStack {
                                if isSelected {
                                    Circle()
                                        .fill(Color.primary)
                                        .frame(width: 36, height: 36)
                                }
                                Text("\(calendar.component(.day, from: date))")
                                    .font(.system(size: 16, weight: isSelected ? .semibold : .regular))
                                    .foregroundStyle(
                                        isSelected
                                        ? Color.white
                                        : (isPast ? Color.secondary.opacity(0.5) : Color.primary)
                                    )
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 38)
                        }
                        .buttonStyle(.plain)
                        .disabled(isPast)
                    } else {
                        Color.clear.frame(height: 38)
                    }
                }
            }
        }
    }
}
