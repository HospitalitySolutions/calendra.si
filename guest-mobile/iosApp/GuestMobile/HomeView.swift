import SwiftUI
import UIKit

private enum HomeBookingTab: String, CaseIterable {
    case future = "Future"
    case past = "Past"
    case cancelled = "Cancelled"
}

private let homeBg = Color(red: 0.953, green: 0.957, blue: 0.973)
private let brandBlue = Color(red: 0.082, green: 0.408, blue: 0.957)
private let brandOrange = Color(red: 1.0, green: 0.616, blue: 0.106)
private let brandText = Color(red: 0.055, green: 0.145, blue: 0.345)
private let mutedText = Color(red: 0.424, green: 0.471, blue: 0.576)
private let softBorder = Color(red: 0.898, green: 0.918, blue: 0.953)

struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    let onChooseTenant: () -> Void
    let onOpenNotifications: () -> Void
    let onBookNow: () -> Void
    let onReschedule: (BookingCardModel) -> Void
    let onCancelBooking: (BookingCardModel) -> Void

    @State private var selectedBookingTab: HomeBookingTab = .future
    @State private var bookingPendingCancel: BookingCardModel?
    @State private var selectedPage: Int = 0
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }

    init(
        onChooseTenant: @escaping () -> Void = {},
        onOpenNotifications: @escaping () -> Void = {},
        onBookNow: @escaping () -> Void = {},
        onReschedule: @escaping (BookingCardModel) -> Void = { _ in },
        onCancelBooking: @escaping (BookingCardModel) -> Void = { _ in }
    ) {
        self.onChooseTenant = onChooseTenant
        self.onOpenNotifications = onOpenNotifications
        self.onBookNow = onBookNow
        self.onReschedule = onReschedule
        self.onCancelBooking = onCancelBooking
    }

    private var filteredBookingCards: [BookingCardModel] {
        let filtered = store.bookingCards.filter { $0.matches(tab: selectedBookingTab) }
        let sorted: [BookingCardModel]
        switch selectedBookingTab {
        case .future:
            sorted = filtered.sorted { ($0.startDate ?? .distantFuture) < ($1.startDate ?? .distantFuture) }
        case .past, .cancelled:
            sorted = filtered.sorted { ($0.startDate ?? .distantPast) > ($1.startDate ?? .distantPast) }
        }
        return Array(sorted.prefix(5))
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                bookingTabsRow
                    .padding(.horizontal, 24)
                if filteredBookingCards.isEmpty {
                    emptyBookingsCard
                        .padding(.horizontal, 24)
                } else {
                    bookingDeck
                }
            }
            .padding(.top, 18)
            .padding(.bottom, 104)
        }
        .background(homeBg.ignoresSafeArea())
        .scrollDisabled(true)
        .alert(isSl ? "Prekličem termin?" : "Cancel booking?", isPresented: Binding(
            get: { bookingPendingCancel != nil },
            set: { if !$0 { bookingPendingCancel = nil } }
        )) {
            Button(isSl ? "Obdrži termin" : "Keep booking", role: .cancel) { bookingPendingCancel = nil }
            Button(isSl ? "Prekliči termin" : "Cancel booking", role: .destructive) {
                if let booking = bookingPendingCancel {
                    bookingPendingCancel = nil
                    onCancelBooking(booking)
                }
            }
        } message: {
            if let booking = bookingPendingCancel {
                Text(isSl ? "S tem boste preklicali \(booking.title) dne \(bookingDate(booking.startsAt, isSl: isSl))." : "This will cancel \(booking.title) on \(bookingDate(booking.startsAt, isSl: isSl)).")
            }
        }
        .onChange(of: selectedBookingTab) { _ in selectedPage = 0 }
    }

    private var headerBlock: some View {
        let firstName = store.user.firstName.isEmpty ? "Alex" : store.user.firstName
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Image("CalendraBookLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 38)
                Spacer(minLength: 10)
                HStack(spacing: 10) {
                    Button(action: onChooseTenant) {
                        HStack(spacing: 8) {
                            Image(systemName: "person.badge.plus")
                                .font(.system(size: 14, weight: .medium))
                            Text(isSl ? "Dodaj ponudnika" : "Add tenant")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundColor(brandBlue)
                        .padding(.horizontal, 10)
                        .frame(height: 34)
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(brandBlue, lineWidth: 1.2)
                        )
                    }
                    .buttonStyle(.plain)

                    Button(action: onOpenNotifications) {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: "bell")
                                .font(.system(size: 19, weight: .medium))
                                .foregroundColor(brandText)
                                .frame(width: 34, height: 34)
                            Circle()
                                .fill(brandBlue)
                                .frame(width: 10, height: 10)
                                .offset(x: -2, y: 6)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.bottom, 14)
            Text(isSl ? "Pozdravljeni, \(firstName)" : "Hello, \(firstName)")
                .font(.system(size: 28, weight: .heavy))
                .foregroundColor(brandText)
            Text(isSl ? (store.bookingCards.isEmpty ? "Tukaj je, kaj sledi." : "Tukaj je vaš prihajajoči termin.") : (store.bookingCards.isEmpty ? "Here’s what’s next." : "Here’s your upcoming booking."))
                .font(.system(size: 12, weight: .regular))
                .foregroundColor(mutedText)
                .padding(.top, 6)
        }
    }

    private var bookingTabsRow: some View {
        HStack(spacing: 0) {
            ForEach(HomeBookingTab.allCases, id: \.self) { tab in
                let active = selectedBookingTab == tab
                Button {
                    selectedBookingTab = tab
                } label: {
                    VStack(spacing: 0) {
                        Text(tab.title(isSl: isSl))
                            .font(.system(size: 12, weight: active ? .bold : .medium))
                            .foregroundColor(active ? brandBlue : mutedText)
                            .padding(.top, 7)
                            .padding(.bottom, 6)
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(active ? brandBlue : Color.clear)
                            .frame(width: 72, height: 3)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(height: 50)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
                .shadow(color: .black.opacity(0.05), radius: 10, x: 0, y: 5)
        )
    }

    private var emptyBookingsCard: some View {
        let title: String = {
            switch selectedBookingTab {
            case .future: return isSl ? "Ni prihajajočih terminov" : "No upcoming bookings"
            case .past: return isSl ? "Ni preteklih terminov" : "No past bookings"
            case .cancelled: return isSl ? "Ni preklicanih terminov" : "No cancelled bookings"
            }
        }()
        let subtitle: String = {
            switch selectedBookingTab {
            case .future: return isSl ? "Trenutno nimate prihodnjih terminov." : "You’re all set — there are no future bookings right now."
            case .past: return isSl ? "Zaključeni obiski bodo prikazani tukaj." : "Completed visits will appear here."
            case .cancelled: return isSl ? "Preklicani termini bodo prikazani tukaj." : "Cancelled bookings will appear here."
            }
        }()

        return VStack(spacing: 0) {
            Group {
                switch selectedBookingTab {
                case .future:
                    Image("HomeEmptyIllustration")
                        .resizable()
                        .scaledToFit()
                case .past:
                    Image("HomeEmptyPastIllustration")
                        .resizable()
                        .scaledToFit()
                case .cancelled:
                    Image("HomeEmptyCancelledIllustration")
                        .resizable()
                        .scaledToFit()
                }
            }
            .padding(.top, 10)
            .padding(.horizontal, 10)

            Text(title)
                .font(.system(size: 22, weight: .heavy))
                .foregroundColor(brandText)
                .padding(.top, selectedBookingTab == .future ? 12 : 10)
            Text(subtitle)
                .font(.system(size: 13, weight: .regular))
                .foregroundColor(mutedText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 36)
                .padding(.top, 10)

            if selectedBookingTab == .future || selectedBookingTab == .cancelled {
                Button(action: onBookNow) {
                    Text(isSl ? "Rezerviraj zdaj" : "Book now")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(brandBlue)
                        )
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 28)
                .padding(.top, 22)
            }

            HStack(spacing: 10) {
                Image(systemName: "calendar")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(brandBlue)
                Text(isSl ? "Raziščite razpoložljive termine v zavihku Rezervacije." : "Explore available sessions from the Book tab.")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(mutedText)
            }
            .padding(.top, 18)
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(Color.white)
                .shadow(color: .black.opacity(0.05), radius: 12, x: 0, y: 5)
        )
    }

    private var bookingDeck: some View {
        VStack(spacing: 12) {
            TabView(selection: $selectedPage) {
                ForEach(Array(filteredBookingCards.enumerated()), id: \.element.id) { index, booking in
                    HomeBookingCard(
                        booking: booking,
                        onCall: openPhone,
                        onMessage: openMessage,
                        onReschedule: onReschedule,
                        onCancel: { bookingPendingCancel = booking },
                        isSl: isSl
                    )
                    .padding(.horizontal, 24)
                    .tag(index)
                }
            }
            .frame(height: 760)
            .tabViewStyle(.page(indexDisplayMode: .never))

            HStack(spacing: 10) {
                ForEach(filteredBookingCards.indices, id: \.self) { index in
                    Circle()
                        .fill(index == selectedPage ? brandBlue : Color(red: 0.792, green: 0.816, blue: 0.855))
                        .frame(width: index == selectedPage ? 10 : 8, height: index == selectedPage ? 10 : 8)
                }
            }
        }
    }

    private func openPhone(_ phone: String?) {
        guard let url = phone.flatMap(phoneURL) else { return }
        UIApplication.shared.open(url)
    }

    private func openMessage(_ phone: String?) {
        guard let url = phone.flatMap(smsURL) else { return }
        UIApplication.shared.open(url)
    }

    private func phoneURL(_ phone: String) -> URL? {
        let cleaned = phone.filter { !$0.isWhitespace }
        guard !cleaned.isEmpty else { return nil }
        return URL(string: "tel://\(cleaned)")
    }

    private func smsURL(_ phone: String) -> URL? {
        let cleaned = phone.filter { !$0.isWhitespace }
        guard !cleaned.isEmpty else { return nil }
        return URL(string: "sms://\(cleaned)")
    }
}

private struct HomeBookingCard: View {
    let booking: BookingCardModel
    let onCall: (String?) -> Void
    let onMessage: (String?) -> Void
    let onReschedule: (BookingCardModel) -> Void
    let onCancel: () -> Void
    let isSl: Bool

    @State private var showActionSheet: Bool = false

    var body: some View {
        ZStack(alignment: .bottom) {
            cardContent

            if showActionSheet {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { showActionSheet = false }
                bookingActionSheet
                    .padding(.horizontal, 6)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .zIndex(2)
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: showActionSheet)
    }

    private var cardContent: some View {
        VStack(spacing: 0) {
            heroHeader
            dateTimeStrip
            detailsAndActions
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(Color.white)
                .shadow(color: .black.opacity(0.06), radius: 14, x: 0, y: 8)
        )
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
    }

    private var heroHeader: some View {
        ZStack(alignment: .bottomLeading) {
            Group {
                if let url = booking.cardImageUrl, let imageURL = URL(string: url) {
                    AsyncImage(url: imageURL) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Image("GymBookingBackground").resizable().scaledToFill()
                    }
                } else {
                    Image("GymBookingBackground")
                        .resizable()
                        .scaledToFill()
                }
            }
            .frame(height: 238)
            .clipped()
            .overlay(
                LinearGradient(
                    colors: [.black.opacity(0.15), .black.opacity(0.54)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )

            VStack(spacing: 0) {
                HStack(alignment: .top) {
                    blueHeroBadge(title: isSl ? "Naslednji termin" : "Next booking")
                    Spacer()
                    statusPill
                }
                .padding(14)

                Spacer()

                HStack(alignment: .center, spacing: 16) {
                    logoBubble
                    VStack(alignment: .leading, spacing: 5) {
                        Text(booking.title)
                            .font(.system(size: 26, weight: .heavy))
                            .foregroundColor(.white)
                            .lineLimit(2)
                        Text(booking.tenantName)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(.white.opacity(0.92))
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
            }
        }
        .frame(height: 238)
    }

    private var logoBubble: some View {
        ZStack {
            Circle()
                .fill(brandText.opacity(0.82))
                .overlay(Circle().stroke(Color.white.opacity(0.36), lineWidth: 1))
                .frame(width: 82, height: 82)
            Group {
                if let url = booking.logoImageUrl, let imageURL = URL(string: url) {
                    AsyncImage(url: imageURL) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        fitLabFallbackLogo
                    }
                    .padding(12)
                } else {
                    fitLabFallbackLogo
                }
            }
            .frame(width: 82, height: 82)
        }
    }

    private var fitLabFallbackLogo: some View {
        VStack(spacing: -1) {
            Text("FIT")
            Text("LAB")
        }
        .font(.system(size: 22, weight: .heavy))
        .foregroundColor(.white)
        .multilineTextAlignment(.center)
    }

    private func blueHeroBadge(title: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "calendar")
                .font(.system(size: 14, weight: .bold))
            Text(title)
                .font(.system(size: 12, weight: .bold))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .frame(height: 36)
        .background(Capsule(style: .continuous).fill(brandBlue))
    }

    private var statusPill: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 17, weight: .bold))
            Text(bookingStatus(booking.status, isSl: isSl))
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundColor(Color(red: 0.129, green: 0.588, blue: 0.325))
        .padding(.horizontal, 14)
        .frame(height: 36)
        .background(Capsule(style: .continuous).fill(Color(red: 0.898, green: 0.973, blue: 0.910)))
    }

    private var dateTimeStrip: some View {
        HStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "calendar")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(brandBlue)
                Text(bookingDateCompact(booking.startsAt, isSl: isSl))
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundColor(brandText)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Rectangle()
                .fill(Color(red: 0.796, green: 0.843, blue: 0.918))
                .frame(width: 1, height: 42)

            HStack(spacing: 12) {
                Image(systemName: "clock")
                    .font(.system(size: 25, weight: .bold))
                    .foregroundColor(brandBlue)
                Text(bookingTimeRange(start: booking.startsAt, end: booking.endsAt, isSl: isSl))
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundColor(brandText)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 18)
        }
        .padding(.horizontal, 20)
        .frame(height: 74)
        .background(Color(red: 0.918, green: 0.949, blue: 1.0))
    }

    private var detailsAndActions: some View {
        VStack(spacing: 0) {
            infoLine(icon: "person.fill", label: isSl ? "ZAPOSLENI" : "EMPLOYEE", value: booking.consultantName?.isEmpty == false ? booking.consultantName! : (isSl ? "Bo potrjeno" : "To be confirmed"))
            Divider().overlay(softBorder).padding(.leading, 46).padding(.vertical, 9)
            infoLine(icon: "location.fill", label: isSl ? "LOKACIJA" : "LOCATION", value: bookingLocationLine(booking: booking, isSl: isSl))
            Divider().overlay(softBorder).padding(.leading, 46).padding(.vertical, 9)
            infoLine(icon: "building.2.fill", label: isSl ? "PONUDNIK" : "TENANT", value: booking.tenantName)

            Button {
                showActionSheet = true
            } label: {
                fullWidthActionLabel(title: "Contact", systemName: "phone.connection", filled: true)
            }
            .buttonStyle(.plain)
            .padding(.top, 16)

            Button {
                showActionSheet = true
            } label: {
                fullWidthActionLabel(title: isSl ? "Upravljaj rezervacijo" : "Manage reservation", systemName: "bell", filled: false)
            }
            .buttonStyle(.plain)
            .padding(.top, 10)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.white)
    }

    private func infoLine(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 26, weight: .medium))
                .foregroundColor(Color(red: 0.435, green: 0.490, blue: 0.569))
                .frame(width: 32, height: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(mutedText)
                Text(value)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(brandText)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
    }

    private func fullWidthActionLabel(title: String, systemName: String, filled: Bool) -> some View {
        HStack(spacing: 8) {
            Spacer()
            Image(systemName: systemName)
                .font(.system(size: 19, weight: .semibold))
            Text(title)
                .font(.system(size: 14, weight: .bold))
            Image(systemName: "chevron.down")
                .font(.system(size: 15, weight: .bold))
            Spacer()
        }
        .foregroundColor(filled ? .white : brandBlue)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .background(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(filled ? brandBlue : Color.white)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(brandBlue, lineWidth: 1)
        )
    }

    private var bookingActionSheet: some View {
        VStack(alignment: .leading, spacing: 0) {
            Capsule(style: .continuous)
                .fill(Color(red: 0.847, green: 0.871, blue: 0.910))
                .frame(width: 52, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 14)

            Text("CONTACT")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(mutedText)
                .padding(.bottom, 10)

            HStack(spacing: 12) {
                sheetButton(title: "Call", systemName: "phone", color: brandBlue, disabled: booking.tenantPhone?.isEmpty != false) {
                    onCall(booking.tenantPhone)
                    showActionSheet = false
                }
                sheetButton(title: "SMS", systemName: "message", color: brandBlue, disabled: booking.tenantPhone?.isEmpty != false) {
                    onMessage(booking.tenantPhone)
                    showActionSheet = false
                }
            }

            Divider().overlay(softBorder).padding(.vertical, 16)

            Text("RESERVATION OPTIONS")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(mutedText)
                .padding(.bottom, 10)

            HStack(spacing: 12) {
                sheetButton(title: "Reschedule", systemName: "calendar.badge.clock", color: brandBlue, disabled: !booking.canManage) {
                    onReschedule(booking)
                    showActionSheet = false
                }
                sheetButton(title: "Cancel booked session", systemName: "trash", color: .red, disabled: !booking.canManage) {
                    onCancel()
                    showActionSheet = false
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 20)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color.white)
                .shadow(color: .black.opacity(0.12), radius: 20, x: 0, y: -6)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(softBorder, lineWidth: 1)
        )
    }

    private func sheetButton(title: String, systemName: String, color: Color, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: systemName)
                    .font(.system(size: 20, weight: .semibold))
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.74)
            }
            .foregroundColor(disabled ? mutedText.opacity(0.45) : color)
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(softBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}

