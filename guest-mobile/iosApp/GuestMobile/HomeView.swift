import SwiftUI
import UIKit

private enum HomeBookingTab: String, CaseIterable {
    case future = "Future"
    case past = "Past"
    case cancelled = "Cancelled"
}

struct HomeView: View {
    @EnvironmentObject private var store: AppStore
    let onChooseTenant: () -> Void
    let onOpenNotifications: () -> Void
    let onBookNow: () -> Void
    let onReschedule: (BookingCardModel) -> Void
    let onCancelBooking: (BookingCardModel) -> Void
    @State private var selectedBookingTab: HomeBookingTab = .future
    @State private var bookingPendingCancel: BookingCardModel?

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
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                homeHeader
                    .padding(.horizontal, 24)

                if store.bookingCards.isEmpty {
                    emptyBookingHero
                } else {
                    bookingTabsRow
                        .padding(.horizontal, 24)

                    if filteredBookingCards.isEmpty {
                        emptyFilteredBookingsCard
                            .padding(.horizontal, 24)
                    } else {
                        UpcomingBookingsDeck(
                            bookings: filteredBookingCards,
                            onCall: openPhone,
                            onMessage: openMessage,
                            onReschedule: onReschedule,
                            onCancelBooking: { bookingPendingCancel = $0 }
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.horizontal, 20)
                    }
                }
            }
            .padding(.top, 10)
            .padding(.bottom, 104)
        }
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.96, green: 0.98, blue: 1.00),
                    Color(red: 0.91, green: 0.95, blue: 1.00),
                    Color.white
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        .scrollDisabled(true)
        .alert("Cancel booking?", isPresented: Binding(
            get: { bookingPendingCancel != nil },
            set: { if !$0 { bookingPendingCancel = nil } }
        )) {
            Button("Keep booking", role: .cancel) { bookingPendingCancel = nil }
            Button("Cancel booking", role: .destructive) {
                if let booking = bookingPendingCancel {
                    bookingPendingCancel = nil
                    onCancelBooking(booking)
                }
            }
        } message: {
            if let booking = bookingPendingCancel {
                Text("This will cancel \(booking.title) on \(bookingDate(booking.startsAt)).")
            }
        }
    }

    private var homeHeader: some View {
        HStack(alignment: .center, spacing: 14) {
            Text("Hello, \(store.user.firstName.isEmpty ? "there" : store.user.firstName)")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            Spacer(minLength: 8)
            HStack(spacing: 10) {
                Button(action: onChooseTenant) {
                    HStack(spacing: 6) {
                        Image(systemName: "building.2")
                            .font(.system(size: 15, weight: .semibold))
                        Text("Add tenant")
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                    }
                    .foregroundColor(Color(red: 0.02, green: 0.11, blue: 0.21))
                    .padding(.horizontal, 10)
                    .frame(height: 34)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(Color.white)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(Color(red: 0.83, green: 0.87, blue: 0.93), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                Button(action: onOpenNotifications) {
                    Image(systemName: "bell")
                        .font(.system(size: 19, weight: .medium))
                        .foregroundColor(.primary)
                        .frame(width: 34, height: 34)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(minHeight: 52)
    }

    private var bookingTabsRow: some View {
        HStack(spacing: 8) {
            ForEach(HomeBookingTab.allCases, id: \.self) { tab in
                Button {
                    selectedBookingTab = tab
                } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                        .foregroundColor(selectedBookingTab == tab ? .white : .primary)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(selectedBookingTab == tab ? brandBlue : Color.white.opacity(0.62))
                        .overlay(
                            Rectangle()
                                .stroke(selectedBookingTab == tab ? brandBlue : Color(red: 0.83, green: 0.87, blue: 0.93), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var emptyFilteredBookingsCard: some View {
        let title: String = {
            switch selectedBookingTab {
            case .future: return "No future bookings"
            case .past: return "No past bookings"
            case .cancelled: return "No cancelled bookings"
            }
        }()
        let subtitle: String = {
            switch selectedBookingTab {
            case .future: return "Book your next visit from the Book tab."
            case .past: return "Completed visits will appear here."
            case .cancelled: return "Cancelled bookings will appear here."
            }
        }()
        return HStack(spacing: 12) {
            Image(systemName: "calendar")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(brandBlue)
                .frame(width: 28, height: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.primary)
                Text(subtitle)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(.secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 22)
        .frame(maxWidth: .infinity)
        .background(
            Rectangle()
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.08), radius: 14, x: 0, y: 8)
        )
        .overlay(Rectangle().stroke(Color.white.opacity(0.88), lineWidth: 1.1))
    }

    private var emptyBookingHero: some View {
        Button(action: onBookNow) {
            Image("HomeBookingBackground")
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .aspectRatio(941.0 / 965.0, contentMode: .fit)
                .clipped()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }


    private var brandBlue: Color { Color(red: 0.02, green: 0.41, blue: 0.96) }

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

    private func formatDateTime(_ raw: String) -> String {
        DateFormatting.prettyDateTime(raw)
    }
}

private struct UpcomingBookingsDeck: View {
    let bookings: [BookingCardModel]
    let onCall: (String?) -> Void
    let onMessage: (String?) -> Void
    let onReschedule: (BookingCardModel) -> Void
    let onCancelBooking: (BookingCardModel) -> Void
    @State private var activeIndex = 0

    private var brandBlue: Color { Color(red: 0.02, green: 0.41, blue: 0.96) }

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                ForEach(visibleLayers, id: \.layerKey) { layer in
                    if layer.offset == 0 {
                        BookingFocusCard(
                            booking: layer.booking,
                            onCall: { onCall(layer.booking.tenantPhone) },
                            onMessage: { onMessage(layer.booking.tenantPhone) },
                            onReschedule: onReschedule,
                            onCancelBooking: { onCancelBooking(layer.booking) }
                        )
                        .frame(width: 304, height: 486)
                        .zIndex(10)
                        .transition(.scale.combined(with: .opacity))
                    } else {
                        BookingSideCard(booking: layer.booking)
                            .frame(width: 132, height: 430)
                            .scaleEffect(layer.offset.magnitude == 1 ? 0.93 : 0.84)
                            .opacity(layer.offset.magnitude == 1 ? 0.88 : 0.52)
                            .offset(x: CGFloat(layer.offset) * 154, y: layer.offset.magnitude == 1 ? 8 : 16)
                            .zIndex(Double(5 - layer.offset.magnitude))
                    }
                }
            }
            .frame(height: 506)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 18)
                    .onEnded { value in
                        guard bookings.count > 1 else { return }
                        withAnimation(.spring(response: 0.36, dampingFraction: 0.86)) {
                            if value.translation.width < -36 {
                                activeIndex = (activeIndex + 1) % bookings.count
                            } else if value.translation.width > 36 {
                                activeIndex = (activeIndex - 1 + bookings.count) % bookings.count
                            }
                        }
                    }
            )

            HStack(spacing: 10) {
                ForEach(0..<bookings.count, id: \.self) { index in
                    Circle()
                        .fill(index == activeIndex ? brandBlue : Color(.separator).opacity(0.58))
                        .frame(width: index == activeIndex ? 9 : 7, height: index == activeIndex ? 9 : 7)
                }
            }

        }
    }

    private var visibleLayers: [BookingLayer] {
        guard !bookings.isEmpty else { return [] }
        let offsets = bookings.count == 1 ? [0] : [-2, -1, 0, 1, 2]
        return offsets.compactMap { offset in
            if bookings.count < 3 && abs(offset) > 1 { return nil }
            let index = (activeIndex + offset + bookings.count) % bookings.count
            return BookingLayer(offset: offset, booking: bookings[index], index: index)
        }
    }
}

private struct BookingLayer: Hashable {
    let offset: Int
    let booking: BookingCardModel
    let index: Int

    var layerKey: String { "\(booking.id)-\(offset)-\(index)" }
}

private struct BookingFocusCard: View {
    let booking: BookingCardModel
    let onCall: () -> Void
    let onMessage: () -> Void
    let onReschedule: (BookingCardModel) -> Void
    let onCancelBooking: () -> Void
    private let brandBlue = Color(red: 0.02, green: 0.41, blue: 0.96)
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BookingHero(
                tenantName: booking.tenantName,
                cardImageUrl: booking.cardImageUrl,
                logoImageUrl: booking.logoImageUrl,
                iconImageUrl: booking.iconImageUrl
            )
            VStack(alignment: .leading, spacing: 8) {
                Text(booking.title)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                statusPill
                Divider().opacity(0.42)
                BookingInfoRow(systemName: "calendar", text: bookingDate(booking.startsAt))
                BookingInfoRow(systemName: "clock", text: bookingTime(booking.startsAt))
                BookingInfoRow(systemName: "dumbbell", text: booking.tenantName)
                BookingInfoRow(systemName: "person", text: booking.consultantName?.isEmpty == false ? booking.consultantName! : "with your specialist")
                BookingInfoRow(systemName: "location", text: booking.tenantCity?.isEmpty == false ? booking.tenantCity! : "Location to be confirmed")

                Spacer(minLength: 0)

                HStack(spacing: 10) {
                    ContactActionButton(title: "Call", systemName: "phone", enabled: booking.tenantPhone?.isEmpty == false, action: onCall)
                    ContactActionButton(title: "SMS", systemName: "message", enabled: booking.tenantPhone?.isEmpty == false, action: onMessage)
                }
                .padding(.top, 2)

                Button(action: { onReschedule(booking) }) {
                    HStack(spacing: 7) {
                        Image(systemName: "calendar")
                        Text("Reschedule")
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(booking.canBeCancelled ? brandBlue : .secondary.opacity(0.5))
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background(
                        Rectangle()
                            .fill(Color(.systemBackground))
                            .overlay(
                                Rectangle()
                                    .stroke(booking.canBeCancelled ? brandBlue.opacity(0.55) : Color(.separator).opacity(0.32), lineWidth: 1)
                            )
                    )
                }
                .buttonStyle(.plain)
                .disabled(!booking.canBeCancelled)

                Button(action: onCancelBooking) {
                    HStack(spacing: 7) {
                        Image(systemName: "xmark")
                        Text("Cancel")
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(booking.canBeCancelled ? Color(red: 0.71, green: 0.14, blue: 0.10) : .secondary.opacity(0.5))
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background(
                        Rectangle()
                            .fill(Color(.systemBackground))
                            .overlay(
                                Rectangle()
                                    .stroke(booking.canBeCancelled ? Color(red: 0.82, green: 0.26, blue: 0.23) : Color(.separator).opacity(0.32), lineWidth: 1)
                            )
                    )
                }
                .buttonStyle(.plain)
                .disabled(!booking.canBeCancelled)
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 14)
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .background(
            Rectangle()
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.11), radius: 20, x: 0, y: 12)
        )
        .overlay(
            Rectangle()
                .stroke(Color.white.opacity(0.88), lineWidth: 1.2)
        )
    }

    private var statusPill: some View {
        HStack(spacing: 4) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 10, weight: .semibold))
            Text(statusLabel(booking.status))
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundColor(brandBlue)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule(style: .continuous).fill(brandBlue.opacity(0.12)))
    }
}

