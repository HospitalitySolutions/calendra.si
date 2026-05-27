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
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }
    private func tr(_ en: String, _ sl: String) -> String { isSl ? sl : en }

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
    @State private var timePageIndex = 0
    @State private var selectedPaymentMethod: GuestBookingPaymentChoice = .card
    @State private var isLoadingSlots = false
    @State private var isSubmitting = false
    @State private var notice: String?
    @State private var storedProfile = StoredGuestProfile(firstName: "", lastName: "", email: "", phone: "", language: "en", cards: [])
    @State private var selectedStoredCard: String?
    @State private var showingStoredCardSheet = false
    @State private var showingPaymentMethodsSheet = false
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
        selectedProvider?.billingEnabled == false || !(selectedProvider?.requireOnlinePayment ?? true)
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
        if selectedProvider?.billingEnabled == false { return false }
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
        if rescheduleContext != nil && currentStep == .dateTime { return tr("Confirm reschedule", "Potrdi prestavitev") }
        return currentStep == .paymentReview ? tr("Confirm booking", "Potrdi rezervacijo") : tr("Continue", "Nadaljuj")
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
        ZStack {
            bookingBackground
            VStack(spacing: 0) {
                header
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        stepContent
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 18)
                    .padding(.bottom, 16)
                }

                VStack(spacing: 0) {
                    Divider().opacity(0.35)
                    if currentStep == .paymentReview, let service = selectedService {
                        if !skipsOnlinePaymentMethods {
                            selectedPaymentMethodCard
                                .padding(.horizontal, 20)
                                .padding(.top, 8)
                        }
                        paymentTotalRow(service: service)
                            .padding(.horizontal, 20)
                            .padding(.top, 8)
                            .padding(.bottom, 2)
                    }
                    primaryActionButton
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                        .padding(.bottom, 8)
                }
                .background(Color(.systemBackground).opacity(0.94))
            }
        }
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
                languageCode: appUiLocaleStorage,
                cards: storedProfile.cards,
                selectedCard: $selectedStoredCard,
                onAddNewCard: {
                    showingStoredCardSheet = false
                    showingAddCardSheet = true
                }
            )
        }
        .sheet(isPresented: $showingPaymentMethodsSheet) {
            PaymentMethodPickerSheet(
                languageCode: appUiLocaleStorage,
                options: paymentMethodPickerOptions,
                selectedMethod: selectedPaymentMethod,
                onSelect: { method in
                    selectedPaymentMethod = method
                    showingPaymentMethodsSheet = false
                    if method == .card && storedProfile.cards.isEmpty {
                        showingAddCardSheet = true
                    }
                }
            )
        }
        .sheet(isPresented: $showingAddCardSheet) {
            AddCardSheet(languageCode: appUiLocaleStorage) { card in
                storedProfile.cards.append(card)
                LocalProfileStore.shared.save(storedProfile)
                selectedStoredCard = card
            }
        }
        .alert(tr("Booking update", "Posodobitev rezervacije"), isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button(tr("OK", "V redu"), role: .cancel) { notice = nil }
        } message: {
            Text(notice ?? "")
        }
    }

    private var header: some View {
        stepper
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .padding(.bottom, 4)
    }

    private var stepBackgroundImageName: String {
        switch currentStep {
        case .provider:
            return "BookStepProviderBackground"
        case .service:
            return "BookStepServiceBackground"
        case .employee:
            return "BookStepEmployeeBackground"
        case .dateTime:
            return "BookStepDateTimeBackground"
        case .paymentReview:
            return "BookStepPaymentReviewBackground"
        }
    }

    private var bookingBackground: some View {
        GeometryReader { proxy in
            Image(stepBackgroundImageName)
                .resizable()
                .scaledToFill()
                .frame(width: proxy.size.width, height: proxy.size.height)
                .clipped()
        }
        .ignoresSafeArea()
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
                    VStack(spacing: 3) {
                        ZStack {
                            HStack(spacing: 0) {
                                Rectangle()
                                    .fill(isFirst ? Color.clear : (leftActive ? Color(red: 0.05, green: 0.42, blue: 1.0) : Color(red: 0.84, green: 0.89, blue: 0.95)))
                                    .frame(height: 2)
                                Spacer().frame(width: 34)
                                Rectangle()
                                    .fill(isLast ? Color.clear : (rightActive ? Color(red: 0.05, green: 0.42, blue: 1.0) : Color(red: 0.84, green: 0.89, blue: 0.95)))
                                    .frame(height: 2)
                            }
                            Circle()
                                .fill(active || completed ? Color(red: 0.05, green: 0.42, blue: 1.0) : Color(red: 0.97, green: 0.98, blue: 1.0))
                                .frame(width: 34, height: 34)
                                .shadow(color: active ? brandBlue.opacity(0.22) : Color.clear, radius: 5, y: 3)
                                .overlay(
                                    Circle().stroke(active || completed ? Color.clear : Color(red: 0.84, green: 0.89, blue: 0.95), lineWidth: 1)
                                )
                                .overlay(
                                    Group {
                                        if completed {
                                            Image(systemName: "checkmark")
                                                .font(.system(size: 14, weight: .bold))
                                                .foregroundColor(Color.white)
                                        } else {
                                            Text("\(idx + 1)")
                                                .font(.system(size: 14, weight: .bold))
                                                .foregroundColor(active ? Color.white : Color.secondary)
                                        }
                                    }
                                )
                        }
                        .frame(height: 34)

                        Text(stepDisplayTitle(step))
                            .font(.system(size: 11, weight: active || completed ? .bold : .medium))
                            .foregroundColor(active || completed ? Color(red: 0.05, green: 0.42, blue: 1.0) : Color.secondary)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
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
            straightSectionHeader(tr("SELECT EMPLOYEE", "IZBERI ZAPOSLENEGA"))

            if isLoadingConsultants {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(tr("Loading employees…", "Nalaganje zaposlenih…"))
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 12)
            } else if consultants.isEmpty {
                emptyInlineMessage(tr("No employees available", "Ni razpoložljivih zaposlenih"), tr("This service has no bookable employees.", "Ta storitev nima zaposlenih, ki bi jih bilo mogoče rezervirati."))
            } else {
                VStack(spacing: 12) {
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
            straightSectionHeader(tr("SELECT PROVIDER", "IZBERI PONUDNIKA"))

            if providers.isEmpty {
                emptyInlineMessage(tr("No subscribed providers yet", "Ni povezanih ponudnikov"), tr("Join a tenancy first to start booking.", "Za začetek rezervacije se najprej povežite s ponudnikom."))
            } else {
                VStack(spacing: 12) {
                    ForEach(providers) { provider in
                        let subtitle = provider.companyAddress.nilIfBlank
                            ?? provider.city.nilIfBlank
                            ?? provider.description.nilIfBlank
                            ?? tr("Subscribed organization", "Povezana organizacija")

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
            straightSectionHeader(tr("SELECTED SERVICE", "IZBERI STORITEV"))

            if selectedProvider == nil {
                emptyInlineMessage(tr("Select a provider first", "Najprej izberite ponudnika"), tr("Choose a provider before selecting a service.", "Pred izbiro storitve izberite ponudnika."))
            } else if servicesForSelectedProvider.isEmpty {
                emptyInlineMessage(tr("No services available", "Ni razpoložljivih storitev"), tr("This provider does not currently expose any guest-app services.", "Ta ponudnik trenutno nima storitev za goste."))
            } else {
                VStack(spacing: 12) {
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

            if selectedService != nil {
                straightSectionHeader(tr("SELECT DATE", "IZBERI DATUM"))
                MonthCalendarView(
                    visibleMonth: $visibleMonth,
                    selectedDate: $selectedDate,
                    compact: true,
                    languageCode: appUiLocaleStorage
                )

                straightSectionHeader(tr("SELECT TIME", "IZBERI URO"))
                if isLoadingSlots {
                    ProgressView(tr("Loading available times…", "Nalaganje prostih terminov…"))
                        .padding(.vertical, 8)
                } else if slots.isEmpty {
                    Text(tr("No slots available on the selected date.", "Na izbrani datum ni prostih terminov."))
                        .foregroundColor(.secondary)
                        .padding(.bottom, 6)
                } else {
                    singleTimeSelector
                }
            } else {
                emptyInlineMessage(tr("Select a service first", "Najprej izberite storitev"), tr("Choose a service before selecting date and time.", "Pred izbiro datuma in ure izberite storitev."))
            }
        }
    }

    private var singleTimeSelector: some View {
        let pages = timeSlotPages
        let currentPage = min(max(timePageIndex, 0), max(pages.count - 1, 0))
        let pageSlots = pages.isEmpty ? [] : pages[currentPage]
        let canGoLeft = currentPage > 0
        let canGoRight = currentPage < max(pages.count - 1, 0)

        return ZStack {
            HStack(spacing: 7) {
                ForEach(0..<4, id: \.self) { index in
                    if index < pageSlots.count {
                        let slot = pageSlots[index]
                        Button {
                            selectedSlotId = slot.id
                        } label: {
                            Text(DateFormatting.prettyTime(slot.startsAt))
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(selectedSlotId == slot.id ? Color.white : Color(red: 0.05, green: 0.42, blue: 1.0))
                                .frame(maxWidth: .infinity)
                                .frame(height: 42)
                                .background(
                                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                                        .fill(selectedSlotId == slot.id ? Color(red: 0.05, green: 0.42, blue: 1.0) : Color(.systemBackground).opacity(0.96))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                                        .stroke(selectedSlotId == slot.id ? Color.clear : Color(red: 0.84, green: 0.89, blue: 0.95), lineWidth: 1)
                                )
                                .shadow(color: selectedSlotId == slot.id ? brandBlue.opacity(0.16) : Color.black.opacity(0.025), radius: selectedSlotId == slot.id ? 7 : 3, y: selectedSlotId == slot.id ? 4 : 2)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Color.clear
                            .frame(maxWidth: .infinity)
                            .frame(height: 42)
                    }
                }
            }
            .padding(.horizontal, 16)

            HStack {
                Button {
                    changeTimePage(-1)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundColor(canGoLeft ? Color(red: 0.05, green: 0.42, blue: 1.0) : Color(red: 0.62, green: 0.68, blue: 0.75).opacity(0.42))
                        .frame(width: 18, height: 42)
                }
                .buttonStyle(.plain)
                .opacity(canGoLeft ? 1 : 0.45)
                .disabled(!canGoLeft)
                .offset(x: -2)

                Spacer(minLength: 0)

                Button {
                    changeTimePage(1)
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundColor(canGoRight ? Color(red: 0.05, green: 0.42, blue: 1.0) : Color(red: 0.62, green: 0.68, blue: 0.75).opacity(0.42))
                        .frame(width: 18, height: 42)
                }
                .buttonStyle(.plain)
                .opacity(canGoRight ? 1 : 0.45)
                .disabled(!canGoRight)
                .offset(x: 2)
            }
        }
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { value in
                    if value.translation.width < -34 {
                        changeTimePage(1)
                    } else if value.translation.width > 34 {
                        changeTimePage(-1)
                    }
                }
        )
        .onAppear {
            if selectedSlotId == nil {
                selectedSlotId = slots.first?.id
            }
            syncTimePageToSelected()
        }
        .onChange(of: slots.map(\.id)) { _ in
            if slots.contains(where: { $0.id == selectedSlotId }) == false {
                selectedSlotId = slots.first?.id
            }
            syncTimePageToSelected()
        }
        .onChange(of: selectedSlotId) { _ in
            syncTimePageToSelected()
        }
        .padding(.vertical, 2)
    }

    private var timeSlotPages: [[AvailabilitySlotModel]] {
        stride(from: 0, to: slots.count, by: 4).map { start in
            Array(slots[start..<min(start + 4, slots.count)])
        }
    }

    private var selectedSlotIndex: Int? {
        guard let selectedSlotId else { return nil }
        return slots.firstIndex(where: { $0.id == selectedSlotId })
    }

    private func changeTimePage(_ delta: Int) {
        let pages = timeSlotPages
        guard !pages.isEmpty else { return }
        let nextPage = min(max(timePageIndex + delta, 0), pages.count - 1)
        guard nextPage != timePageIndex else { return }
        timePageIndex = nextPage
        if let firstVisible = pages[nextPage].first {
            selectedSlotId = firstVisible.id
        }
    }

    private func syncTimePageToSelected() {
        guard let index = selectedSlotIndex else {
            timePageIndex = 0
            return
        }
        timePageIndex = max(0, min(index / 4, max(timeSlotPages.count - 1, 0)))
    }

    private var paymentReviewStep: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let service = selectedService {
                reviewSummary(service: service)

                if skipsOnlinePaymentMethods {
                    emptyInlineMessage(tr("Pay at venue", "Plačilo na lokaciji"), tr("Payment is collected at the venue. Tap Confirm booking to reserve your slot.", "Plačilo se izvede na lokaciji. Tapnite Potrdi rezervacijo za rezervacijo termina."))
                }
            }
        }
    }

    private func bookOpenHero(title: String, subtitle: String, icon: String, accentIcon: String) -> some View {
        Color.clear
            .frame(height: 0)
            .accessibilityHidden(true)
    }

    private func straightSectionHeader(_ title: String) -> some View {
        HStack(spacing: 10) {
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .tracking(1.6)
                .foregroundColor(Color(red: 0.38, green: 0.45, blue: 0.55))
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(brandOrange.opacity(0.9))
                .frame(width: 24, height: 3)
            Spacer(minLength: 0)
        }
    }

    private func emptyInlineMessage(_ title: String, _ description: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(red: 0.03, green: 0.13, blue: 0.27))
            Text(description)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(Color(.systemBackground))
            .shadow(color: Color.black.opacity(0.07), radius: 12, y: 6)
    }

    private func squareIconTile(_ systemName: String, selected: Bool = true) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(
                    selected
                    ? LinearGradient(colors: [Color(red: 0.06, green: 0.43, blue: 1.0), brandBlue], startPoint: .topLeading, endPoint: .bottomTrailing)
                    : LinearGradient(colors: [Color(red: 0.92, green: 0.96, blue: 1.0), Color(red: 0.86, green: 0.92, blue: 1.0)], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
            Image(systemName: systemName)
                .font(.system(size: 26, weight: .bold))
                .foregroundColor(selected ? .white : brandBlue)
        }
        .frame(width: 60, height: 60)
    }

    private func selectionRail(_ selected: Bool) -> some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(selected ? Color(red: 0.05, green: 0.42, blue: 1.0) : Color.clear)
            .frame(width: 4, height: 74)
    }

    private func providerLineRow(title: String, subtitle: String, selected: Bool) -> some View {
        HStack(spacing: 12) {
            selectionRail(selected)
            squareIconTile("dumbbell.fill", selected: selected)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(Color(red: 0.03, green: 0.13, blue: 0.27))
                Text(subtitle)
                    .font(.system(size: 15))
                    .foregroundColor(Color(red: 0.38, green: 0.45, blue: 0.55))
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(Color(red: 0.55, green: 0.61, blue: 0.69))
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(cardBackground)
        .contentShape(Rectangle())
    }

    private func serviceLineRow(service: ServiceOptionModel, selected: Bool) -> some View {
        HStack(alignment: .center, spacing: 12) {
            selectionRail(selected)
            squareIconTile("dumbbell.fill", selected: selected)
            VStack(alignment: .leading, spacing: 6) {
                Text(service.name)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(Color(red: 0.03, green: 0.13, blue: 0.27))
                Text(service.description.nilIfBlank ?? tr("Bookable service", "Storitev za rezervacijo"))
                    .font(.system(size: 15))
                    .foregroundColor(Color(red: 0.38, green: 0.45, blue: 0.55))
                HStack(spacing: 7) {
                    straightTag(service.tenantName)
                    if let durationMinutes = service.durationMinutes {
                        straightTag("\(durationMinutes) min")
                    }
                }
            }
            Spacer(minLength: 8)
            Text("\(priceString(service.priceGross)) \(service.currency)")
                .font(.system(size: 18, weight: .heavy))
                .foregroundColor(Color(red: 0.05, green: 0.42, blue: 1.0))
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(cardBackground)
        .contentShape(Rectangle())
    }

    private func consultantLineRow(title: String, subtitle: String, selected: Bool) -> some View {
        HStack(spacing: 12) {
            selectionRail(selected)
            squareIconTile("person.text.rectangle", selected: selected)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(Color(red: 0.03, green: 0.13, blue: 0.27))
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 15))
                        .foregroundColor(Color(red: 0.38, green: 0.45, blue: 0.55))
                }
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(Color(red: 0.55, green: 0.61, blue: 0.69))
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(cardBackground)
        .contentShape(Rectangle())
    }

    private func straightTag(_ title: String) -> some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundColor(Color(red: 0.05, green: 0.42, blue: 1.0))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color(red: 0.94, green: 0.97, blue: 1.0)))
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
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(disabled ? .secondary : Color(red: 0.03, green: 0.13, blue: 0.27))
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            if let trailing { trailing }
            Button {
                if let onChevronTap { onChevronTap() } else { onSelect() }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(Color(red: 0.55, green: 0.61, blue: 0.69))
                    .frame(width: 30, height: 34)
            }
            .buttonStyle(.plain)
            .disabled(disabled)
        }
        .padding(14)
        .background(cardBackground)
        .contentShape(Rectangle())
    }

    private var paymentMethodPickerOptions: [PaymentMethodPickerOption] {
        availablePaymentChoices.map { method in
            PaymentMethodPickerOption(
                method: method,
                title: paymentMethodTitle(method),
                subtitle: paymentMethodSubtitle(method),
                icon: paymentMethodIcon(method)
            )
        }
    }

    private var availablePaymentChoices: [GuestBookingPaymentChoice] {
        var choices: [GuestBookingPaymentChoice] = []
        if !matchingEntitlements.isEmpty { choices.append(.entitlement) }
        if isPaymentMethodAllowed(.giftCard), hasGiftCardCoverage { choices.append(.giftCard) }
        if isPaymentMethodAllowed(.card) { choices.append(.card) }
        if isPaymentMethodAllowed(.bankTransfer) { choices.append(.bankTransfer) }
        if isPaymentMethodAllowed(.payPal) { choices.append(.payPal) }
        return choices
    }

    private var selectedPaymentMethodCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(tr("PAYMENT METHOD", "NAČIN PLAČILA"))
                .font(.system(size: 11, weight: .bold))
                .tracking(1.0)
                .foregroundColor(Color(red: 0.38, green: 0.45, blue: 0.55))
            HStack(spacing: 9) {
                selectionIndicator(selected: true, size: 20)
                Image(systemName: paymentMethodIcon(selectedPaymentMethod))
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(Color(red: 0.05, green: 0.42, blue: 1.0))
                    .frame(width: 28, height: 22)
                Text(paymentMethodTitle(selectedPaymentMethod))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(red: 0.03, green: 0.13, blue: 0.27))
                Spacer(minLength: 8)
                Button(tr("Change", "Spremeni")) {
                    showingPaymentMethodsSheet = true
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(red: 0.05, green: 0.42, blue: 1.0))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(cardBackground)
    }

    private func paymentMethodTitle(_ method: GuestBookingPaymentChoice) -> String {
        switch method {
        case .card: return tr("Credit card", "Kreditna kartica")
        case .bankTransfer: return tr("Bank Transfer", "Bančno nakazilo")
        case .entitlement: return tr("Use pass or visit", "Uporabi karto ali obisk")
        case .payPal: return "PayPal"
        case .giftCard: return tr("Gift card", "Darilna kartica")
        }
    }

    private func paymentMethodIcon(_ method: GuestBookingPaymentChoice) -> String {
        switch method {
        case .card: return "creditcard.fill"
        case .bankTransfer: return "building.columns.fill"
        case .entitlement: return "ticket"
        case .payPal: return "p.square.fill"
        case .giftCard: return "giftcard"
        }
    }

    private func paymentMethodSubtitle(_ method: GuestBookingPaymentChoice) -> String? {
        switch method {
        case .card:
            return creditCardSubtitle
        case .bankTransfer:
            return nil
        case .entitlement:
            return matchingEntitlements.first.map { entitlement in
                let remaining = entitlement.remainingUses.map(String.init) ?? tr("Unlimited", "Neomejeno")
                return tr("\(entitlement.name) • \(remaining) left", "\(entitlement.name) • \(remaining) preostalo")
            } ?? tr("No valid pass or pack available", "Ni veljavne karte ali paketa")
        case .payPal:
            return tr("Approve securely in PayPal", "Varno potrdite v PayPalu")
        case .giftCard:
            if let giftCard = matchingGiftCards.first {
                let balanceText = giftCard.remainingValueGross.map { priceString($0) } ?? tr("available", "na voljo")
                let currencyText = giftCard.currency ?? selectedService?.currency ?? ""
                return "\(giftCard.name) • \(balanceText) \(currencyText)".trimmingCharacters(in: .whitespaces)
            }
            return tr("Use your gift card balance", "Uporabite dobroimetje darilne kartice")
        }
    }

    private func reviewSummary(service: ServiceOptionModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(tr("BOOKING SUMMARY", "POVZETEK REZERVACIJE"))
                .font(.system(size: 14, weight: .bold))
                .tracking(1.2)
                .foregroundColor(Color(red: 0.38, green: 0.45, blue: 0.55))
                .padding(.bottom, 6)
            if let provider = selectedProvider {
                reviewSummaryLine(icon: "building.2", label: tr("Provider", "Ponudnik"), value: provider.name)
            }
            reviewSummaryLine(icon: "dumbbell.fill", label: tr("Service", "Storitev"), value: service.name)
            if employeeStepEnabled, let consultant = selectedConsultant {
                reviewSummaryLine(icon: "person", label: tr("Employee", "Zaposleni"), value: consultant.fullName)
            }
            if let durationMinutes = service.durationMinutes {
                reviewSummaryLine(icon: "timer", label: tr("Duration", "Trajanje"), value: "\(durationMinutes) min")
            }
            if let slot = selectedSlot {
                reviewSummaryLine(icon: "calendar", label: tr("Date & time", "Datum in ura"), value: localizedPrettyRange(start: slot.startsAt, end: slot.endsAt))
            }
            if !skipsOnlinePaymentMethods && isDepositMode {
                reviewSummaryLine(icon: "creditcard", label: tr("Deposit", "Predplačilo"), value: "\(depositPercentValue)% · \(priceString(amountDueNow)) \(service.currency)")
            }
        }
        .padding(16)
        .background(cardBackground)
    }

    private func paymentTotalRow(service: ServiceOptionModel) -> some View {
        HStack(spacing: 14) {
            Text(tr("TOTAL", "SKUPAJ"))
                .font(.system(size: 14, weight: .bold))
                .tracking(1.2)
                .foregroundColor(Color(red: 0.38, green: 0.45, blue: 0.55))
            Spacer()
            Text("\(priceString(service.priceGross)) \(service.currency)")
                .font(.system(size: 22, weight: .heavy))
                .foregroundColor(Color(red: 0.03, green: 0.13, blue: 0.27))
        }
    }

    private func reviewSummaryLine(icon: String, label: String, value: String) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(Color(red: 0.05, green: 0.42, blue: 1.0))
                    .frame(width: 24)
                Text(label)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color(red: 0.03, green: 0.13, blue: 0.27))
                Spacer(minLength: 8)
                Text(value)
                    .font(.system(size: 15))
                    .foregroundColor(Color(red: 0.38, green: 0.45, blue: 0.55))
                    .multilineTextAlignment(.trailing)
            }
            .padding(.vertical, 10)
            Divider().opacity(0.45)
        }
    }

    private func stepDisplayTitle(_ step: BookFlowStep) -> String {
        if step == .paymentReview, skipsOnlinePaymentMethods {
            return tr("Review", "Pregled")
        }
        return step.localizedTitle(languageCode: appUiLocaleStorage)
    }

    private var creditCardSubtitle: String {
        if let card = selectedStoredCard, !card.isEmpty {
            return card
        }
        return storedProfile.cards.isEmpty
            ? tr("Add a card to pay by credit card", "Dodajte kartico za plačilo s kreditno kartico")
            : tr("Tap to choose a stored card", "Tapnite za izbiro shranjene kartice")
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
                    .font(.system(size: 17, weight: .bold))
            }
            .foregroundColor(Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(continueDisabled ? brandBlue.opacity(0.42) : Color(red: 0.05, green: 0.42, blue: 1.0))
            )
            .overlay(alignment: .trailing) {
                Image(systemName: "arrow.right")
                    .font(.system(size: 20, weight: .bold))
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
                selectedSlotId = slots.first?.id
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
            notice = tr("Booking rescheduled successfully.", "Rezervacija je bila uspešno prestavljena.")
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
                notice = selectedPaymentMethod == .payPal ? tr("PayPal opened.", "PayPal se je odprl.") : tr("Payment page opened.", "Stran za plačilo se je odprla.")
            } else if let bankTransfer = checkout.bankTransfer {
                notice = bankTransfer.instructions
            } else {
                notice = checkout.status == "PAID" ? tr("Booking confirmed successfully.", "Rezervacija je uspešno potrjena.") : checkout.status
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

    private func localizedPrettyRange(start: String, end: String) -> String {
        let parser = ISO8601DateFormatter()
        guard let startDate = parser.date(from: start), let endDate = parser.date(from: end) else {
            return start
        }
        let locale = Locale(identifier: isSl ? "sl_SI" : "en_US_POSIX")
        let dateFormatter = DateFormatter()
        dateFormatter.locale = locale
        dateFormatter.dateFormat = isSl ? "EEE, d. MMM HH:mm" : "EEE, d MMM HH:mm"
        let timeFormatter = DateFormatter()
        timeFormatter.locale = locale
        timeFormatter.dateFormat = "HH:mm"
        return "\(dateFormatter.string(from: startDate)) – \(timeFormatter.string(from: endDate))"
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

    func localizedTitle(languageCode: String) -> String {
        let sl = languageCode.lowercased().hasPrefix("sl")
        switch self {
        case .provider: return sl ? "Ponudnik" : "Provider"
        case .service: return sl ? "Storitev" : "Service"
        case .employee: return sl ? "Zaposleni" : "Employee"
        case .dateTime: return sl ? "Datum in ura" : "Date & time"
        case .paymentReview: return sl ? "Plačilo in pregled" : "Payment & review"
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

private struct PaymentMethodPickerOption: Identifiable {
    let method: GuestBookingPaymentChoice
    let title: String
    let subtitle: String?
    let icon: String

    var id: String { method.rawValue }
}

private struct PaymentMethodPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let languageCode: String
    private var isSl: Bool { languageCode.lowercased().hasPrefix("sl") }
    private func tr(_ en: String, _ sl: String) -> String { isSl ? sl : en }
    let options: [PaymentMethodPickerOption]
    let selectedMethod: GuestBookingPaymentChoice
    let onSelect: (GuestBookingPaymentChoice) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(options) { option in
                    Button {
                        onSelect(option.method)
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: option.icon)
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(Color(red: 0.05, green: 0.42, blue: 1.0))
                                .frame(width: 28)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(option.title)
                                    .foregroundColor(.primary)
                                if let subtitle = option.subtitle, !subtitle.isEmpty {
                                    Text(subtitle)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                        .lineLimit(2)
                                }
                            }
                            Spacer()
                            if selectedMethod == option.method {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(Color(red: 0.05, green: 0.42, blue: 1.0))
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .navigationTitle(tr("Payment method", "Način plačila"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Done", "Končano")) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct StoredCardPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let languageCode: String
    private var isSl: Bool { languageCode.lowercased().hasPrefix("sl") }
    private func tr(_ en: String, _ sl: String) -> String { isSl ? sl : en }
    let cards: [String]
    @Binding var selectedCard: String?
    let onAddNewCard: () -> Void

    var body: some View {
        NavigationStack {
            List {
                if cards.isEmpty {
                    Text(tr("No stored cards yet.", "Shranjenih kartic še ni."))
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
                                    Text(tr("Stored on this device", "Shranjeno na tej napravi"))
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
                        Label(tr("Add new card", "Dodaj novo kartico"), systemImage: "plus")
                    }
                }
            }
            .navigationTitle(tr("Stored cards", "Shranjene kartice"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(tr("Close", "Zapri")) { dismiss() }
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
    var languageCode: String = "en"
    private var isSl: Bool { languageCode.lowercased().hasPrefix("sl") }
    private let calendarBlue = Color(red: 0.05, green: 0.42, blue: 1.0)

    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        return cal
    }

    private var monthTitle: String {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: isSl ? "sl_SI" : "en_US_POSIX")
        fmt.dateFormat = "LLLL yyyy"
        return fmt.string(from: visibleMonth)
    }

    private func monthName(_ offset: Int) -> String {
        guard let d = calendar.date(byAdding: .month, value: offset, to: visibleMonth) else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: isSl ? "sl_SI" : "en_US_POSIX")
        fmt.dateFormat = "LLLL"
        return fmt.string(from: d)
    }

    private var weekdaySymbols: [String] {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: isSl ? "sl_SI" : "en_US_POSIX")
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
                                    Circle()
                                        .fill(calendarBlue)
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
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color(.systemBackground))
                .shadow(color: Color.black.opacity(0.07), radius: 12, y: 6)
        )
    }
}