private extension BookingCardModel {
    func matches(tab: HomeBookingTab) -> Bool {
        switch tab {
        case .future:
            return !isCancelled && (startDate ?? .distantFuture) >= Date()
        case .past:
            return !isCancelled && (startDate ?? .distantPast) < Date()
        case .cancelled:
            return isCancelled
        }
    }

    var isCancelled: Bool {
        status.lowercased().contains("cancel") || status.uppercased() == "NO_SHOW"
    }

    var startDate: Date? {
        parseBookingDate(startsAt)
    }

    var canManage: Bool {
        !isCancelled && (startDate ?? .distantFuture) >= Date()
    }
}

private extension HomeBookingTab {
    func title(isSl: Bool) -> String {
        switch self {
        case .future: return isSl ? "Prihodnji" : "Future"
        case .past: return isSl ? "Pretekli" : "Past"
        case .cancelled: return isSl ? "Preklicani" : "Cancelled"
        }
    }
}

private func bookingStatus(_ raw: String, isSl: Bool) -> String {
    let normalized = raw.replacingOccurrences(of: "_", with: " ").lowercased()
    guard isSl else { return normalized.capitalized }
    if normalized.contains("cancel") { return "Preklicano" }
    if normalized == "no show" { return "Ni prišel" }
    if normalized.contains("confirm") || normalized.contains("book") || normalized.contains("scheduled") { return "Potrjeno" }
    if normalized.contains("pending") { return "V čakanju" }
    if normalized.contains("complete") || normalized.contains("finished") { return "Zaključeno" }
    return normalized.capitalized
}