private struct BookingSideCard: View {
    let booking: BookingCardModel
    private let brandBlue = Color(red: 0.02, green: 0.41, blue: 0.96)

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            BookingHero(
                tenantName: booking.tenantName,
                cardImageUrl: booking.cardImageUrl,
                logoImageUrl: booking.logoImageUrl,
                iconImageUrl: booking.iconImageUrl,
                compact: true
            )
            HStack(alignment: .top, spacing: 8) {
                Text(booking.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 5) {
                    Image(systemName: statusLabel(booking.status).lowercased() == "pending" ? "hourglass" : "checkmark.seal")
                        .font(.system(size: 9, weight: .semibold))
                    Text(statusLabel(booking.status))
                        .font(.system(size: 9, weight: .semibold))
                }
                .foregroundColor(brandBlue)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Capsule(style: .continuous).fill(brandBlue.opacity(0.10)))
                .offset(x: 3)
            }
            BookingInfoRow(systemName: "calendar", text: bookingDate(booking.startsAt), compact: true)
            BookingInfoRow(systemName: "clock", text: bookingTime(booking.startsAt), compact: true)
            BookingInfoRow(systemName: "mappin.and.ellipse", text: booking.tenantName, compact: true)
            BookingInfoRow(systemName: "location", text: booking.tenantCity ?? "", compact: true)
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(height: 430)
        .background(
            Rectangle()
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.08), radius: 18, x: 0, y: 12)
        )
    }
}

