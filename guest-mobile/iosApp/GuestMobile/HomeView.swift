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
                headerBlock
                    .padding(.horizontal, 24)
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
        .onChange(of: selectedBookingTab) { _ in selectedPage = 0 }
    }

    private var headerBlock: some View {
        let firstName = store.user.firstName.isEmpty ? "Alex" : store.user.firstName
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                Image("CalendraLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 34)
                Spacer(minLength: 10)
                HStack(spacing: 10) {
                    Button(action: onChooseTenant) {
                        HStack(spacing: 8) {
                            Image(systemName: "person.badge.plus")
                                .font(.system(size: 14, weight: .medium))
                            Text("Add tenant")
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
            Text("Hello, \(firstName)")
                .font(.system(size: 28, weight: .heavy))
                .foregroundColor(brandText)
            Text(store.bookingCards.isEmpty ? "Here’s what’s next." : "Here’s your upcoming booking.")
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
                        Text(tab.rawValue)
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
            case .future: return "No upcoming bookings"
            case .past: return "No past bookings"
            case .cancelled: return "No cancelled bookings"
            }
        }()
        let subtitle: String = {
            switch selectedBookingTab {
            case .future: return "You’re all set — there are no future bookings right now."
            case .past: return "Completed visits will appear here."
            case .cancelled: return "Cancelled bookings will appear here."
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
                    Text("Book now")
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
                Text("Explore available sessions from the Book tab.")
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
                        onCancel: { bookingPendingCancel = booking }
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

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
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
                .frame(height: 286)
                .clipped()

                HStack(alignment: .top) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Color.white)
                            .frame(width: 68, height: 68)
                        Group {
                            if let url = booking.logoImageUrl, let imageURL = URL(string: url) {
                                AsyncImage(url: imageURL) { image in
                                    image.resizable().scaledToFit().padding(8)
                                } placeholder: {
                                    Image("CalendraLogo").resizable().scaledToFit().padding(8)
                                }
                            } else {
                                Image("CalendraLogo")
                                    .resizable()
                                    .scaledToFit()
                                    .padding(8)
                            }
                        }
                    }
                    Spacer()
                    HStack(spacing: 10) {
                        Circle()
                            .fill(Color(red: 0.165, green: 0.662, blue: 0.322))
                            .frame(width: 12, height: 12)
                        Text(bookingStatus(booking.status))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(red: 0.129, green: 0.588, blue: 0.325))
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 50)
                    .background(Capsule(style: .continuous).fill(Color(red: 0.898, green: 0.973, blue: 0.910)))
                }
                .padding(16)
            }

            VStack(alignment: .leading, spacing: 0) {
                Text(booking.title)
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundColor(brandText)
                    .padding(.top, 18)
                HStack(spacing: 18) {
                    metaItem(icon: "calendar", text: bookingDate(booking.startsAt))
                    metaItem(icon: "clock", text: bookingTime(booking.startsAt))
                }
                .padding(.top, 18)

                Divider().overlay(softBorder).padding(.top, 18)
                detailLine(icon: "person", iconColor: brandBlue, label: "Tenant", value: booking.tenantName)
                Divider().overlay(softBorder).padding(.top, 11)
                detailLine(icon: "person", iconColor: brandOrange, label: "Consultant", value: booking.consultantName?.isEmpty == false ? booking.consultantName! : "To be confirmed")
                Divider().overlay(softBorder).padding(.top, 11)
                detailLine(icon: "location", iconColor: Color(red: 0.482, green: 0.380, blue: 1.0), label: "Location", value: booking.tenantName, subvalue: booking.tenantCity ?? "Location to be confirmed")

                HStack(spacing: 12) {
                    actionButton(title: "Call", systemName: "phone", tint: brandBlue, action: { onCall(booking.tenantPhone) })
                    actionButton(title: "SMS", systemName: "ellipsis.message", tint: brandBlue, action: { onMessage(booking.tenantPhone) })
                    actionButton(title: "Reschedule", systemName: "calendar.badge.clock", tint: brandOrange, action: { onReschedule(booking) })
                    actionButton(title: "Cancel", systemName: "xmark", tint: Color.red, action: onCancel)
                }
                .padding(.top, 22)
                .padding(.bottom, 18)
            }
            .padding(.horizontal, 12)
            .background(Color.white)
        }
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(Color.white)
                .shadow(color: .black.opacity(0.06), radius: 14, x: 0, y: 8)
        )
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
    }

    private func metaItem(icon: String, text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(mutedText)
            Text(text)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(mutedText)
        }
    }

    private func detailLine(icon: String, iconColor: Color, label: String, value: String, subvalue: String? = nil) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(iconColor.opacity(0.10))
                    .frame(width: 42, height: 42)
                Image(systemName: icon == "location" ? "location.circle" : icon)
                    .font(.system(size: 21, weight: .medium))
                    .foregroundColor(iconColor)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(mutedText)
                Text(value)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(brandText)
                if let subvalue {
                    Text(subvalue)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(mutedText)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 11)
    }

    private func actionButton(title: String, systemName: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 10) {
                Image(systemName: systemName)
                    .font(.system(size: 21, weight: .medium))
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundColor(tint)
            .frame(maxWidth: .infinity)
            .frame(height: 74)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(softBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
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
}

private func bookingStatus(_ raw: String) -> String {
    raw.replacingOccurrences(of: "_", with: " ").lowercased().capitalized
}

private func bookingDate(_ raw: String) -> String {
    guard let date = parseBookingDate(raw) else { return raw }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "MMM d, yyyy"
    return formatter.string(from: date)
}

private func bookingTime(_ raw: String) -> String {
    guard let date = parseBookingDate(raw) else { return "Time to be confirmed" }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "h:mm a"
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
