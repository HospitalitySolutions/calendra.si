import SwiftUI

struct BookRescheduleContext: Identifiable, Hashable {
    let bookingId: String
    let companyId: String
    let sessionTypeId: String?
    let sessionTypeName: String

    var id: String { "\(companyId)-\(bookingId)" }
}

struct BookView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL

    /// Shown in the Book tab header (utility bar is hidden on this tab).
    let onOpenNotifications: () -> Void
    let rescheduleContext: BookRescheduleContext?
    let onRescheduleCompleted: () -> Void
    let onBookingCompleted: () -> Void
    let onExit: () -> Void

    @State private var currentStep: BookFlowStep = .provider
    @State private var selectedProviderId: String?
    @State private var selectedServiceId: String?
    @State private var selectedConsultantId: String?
    @State private var consultants: [ConsultantSummaryModel] = []
    @State private var isLoadingConsultants = false
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
    private let brandBlue = Color(red: 0.07, green: 0.30, blue: 0.62)
    private let brandOrange = Color(red: 0.95, green: 0.59, blue: 0.23)

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

    private var selectedConsultant: ConsultantSummaryModel? {
        consultants.first(where: { $0.id == selectedConsultantId })
    }

    private var employeeStepEnabled: Bool {
        selectedProvider?.employeeSelectionStep ?? false
    }

    /// When false, book flow uses pay-at-venue (no payment method UI) for session bookings.
    private var skipsOnlinePaymentMethods: Bool {
        !(selectedProvider?.requireOnlinePayment ?? true)
    }

    private var isDepositMode: Bool {
        guard !skipsOnlinePaymentMethods else { return false }
        return (selectedProvider?.paymentRequirement ?? "").lowercased() == "deposit"
    }

    private var depositPercentValue: Int {
        let raw = selectedProvider?.depositPercent ?? 0
        return max(1, min(raw, 100))
    }

    private var amountDueNow: Double {
        guard let selectedService else { return 0.0 }
        if isDepositMode {
            return selectedService.priceGross * Double(depositPercentValue) / 100.0
        }
        return selectedService.priceGross
    }

    private var visibleSteps: [BookFlowStep] {
        if rescheduleContext != nil {
            return buildRescheduleSteps(employeeStepEnabled: employeeStepEnabled)
        }
        return BookFlowStep.allCases.filter { step in
            step != .employee || employeeStepEnabled
        }
    }

    private func stepOrdinal(_ step: BookFlowStep) -> Int {
        (visibleSteps.firstIndex(of: step) ?? 0) + 1
    }

    private func buildRescheduleSteps(employeeStepEnabled: Bool) -> [BookFlowStep] {
        if employeeStepEnabled {
            return [.employee, .dateTime]
        }
        return [.dateTime]
    }

    private var matchingEntitlements: [AccessCardModel] {
        guard let selectedService else { return [] }
        return store.matchingEntitlements(companyId: selectedService.companyId, sessionTypeId: selectedService.sessionTypeId)
            .filter { $0.type.uppercased() != "GIFT_CARD" }
    }

    /// Gift cards (entitlementType = GIFT_CARD) matching the selected service's company and currency.
    private var matchingGiftCards: [AccessCardModel] {
        guard let selectedService else { return [] }
        return store.accessCards.filter { card in
            guard card.companyId == selectedService.companyId else { return false }
            guard card.type.uppercased() == "GIFT_CARD" else { return false }
            let s = card.status.uppercased()
            guard s == "ACTIVE" || s == "PENDING" else { return false }
            let balance = card.remainingValueGross ?? 0.0
            guard balance > 0.0 else { return false }
            if let currency = card.currency, !currency.isEmpty,
               currency.uppercased() != selectedService.currency.uppercased() {
                return false
            }
            return true
        }.sorted { ($0.remainingValueGross ?? 0.0) < ($1.remainingValueGross ?? 0.0) }
    }

    private var matchingGiftCardsTotal: Double {
        matchingGiftCards.reduce(0.0) { $0 + ($1.remainingValueGross ?? 0.0) }
    }

    private var hasGiftCardCoverage: Bool {
        guard let selectedService else { return false }
        return matchingGiftCardsTotal + 0.0001 >= amountDueNow
    }

    private var acceptedPaymentApiValues: [String] {
        (selectedProvider?.acceptedPaymentMethods ?? []).map { $0.uppercased() }
    }

    private func isPaymentMethodAllowed(_ method: GuestBookingPaymentChoice) -> Bool {
        if method == .entitlement { return true }
        if acceptedPaymentApiValues.isEmpty { return true }
        return acceptedPaymentApiValues.contains(method.apiValue)
    }

    /// Resets the selected payment method when the active provider's allowlist or matching gift cards make it unavailable.
    private func ensurePaymentMethodAllowed() {
        if selectedPaymentMethod == .entitlement, matchingEntitlements.isEmpty {
            selectedPaymentMethod = .card
        }
        if selectedPaymentMethod == .giftCard, !hasGiftCardCoverage {
            selectedPaymentMethod = .card
        }
        if !isPaymentMethodAllowed(selectedPaymentMethod) {
            let fallbacks: [GuestBookingPaymentChoice] = [.card, .bankTransfer, .payPal]
            if let next = fallbacks.first(where: { isPaymentMethodAllowed($0) }) {
                selectedPaymentMethod = next
            }
        }
    }

    private var continueDisabled: Bool {
        switch currentStep {
        case .provider:
            return selectedProvider == nil
        case .service:
            return selectedService == nil
        case .employee:
            return selectedConsultant == nil
        case .dateTime:
            return selectedSlot == nil
        case .paymentReview:
            if isSubmitting { return true }
            if skipsOnlinePaymentMethods { return false }
            if selectedPaymentMethod == .card { return selectedStoredCard == nil }
            if selectedPaymentMethod == .entitlement { return matchingEntitlements.isEmpty }
            if selectedPaymentMethod == .giftCard { return !hasGiftCardCoverage }
            return false
        }
    }

    private var primaryButtonTitle: String {
        if rescheduleContext != nil && currentStep == .dateTime { return "Confirm reschedule" }
        return currentStep == .paymentReview ? "Confirm booking" : "Continue"
    }

    private var unreadNotifications: Int {
        store.guestAppNotificationUnreadCount
    }

    init(
        onOpenNotifications: @escaping () -> Void = {},
        rescheduleContext: BookRescheduleContext? = nil,
        onRescheduleCompleted: @escaping () -> Void = {},
        onBookingCompleted: @escaping () -> Void = {},
        onExit: @escaping () -> Void = {}
    ) {
        self.onOpenNotifications = onOpenNotifications
        self.rescheduleContext = rescheduleContext
        self.onRescheduleCompleted = onRescheduleCompleted
        self.onBookingCompleted = onBookingCompleted
        self.onExit = onExit
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 10) {
                    stepper
                    stepContent
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 16)
            }

            VStack(spacing: 0) {
                Divider()
                primaryActionButton
                    .padding(.horizontal, 20)
                    .padding(.top, 6)
                    .padding(.bottom, 8)
            }
            .background(Color(.systemBackground))
        }
        .background(Color(.systemBackground))
        .onAppear {
            storedProfile = LocalProfileStore.shared.load(from: store.user)
            selectedStoredCard = storedProfile.cards.first
            if selectedProviderId == nil {
                selectedProviderId = store.selectedTenantId ?? providers.first?.id
            }
            applyRescheduleContextIfNeeded()
            ensurePaymentMethodAllowed()
        }
        .onChange(of: store.user.id) { _ in
            storedProfile = LocalProfileStore.shared.load(from: store.user)
            if storedProfile.cards.contains(selectedStoredCard ?? "") == false {
                selectedStoredCard = storedProfile.cards.first
            }
        }
        .onChange(of: rescheduleContext?.bookingId) { _ in
            if rescheduleContext == nil {
                currentStep = .provider
                selectedServiceId = nil
                selectedConsultantId = nil
                selectedSlotId = nil
                consultants = []
                slots = []
            }
            applyRescheduleContextIfNeeded()
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
                selectedConsultantId = nil
                consultants = []
            }
            if providerId == nil {
                currentStep = .provider
            }
            ensurePaymentMethodAllowed()
        }
        .onChange(of: selectedServiceId) { _ in
            selectedSlotId = nil
            selectedConsultantId = nil
            consultants = []
            if employeeStepEnabled, let selectedService {
                Task { await loadConsultants(for: selectedService) }
            }
            ensurePaymentMethodAllowed()
        }
        .onChange(of: selectedConsultantId) { _ in
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
            guard let selectedService else { return }
            let steps = visibleSteps
            guard let currentIdx = steps.firstIndex(of: currentStep),
                  let dateIdx = steps.firstIndex(of: .dateTime),
                  currentIdx >= dateIdx else { return }
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
        let canGoBack = currentStep != .provider
        return HStack(spacing: 0) {
            Button {
                moveBack()
            } label: {
                Image(systemName: "arrow.left")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(canGoBack ? Color.primary : Color.primary.opacity(0.35))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!canGoBack)

            Text("Book a session")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.primary)

            Spacer(minLength: 0)

            Button {
                onOpenNotifications()
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
        .padding(.leading, 4)
        .padding(.trailing, 4)
        .frame(height: 56)
        .background(Color(.systemBackground))
    }

    private var stepper: some View {
        let steps = visibleSteps
        let currentIndex = steps.firstIndex(of: currentStep) ?? 0
        return HStack(alignment: .top, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.element.id) { idx, step in
                let active = step == currentStep
                let completed = idx < currentIndex
                let isFirst = idx == 0
                let isLast = idx == steps.count - 1
                let leftActive = !isFirst && idx <= currentIndex
                let rightActive = !isLast && idx < currentIndex

                Button {
                    guard canNavigate(to: step) else { return }
                    currentStep = step
                } label: {
                    VStack(spacing: 6) {
                        ZStack {
                            HStack(spacing: 0) {
                                Rectangle()
                                    .fill(isFirst ? Color.clear : (leftActive ? brandBlue : Color(.systemGray4)))
                                    .frame(height: 2)
                                Spacer().frame(width: 36)
                                Rectangle()
                                    .fill(isLast ? Color.clear : (rightActive ? brandBlue : Color(.systemGray4)))
                                    .frame(height: 2)
                            }
                            Circle()
                                .fill(active || completed ? brandBlue : Color(.secondarySystemBackground))
                                .frame(width: 36, height: 36)
                                .overlay(
                                    Group {
                                        if completed {
                                            Image(systemName: "checkmark")
                                                .font(.system(size: 14, weight: .bold))
                                                .foregroundColor(Color.white)
                                        } else {
                                            Text("\(idx + 1)")
                                                .font(.subheadline.weight(.semibold))
                                                .foregroundColor(active ? Color.white : Color.secondary)
                                        }
                                    }
                                )
                        }
                        .frame(height: 36)

                        Text(stepDisplayTitle(step))
                            .font(.caption.weight(active ? .semibold : .regular))
                            .foregroundColor(active ? Color.primary : Color.secondary)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.bottom, 2)
    }

    @ViewBuilder
    private var stepContent: some View {
        switch currentStep {
        case .provider:
            providerStep
        case .service:
            serviceStep
        case .employee:
            employeeStep
        case .dateTime:
            dateStep
        case .paymentReview:
            paymentReviewStep
        }
    }

    private var employeeStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            bookOpenHero(
                title: "Choose employee",
                subtitle: "Select who should perform\nyour service.",
                icon: "person.text.rectangle",
                accentIcon: "checkmark"
            )
            straightSectionHeader("SELECT EMPLOYEE")

            if isLoadingConsultants {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Loading employees…")
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 12)
            } else if consultants.isEmpty {
                emptyInlineMessage("No employees available", "This service has no bookable employees.")
            } else {
                VStack(spacing: 0) {
                    ForEach(consultants) { consultant in
                        Button {
                            selectedConsultantId = consultant.id
                        } label: {
                            consultantLineRow(
                                title: consultant.fullName,
                                subtitle: consultant.email ?? "",
                                selected: selectedConsultantId == consultant.id
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var providerStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            bookOpenHero(
                title: "Let's get started",
                subtitle: "Choose the provider where\nyou want to book a session.",
                icon: "mappin.circle.fill",
                accentIcon: "dumbbell.fill"
            )
            straightSectionHeader("SELECT PROVIDER")

            if providers.isEmpty {
                emptyInlineMessage("No subscribed providers yet", "Join a tenancy first to start booking.")
            } else {
                VStack(spacing: 0) {
                    ForEach(providers) { provider in
                        let subtitle = provider.companyAddress.nilIfBlank
                            ?? provider.city.nilIfBlank
                            ?? provider.description.nilIfBlank
                            ?? "Subscribed organization"

                        Button {
                            selectedProviderId = provider.id
                        } label: {
                            providerLineRow(
                                title: provider.name,
                                subtitle: subtitle,
                                selected: selectedProviderId == provider.id
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var serviceStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            bookOpenHero(
                title: "Choose a service",
                subtitle: "Select the service you want\nto book with your provider.",
                icon: "checklist",
                accentIcon: "dumbbell.fill"
            )
            straightSectionHeader("SELECTED SERVICE")

            if selectedProvider == nil {
                emptyInlineMessage("Select a provider first", "Choose a provider before selecting a service.")
            } else if servicesForSelectedProvider.isEmpty {
                emptyInlineMessage("No services available", "This provider does not currently expose any guest-app services.")
            } else {
                VStack(spacing: 0) {
                    ForEach(servicesForSelectedProvider) { service in
                        Button {
                            selectedServiceId = service.id
                        } label: {
                            serviceLineRow(service: service, selected: selectedServiceId == service.id)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var dateStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            bookOpenHero(
                title: "Choose date & time",
                subtitle: "Pick a day and time that\nworks best for you.",
                icon: "calendar",
                accentIcon: "clock"
            )

            if selectedService != nil {
                straightSectionHeader("SELECT DATE")
                MonthCalendarView(
                    visibleMonth: $visibleMonth,
                    selectedDate: $selectedDate,
                    compact: true
                )

                straightSectionHeader("SELECT TIME")
                if isLoadingSlots {
                    ProgressView("Loading available times…")
                        .padding(.vertical, 8)
                } else if slots.isEmpty {
                    Text("No slots available on the selected date.")
                        .foregroundColor(.secondary)
                        .padding(.bottom, 6)
                } else {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 8) {
                        ForEach(slots) { slot in
                            Button {
                                selectedSlotId = slot.id
                            } label: {
                                Text(DateFormatting.prettyTime(slot.startsAt))
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(selectedSlotId == slot.id ? Color.white : Color.primary)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                                    .background(selectedSlotId == slot.id ? brandBlue : Color.clear)
                                    .overlay(
                                        Rectangle()
                                            .stroke(selectedSlotId == slot.id ? brandBlue : Color(.systemGray4), lineWidth: 1)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            } else {
                emptyInlineMessage("Select a service first", "Choose a service before selecting date and time.")
            }
        }
    }

    private var paymentReviewStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            bookOpenHero(
                title: skipsOnlinePaymentMethods ? "Review booking" : "Payment & review",
                subtitle: skipsOnlinePaymentMethods
                    ? "Review your booking details\nand confirm your session."
                    : "Choose your preferred payment\nmethod and review your booking.",
                icon: "creditcard.fill",
                accentIcon: "checkmark.shield.fill"
            )

            if skipsOnlinePaymentMethods {
                emptyInlineMessage("Pay at venue", "Payment is collected at the venue. Tap Confirm booking to reserve your slot.")
            } else {
                straightSectionHeader("PAYMENT METHOD")
                VStack(spacing: 0) {
                    if !matchingEntitlements.isEmpty {
                        paymentLineRow(
                            title: "Use pass or visit",
                            subtitle: matchingEntitlements.first.map { entitlement in
                                let remaining = entitlement.remainingUses.map(String.init) ?? "Unlimited"
                                return "\(entitlement.name) • \(remaining) left"
                            } ?? "No valid pass or pack available",
                            selected: selectedPaymentMethod == .entitlement,
                            disabled: matchingEntitlements.isEmpty,
                            icon: "ticket",
                            trailing: nil,
                            onChevronTap: nil,
                            onSelect: { selectedPaymentMethod = .entitlement }
                        )
                    }
                    if isPaymentMethodAllowed(.giftCard), hasGiftCardCoverage, let giftCard = matchingGiftCards.first {
                        let balanceText = giftCard.remainingValueGross.map { priceString($0) } ?? "available"
                        let currencyText = giftCard.currency ?? selectedService?.currency ?? ""
                        let subtitle = "\(giftCard.name) • \(balanceText) \(currencyText)".trimmingCharacters(in: .whitespaces)
                        paymentLineRow(
                            title: "Gift card",
                            subtitle: selectedPaymentMethod == .giftCard ? subtitle : "Use your gift card balance",
                            selected: selectedPaymentMethod == .giftCard,
                            disabled: false,
                            icon: "giftcard",
                            trailing: nil,
                            onChevronTap: nil,
                            onSelect: { selectedPaymentMethod = .giftCard }
                        )
                    }
                    if isPaymentMethodAllowed(.card) {
                        paymentLineRow(
                            title: "Credit Card",
                            subtitle: creditCardSubtitle,
                            selected: selectedPaymentMethod == .card,
                            disabled: false,
                            icon: "creditcard.fill",
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
                            },
                            onSelect: { selectedPaymentMethod = .card }
                        )
                    }
                    if isPaymentMethodAllowed(.bankTransfer) {
                        paymentLineRow(
                            title: "Bank Transfer",
                            subtitle: nil,
                            selected: selectedPaymentMethod == .bankTransfer,
                            disabled: false,
                            icon: "building.columns.fill",
                            trailing: nil,
                            onChevronTap: nil,
                            onSelect: { selectedPaymentMethod = .bankTransfer }
                        )
                    }
                    if isPaymentMethodAllowed(.payPal) {
                        paymentLineRow(
                            title: "PayPal",
                            subtitle: selectedPaymentMethod == .payPal ? "Approve securely in PayPal" : nil,
                            selected: selectedPaymentMethod == .payPal,
                            disabled: false,
                            icon: "p.square.fill",
                            trailing: nil,
                            onChevronTap: nil,
                            onSelect: { selectedPaymentMethod = .payPal }
                        )
                    }
                }
            }

            if let service = selectedService {
                reviewSummary(service: service)
            }
        }
    }

    private func bookOpenHero(title: String, subtitle: String, icon: String, accentIcon: String) -> some View {
        HStack(alignment: .center, spacing: 18) {
            VStack(alignment: .leading, spacing: 14) {
                Text(title)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(.secondary)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            minimalBookIllustration(icon: icon, accentIcon: accentIcon)
        }
        .frame(minHeight: 142)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private func minimalBookIllustration(icon: String, accentIcon: String) -> some View {
        ZStack(alignment: .center) {
            Circle()
                .fill(brandBlue.opacity(0.08))
                .frame(width: 112, height: 112)
                .offset(x: 18, y: -2)

            Rectangle()
                .stroke(Color(.systemGray4), lineWidth: 1)
                .background(Color(.systemBackground).opacity(0.86))
                .frame(width: 78, height: 62)
                .overlay(
                    Image(systemName: accentIcon)
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundColor(.primary)
                )
                .offset(x: 12, y: 24)

            Image(systemName: icon)
                .font(.system(size: 38, weight: .semibold))
                .foregroundColor(brandBlue)
                .offset(x: 8, y: -30)

            Rectangle()
                .fill(Color(.systemGray4))
                .frame(width: 118, height: 1)
                .offset(y: 58)
        }
        .frame(width: 150, height: 120)
    }

    private func straightSectionHeader(_ title: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.secondary)
            Divider()
        }
    }

    private func emptyInlineMessage(_ title: String, _ description: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.primary)
            Text(description)
                .font(.subheadline)
                .foregroundColor(.secondary)
            Divider().padding(.top, 10)
        }
        .padding(.vertical, 12)
    }

    private func squareIconTile(_ systemName: String, selected: Bool = true) -> some View {
        ZStack {
            Rectangle()
                .fill(selected ? brandBlue : Color(.secondarySystemBackground))
            Image(systemName: systemName)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(selected ? .white : .secondary)
        }
        .frame(width: 48, height: 48)
    }

    private func selectionRail(_ selected: Bool) -> some View {
        Rectangle()
            .fill(selected ? brandBlue : Color.clear)
            .frame(width: 3, height: 48)
    }

    private func providerLineRow(title: String, subtitle: String, selected: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                selectionRail(selected)
                squareIconTile("dumbbell.fill", selected: selected)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.primary)
            }
            .padding(.vertical, 14)
            Divider()
        }
        .contentShape(Rectangle())
    }

    private func serviceLineRow(service: ServiceOptionModel, selected: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                selectionRail(selected)
                squareIconTile("dumbbell.fill", selected: selected)
                VStack(alignment: .leading, spacing: 5) {
                    Text(service.name)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)
                    Text(service.description.nilIfBlank ?? "Bookable service")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    HStack(spacing: 6) {
                        straightTag(service.tenantName)
                        if let durationMinutes = service.durationMinutes {
                            straightTag("\(durationMinutes) min")
                        }
                    }
                }
                Spacer(minLength: 8)
                Text("\(priceString(service.priceGross)) \(service.currency)")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(brandBlue)
            }
            .padding(.vertical, 14)
            Divider()
        }
        .contentShape(Rectangle())
    }

    private func consultantLineRow(title: String, subtitle: String, selected: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                selectionRail(selected)
                squareIconTile("person.text.rectangle", selected: selected)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.primary)
            }
            .padding(.vertical, 14)
            Divider()
        }
        .contentShape(Rectangle())
    }

    private func straightTag(_ title: String) -> some View {
        Text(title)
            .font(.caption.weight(.medium))
            .foregroundColor(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Rectangle().fill(Color(.secondarySystemBackground)))
    }

    private func paymentLineRow(
        title: String,
        subtitle: String?,
        selected: Bool,
        disabled: Bool,
        icon: String,
        trailing: AnyView?,
        onChevronTap: (() -> Void)?,
        onSelect: @escaping () -> Void
    ) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button {
                    guard !disabled else { return }
                    onSelect()
                } label: {
                    selectionIndicator(selected: selected, size: 24)
                        .opacity(disabled ? 0.45 : 1)
                }
                .buttonStyle(.plain)
                .disabled(disabled)

                squareIconTile(icon, selected: selected)

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(disabled ? .secondary : .primary)
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 8)
                if let trailing {
                    trailing
                }
                Button {
                    if let onChevronTap { onChevronTap() } else { onSelect() }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)
                        .frame(width: 30, height: 34)
                }
                .buttonStyle(.plain)
                .disabled(disabled)
            }
            .padding(.horizontal, selected ? 12 : 0)
            .padding(.vertical, 12)
            .overlay(
                Rectangle()
                    .stroke(selected ? brandBlue : Color.clear, lineWidth: 1)
            )
            Divider()
        }
        .contentShape(Rectangle())
    }

    private func reviewSummary(service: ServiceOptionModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            straightSectionHeader("REVIEW SUMMARY")
            reviewSummaryLine(icon: "dumbbell.fill", label: "Service", value: service.name)
            if let slot = selectedSlot {
                reviewSummaryLine(icon: "calendar", label: "Date & time", value: DateFormatting.prettyRange(start: slot.startsAt, end: slot.endsAt))
            }
            if !skipsOnlinePaymentMethods && isDepositMode {
                reviewSummaryLine(icon: "creditcard", label: "Deposit", value: "\(depositPercentValue)% · \(priceString(amountDueNow)) \(service.currency)")
            }
            HStack(spacing: 14) {
                Image(systemName: "tag")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.primary)
                    .frame(width: 26)
                Text("Total")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.primary)
                Spacer()
                Text("\(priceString(service.priceGross)) \(service.currency)")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.primary)
            }
            .padding(.vertical, 13)
        }
    }

    private func reviewSummaryLine(icon: String, label: String, value: String) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.secondary)
                    .frame(width: 26)
                Text(label)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Spacer(minLength: 8)
                Text(value)
                    .font(.subheadline)
                    .foregroundColor(.primary)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.vertical, 12)
            Divider()
        }
    }

    private func stepDisplayTitle(_ step: BookFlowStep) -> String {
        if step == .paymentReview, skipsOnlinePaymentMethods {
            return "Review"
        }
        return step.shortTitle
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
            HStack(spacing: 8) {
                if isSubmitting {
                    ProgressView().tint(.white)
                        .scaleEffect(0.9)
                }
                Text(primaryButtonTitle)
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundColor(Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(continueDisabled ? brandBlue.opacity(0.4) : brandBlue)
            .overlay(alignment: .trailing) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.trailing, 22)
            }
        }
        .buttonStyle(.plain)
        .disabled(continueDisabled)
    }

    private func moveBack() {
        let steps = visibleSteps
        guard let idx = steps.firstIndex(of: currentStep) else { return }
        if idx > 0 {
            currentStep = steps[idx - 1]
            return
        }
        if rescheduleContext != nil {
            onExit()
        }
    }

    private func canNavigate(to step: BookFlowStep) -> Bool {
        switch step {
        case .provider:
            return true
        case .service:
            return selectedProvider != nil
        case .employee:
            return selectedService != nil
        case .dateTime:
            return selectedService != nil && (!employeeStepEnabled || selectedConsultant != nil)
        case .paymentReview:
            return selectedSlot != nil
        }
    }

    private func handlePrimaryAction() {
        let steps = visibleSteps
        guard let idx = steps.firstIndex(of: currentStep) else { return }
        if rescheduleContext != nil && currentStep == .dateTime {
            guard let selectedSlot else { return }
            Task { await confirmReschedule(slot: selectedSlot) }
            return
        }
        if currentStep == .paymentReview {
            guard let selectedService, let selectedSlot else { return }
            Task { await confirmBooking(service: selectedService, slot: selectedSlot) }
            return
        }
        let nextIdx = idx + 1
        if nextIdx < steps.count {
            currentStep = steps[nextIdx]
        }
    }

    private func applyRescheduleContextIfNeeded() {
        guard let context = rescheduleContext else { return }
        guard providers.contains(where: { $0.id == context.companyId }) else { return }
        selectedProviderId = context.companyId
        if let service = store.serviceOptions.first(where: {
            $0.companyId == context.companyId && (($0.sessionTypeId == context.sessionTypeId && context.sessionTypeId != nil) || $0.name.caseInsensitiveCompare(context.sessionTypeName) == .orderedSame)
        }) {
            selectedServiceId = service.id
            selectedSlotId = nil
            currentStep = employeeStepEnabled ? .employee : .dateTime
        }
    }

    private func loadAvailability(for service: ServiceOptionModel) async {
        let steps = visibleSteps
        guard let currentIdx = steps.firstIndex(of: currentStep),
              let dateIdx = steps.firstIndex(of: .dateTime),
              currentIdx >= dateIdx else { return }
        do {
            isLoadingSlots = true
            slots = try await store.loadAvailability(
                companyId: service.companyId,
                sessionTypeId: service.sessionTypeId,
                date: selectedDate,
                consultantId: employeeStepEnabled ? selectedConsultantId : nil
            )
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

    private func loadConsultants(for service: ServiceOptionModel) async {
        isLoadingConsultants = true
        do {
            consultants = try await store.loadConsultants(companyId: service.companyId, sessionTypeId: service.sessionTypeId)
        } catch {
            consultants = []
            store.errorMessage = error.localizedDescription
        }
        isLoadingConsultants = false
    }

    private func confirmReschedule(slot: AvailabilitySlotModel) async {
        guard let context = rescheduleContext else { return }
        do {
            isSubmitting = true
            _ = try await store.rescheduleBooking(companyId: context.companyId, bookingId: context.bookingId, newSlotId: slot.id)
            isSubmitting = false
            notice = "Booking rescheduled successfully."
            onRescheduleCompleted()
        } catch {
            isSubmitting = false
            notice = error.localizedDescription
        }
    }

    private func confirmBooking(service: ServiceOptionModel, slot: AvailabilitySlotModel) async {
        do {
            isSubmitting = true
            let paymentApi = skipsOnlinePaymentMethods ? "PAY_AT_VENUE" : selectedPaymentMethod.apiValue
            let checkout = try await store.createOrder(
                companyId: service.companyId,
                productId: service.productId,
                slotId: slot.id,
                paymentMethod: paymentApi,
                consultantId: employeeStepEnabled ? selectedConsultantId : nil
            )
            isSubmitting = false

            if let checkoutUrl = checkout.checkoutUrl, let url = URL(string: checkoutUrl) {
                openURL(url)
                notice = selectedPaymentMethod == .payPal ? "PayPal opened." : "Payment page opened."
            } else if let bankTransfer = checkout.bankTransfer {
                notice = bankTransfer.instructions
            } else {
                notice = checkout.status == "PAID" ? "Booking confirmed successfully." : checkout.status
            }
            onBookingCompleted()
        } catch {
            isSubmitting = false
            notice = error.localizedDescription
        }
    }

    private var availabilityTaskKey: String {
        "\(selectedService?.id ?? "none")-\(DateFormatting.dayString(selectedDate))-\(selectedConsultantId ?? "any")"
    }

    private func priceString(_ value: Double) -> String {
        if value.rounded() == value { return String(Int(value)) }
        return String(format: "%.2f", value)
    }

    private func selectableRowCard(
        title: String,
        subtitle: String,
        selected: Bool,
        compact: Bool = false,
        extraCompact: Bool = false,
        trailing: AnyView? = nil
    ) -> some View {
        let pad: CGFloat = {
            if extraCompact { return 12 }
            return compact ? 14 : 18
        }()
        let radius: CGFloat = {
            if extraCompact { return 20 }
            return compact ? 22 : 28
        }()
        let indicatorSize: CGFloat = {
            if extraCompact { return 26 }
            return compact ? 28 : 34
        }()
        let titleFont: Font = {
            if extraCompact { return .system(size: 16, weight: .semibold) }
            return compact ? .system(size: 17, weight: .semibold) : .system(size: 22, weight: .semibold)
        }()
        let subtitleFont: Font = {
            if extraCompact { return .caption2 }
            return compact ? .caption : .title3
        }()

        return GuestSurfaceCard(background: Color(.systemBackground), contentPadding: pad, cornerRadius: radius) {
            HStack(spacing: (compact || extraCompact) ? 10 : 14) {
                selectionIndicator(selected: selected, size: indicatorSize)
                VStack(alignment: .leading, spacing: (compact || extraCompact) ? 2 : 4) {
                    Text(title)
                        .font(titleFont)
                        .foregroundColor(.primary)
                    Text(subtitle)
                        .font(subtitleFont)
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: (compact || extraCompact) ? 6 : 12)
                if let trailing {
                    trailing
                }
            }
        }
    }

    private func selectionIndicator(selected: Bool, size: CGFloat = 34) -> some View {
        ZStack {
            Circle()
                .stroke(selected ? brandBlue : Color.secondary.opacity(0.35), lineWidth: 2)
                .frame(width: size, height: size)
            if selected {
                Circle()
                    .fill(brandBlue)
                    .frame(width: size, height: size)
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.41, weight: .bold))
                    .foregroundColor(Color.white)
            }
        }
    }

    private func bookInfoPill(title: String) -> some View {
        Text(title)
            .font(.subheadline.weight(.medium))
            .foregroundColor(.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Capsule(style: .continuous).fill(Color(.secondarySystemBackground)))
    }

    private func bookInfoPillCompact(title: String) -> some View {
        Text(title)
            .font(.caption2.weight(.medium))
            .foregroundColor(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule(style: .continuous).fill(Color(.secondarySystemBackground)))
    }

    private func priceBadgeCompact(value: String) -> some View {
        Text(value)
            .font(.caption.weight(.semibold))
            .foregroundColor(.primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule(style: .continuous).fill(Color(.secondarySystemBackground)))
    }

    private func priceBadge(value: String) -> some View {
        Text(value)
            .font(.headline.weight(.semibold))
            .foregroundColor(.primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Capsule(style: .continuous).fill(Color(.secondarySystemBackground)))
    }

    private func paymentBrandBadge(_ title: String) -> some View {
        Text(title)
            .font(.caption2.weight(.bold))
            .foregroundColor(.secondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Rectangle().fill(Color(.secondarySystemBackground)))
    }

    private func paymentMethodCompactCard(
        title: String,
        subtitle: String?,
        selected: Bool,
        disabled: Bool,
        onSelect: @escaping () -> Void,
        trailing: AnyView?,
        onChevronTap: (() -> Void)?
    ) -> some View {
        GuestSurfaceCard(background: Color(.systemBackground), contentPadding: 12, cornerRadius: 20) {
            HStack(alignment: .center, spacing: 10) {
                Button {
                    guard !disabled else { return }
                    onSelect()
                } label: {
                    HStack(spacing: 10) {
                        selectionIndicator(selected: selected, size: 26)
                            .opacity(disabled ? 0.45 : 1)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(title)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(disabled ? Color.secondary : Color.primary)
                            if let subtitle, !subtitle.isEmpty {
                                Text(subtitle)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                    .lineLimit(2)
                            }
                        }
                        Spacer(minLength: 4)
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
                            .foregroundColor(.secondary)
                            .padding(6)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private enum BookFlowStep: Int, CaseIterable, Identifiable {
    case provider = 1
    case service = 2
    case employee = 3
    case dateTime = 4
    case paymentReview = 5

    var id: Int { rawValue }

    var shortTitle: String {
        switch self {
        case .provider: return "Provider"
        case .service: return "Service"
        case .employee: return "Employee"
        case .dateTime: return "Date & time"
        case .paymentReview: return "Payment & review"
        }
    }
}

private enum GuestBookingPaymentChoice: String {
    case card
    case bankTransfer
    case entitlement
    case payPal
    case giftCard

    var apiValue: String {
        switch self {
        case .card: return "CARD"
        case .bankTransfer: return "BANK_TRANSFER"
        case .entitlement: return "ENTITLEMENT"
        case .payPal: return "PAYPAL"
        case .giftCard: return "GIFT_CARD"
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
                        .foregroundColor(.secondary)
                } else {
                    ForEach(cards, id: \.self) { card in
                        Button {
                            selectedCard = card
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(card)
                                        .foregroundColor(.primary)
                                    Text("Stored on this device")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                if selectedCard == card {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(Color.primary)
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

extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

extension Optional where Wrapped == String {
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
    var compact: Bool = false

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
        VStack(spacing: compact ? 8 : 12) {
            HStack {
                Button {
                    if let d = calendar.date(byAdding: .month, value: -1, to: visibleMonth) {
                        visibleMonth = d
                    }
                } label: {
                    HStack(spacing: 2) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: compact ? 11 : 13, weight: .semibold))
                        Text(monthName(-1))
                            .font(compact ? .caption : .subheadline)
                    }
                    .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)

                Spacer()

                Text(monthTitle)
                    .font(compact ? .headline.weight(.semibold) : .title3.weight(.semibold))
                    .foregroundColor(.primary)

                Spacer()

                Button {
                    if let d = calendar.date(byAdding: .month, value: 1, to: visibleMonth) {
                        visibleMonth = d
                    }
                } label: {
                    HStack(spacing: 2) {
                        Text(monthName(1))
                            .font(compact ? .caption : .subheadline)
                        Image(systemName: "chevron.right")
                            .font(.system(size: compact ? 11 : 13, weight: .semibold))
                    }
                    .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 0) {
                ForEach(weekdaySymbols, id: \.self) { sym in
                    Text(sym)
                        .font(compact ? .caption2.weight(.medium) : .caption.weight(.medium))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: compact ? 4 : 6) {
                ForEach(Array(days.enumerated()), id: \.offset) { _, dateOrNil in
                    if let date = dateOrNil {
                        let isSelected = calendar.isDate(date, inSameDayAs: selectedDate)
                        let isPast = calendar.startOfDay(for: date) < calendar.startOfDay(for: Date())
                        let circle: CGFloat = compact ? 30 : 36
                        let rowHeight: CGFloat = compact ? 32 : 38
                        Button {
                            if !isPast {
                                selectedDate = date
                            }
                        } label: {
                            ZStack {
                                if isSelected {
                                    Rectangle()
                                        .fill(brandBlue)
                                        .frame(width: circle, height: circle)
                                }
                                Text("\(calendar.component(.day, from: date))")
                                    .font(.system(size: compact ? 14 : 16, weight: isSelected ? .semibold : .regular))
                                    .foregroundColor(
                                        isSelected
                                        ? Color.white
                                        : (isPast ? Color.secondary.opacity(0.5) : Color.primary)
                                    )
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: rowHeight)
                        }
                        .buttonStyle(.plain)
                        .disabled(isPast)
                    } else {
                        Color.clear.frame(height: compact ? 32 : 38)
                    }
                }
            }
        }
    }
}