private struct BookingHero: View {
    let tenantName: String
    let cardImageUrl: String?
    let logoImageUrl: String?
    let iconImageUrl: String?
    var compact: Bool = false
    private let brandBlue = Color(red: 0.02, green: 0.41, blue: 0.96)
    
    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Image("GymBookingBackground")
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()

            Circle()
                .fill(Color(red: 0.90, green: 0.95, blue: 1.00))
                .frame(width: compact ? 50 : 82, height: compact ? 50 : 82)
                .overlay(
                    Image("GymBookingIcon")
                        .resizable()
                        .scaledToFill()
                        .clipShape(Circle())
                        .padding(compact ? 6 : 9)
                )
                .offset(x: compact ? -18 : -42, y: compact ? 24 : 42)
        }
        .frame(height: compact ? 92 : 126)
        .clipped()
    }

    private var fallbackLogo: some View {
        VStack(spacing: 0) {
            Text(initials(tenantName))
                .font(.system(size: compact ? 16 : 20, weight: .bold))
                .foregroundColor(Color(.systemBackground))
            Text("STUDIO")
                .font(.system(size: compact ? 6 : 8, weight: .semibold))
                .foregroundColor(Color(.systemBackground).opacity(0.72))
        }
    }

    private var iconBadge: some View {
        ZStack {
            Circle()
                .fill(Color(.systemBackground).opacity(0.94))
                .overlay(Circle().stroke(Color(.separator).opacity(0.35), lineWidth: 1))
            if let iconImageUrl, !iconImageUrl.isEmpty, let imageUrl = URL(string: iconImageUrl) {
                AsyncImage(url: imageUrl) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFill()
                            .clipShape(Circle())
                            .padding(4)
                    } else {
                        Image(systemName: "square.stack.3d.up")
                            .font(.system(size: compact ? 10 : 12, weight: .semibold))
                            .foregroundColor(brandBlue)
                    }
                }
            } else {
                Image(systemName: "square.stack.3d.up")
                    .font(.system(size: compact ? 10 : 12, weight: .semibold))
                    .foregroundColor(brandBlue)
            }
        }
        .frame(width: compact ? 22 : 28, height: compact ? 22 : 28)
        .offset(x: compact ? 54 : 98, y: compact ? -36 : -58)
    }
}