private func bookingDateCompact(_ raw: String, isSl: Bool) -> String {
    guard let date = parseBookingDate(raw) else { return raw }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: isSl ? "sl_SI" : "en_US_POSIX")
    formatter.dateFormat = isSl ? "EEE, d. MMM" : "EEE, MMM d"
    var text = formatter.string(from: date).replacingOccurrences(of: ".,", with: ",")
    if let first = text.first {
        text.replaceSubrange(text.startIndex...text.startIndex, with: String(first).uppercased(with: formatter.locale))
    }
    return text
}

private func bookingTimeRange(start: String, end: String?, isSl: Bool) -> String {
    guard let startDate = parseBookingDate(start) else { return isSl ? "Ura še ni potrjena" : "Time to be confirmed" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: isSl ? "sl_SI" : "en_US_POSIX")
    formatter.dateFormat = isSl ? "HH:mm" : "h:mm a"
    guard let end, let endDate = parseBookingDate(end) else { return formatter.string(from: startDate) }
    return "\(formatter.string(from: startDate))–\(formatter.string(from: endDate))"
}

private func bookingLocationLine(booking: BookingCardModel, isSl: Bool) -> String {
    if let city = booking.tenantCity, !city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return city
    }
    return isSl ? "Lokacija še ni potrjena" : "Location to be confirmed"
}

private func bookingDate(_ raw: String, isSl: Bool) -> String {
    guard let date = parseBookingDate(raw) else { return raw }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: isSl ? "sl_SI" : "en_US_POSIX")
    formatter.dateFormat = isSl ? "d. MMM yyyy" : "MMM d, yyyy"
    return formatter.string(from: date)
}

private func bookingTime(_ raw: String, isSl: Bool) -> String {
    guard let date = parseBookingDate(raw) else { return isSl ? "Ura še ni potrjena" : "Time to be confirmed" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: isSl ? "sl_SI" : "en_US_POSIX")
    formatter.dateFormat = isSl ? "HH:mm" : "h:mm a"
    return formatter.string(from: date)
}

private func parseBookingDate(_ raw: String) -> Date? {
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = iso.date(from: raw) { return date }
    let iso2 = ISO8601DateFormatter()
    if let date = iso2.date(from: raw) { return date }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    return formatter.date(from: raw)
}