private struct BookingInfoRow: View {
    let systemName: String
    let text: String
    var compact: Bool = false

    var body: some View {
        HStack(spacing: compact ? 5 : 9) {
            Image(systemName: systemName)
                .font(.system(size: compact ? 10 : 13, weight: .medium))
                .frame(width: compact ? 12 : 16)
                .foregroundColor(.secondary)
            Text(text)
                .font(compact ? .system(size: 10, weight: .medium) : .system(size: 14, weight: .regular))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
    }
}

private struct ContactActionButton: View {
    let title: String
    let systemName: String
    let enabled: Bool
    let action: () -> Void
    private let brandBlue = Color(red: 0.02, green: 0.41, blue: 0.96)

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Image(systemName: systemName)
                Text(title)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundColor(enabled ? brandBlue : .secondary.opacity(0.5))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                Rectangle()
                    .fill(Color(.systemBackground))
                    .overlay(
                        Rectangle()
                            .stroke(enabled ? brandBlue.opacity(0.45) : Color(.separator).opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

private extension BookingCardModel {
    func matches(tab: HomeBookingTab) -> Bool {
        switch tab {
        case .future:
            return canBeCancelled
        case .past:
            return !isCancelled && !canBeCancelled
        case .cancelled:
            return isCancelled
        }
    }

    var canBeCancelled: Bool {
        guard !isCancelled else { return false }
        guard let start = startDate else { return true }
        return start > Date()
    }

    var startDate: Date? {
        parseBookingDate(startsAt)
    }

    var isCancelled: Bool {
        status.lowercased().contains("cancel") || status.uppercased() == "NO_SHOW"
    }
}

private func statusLabel(_ status: String) -> String {
    status.replacingOccurrences(of: "_", with: " ")
        .lowercased()
        .split(separator: " ")
        .map { $0.prefix(1).uppercased() + $0.dropFirst() }
        .joined(separator: " ")
}

private func bookingDate(_ raw: String) -> String {
    guard let date = parseBookingDate(raw) else { return raw }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "EEE, d MMM"
    return formatter.string(from: date)
}

private func bookingTime(_ raw: String) -> String {
    guard let date = parseBookingDate(raw) else { return "Time to be confirmed" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
}

private func parseBookingDate(_ raw: String) -> Date? {
    let iso = ISO8601DateFormatter()
    if let date = iso.date(from: raw) { return date }
    let local = DateFormatter()
    local.locale = Locale(identifier: "en_US_POSIX")
    local.timeZone = TimeZone.current
    local.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    if let date = local.date(from: raw) { return date }
    local.dateFormat = "yyyy-MM-dd'T'HH:mm"
    return local.date(from: raw)
}

private func initials(_ name: String) -> String {
    let parts = name
        .split { $0 == " " || $0 == "-" || $0 == "&" }
        .compactMap { $0.first }
        .map { String($0).uppercased() }
    return parts.prefix(2).joined().isEmpty ? "C" : parts.prefix(2).joined()
}
