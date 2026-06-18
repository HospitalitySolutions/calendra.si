import SwiftUI
import UIKit

struct CalendarView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
    @State private var selectedMode: CalendarMode = .month
    @State private var selectedDate = Date()
    @State private var visibleMonth = Date()
    @State private var currentTime = Date()
    @State private var popupBooking: BookingCardModel?
    @State private var bookingPendingCancel: BookingCardModel?

    let selectedTenantId: String?
    let onOpenBooking: (BookingCardModel) -> Void
    let onCancelBooking: (BookingCardModel) -> Void

    init(
        selectedTenantId: String? = nil,
        onOpenBooking: @escaping (BookingCardModel) -> Void,
        onCancelBooking: @escaping (BookingCardModel) -> Void = { _ in }
    ) {
        self.selectedTenantId = selectedTenantId
        self.onOpenBooking = onOpenBooking
        self.onCancelBooking = onCancelBooking
    }

    private var isSl: Bool { appUiLocaleStorage.lowercased().hasPrefix("sl") }
    private let brandBlue = Color(red: 0.114, green: 0.400, blue: 0.957)
    private let softText = Color(red: 0.37, green: 0.44, blue: 0.54)
    private let cardShadow = Color.black.opacity(0.08)
    private let currentTimeTimer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    private var bookings: [BookingCardModel] {
        store.bookingCards
            .filter { !$0.status.uppercased().contains("CANCEL") }
            .filter { booking in
                guard let selectedTenantId, !selectedTenantId.isEmpty else { return true }
                return booking.companyId == selectedTenantId
            }
            .sorted { parseDate($0.startsAt) ?? .distantFuture < parseDate($1.startsAt) ?? .distantFuture }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 8) {
                segmentedTabs

                switch selectedMode {
                case .month:
                    monthCard
                    selectedDayCards
                case .week:
                    weekStrip
                    dayTimeline
                    weekSummary
                case .list:
                    listStrip
                    groupedList
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 18)
            .padding(.bottom, 84)
        }
        .background(Color(red: 0.955, green: 0.970, blue: 0.990))
        .onAppear { currentTime = Date() }
        .onReceive(currentTimeTimer) { currentTime = $0 }
        .sheet(item: $popupBooking) { booking in
            bookingPopup(booking)
                .presentationDetents([.height(720), .large])
                .presentationDragIndicator(.visible)
        }
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
                Text(isSl ? "S tem boste preklicali \(booking.title) dne \(calendarBookingDate(booking.startsAt))." : "This will cancel \(booking.title) on \(calendarBookingDate(booking.startsAt)).")
            }
        }
    }

    private func bookingPopup(_ booking: BookingCardModel) -> some View {
        ZStack(alignment: .topTrailing) {
            Color(red: 0.953, green: 0.957, blue: 0.973)
                .ignoresSafeArea()

            HomeBookingCard(
                booking: booking,
                width: max(UIScreen.main.bounds.width - 40, 0),
                onCall: openPhone,
                onMessage: openMessage,
                onReschedule: { selectedBooking in
                    popupBooking = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        onOpenBooking(selectedBooking)
                    }
                },
                onCancel: {
                    popupBooking = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        bookingPendingCancel = booking
                    }
                },
                isSl: isSl
            )
            .frame(maxWidth: .infinity)
            .padding(.top, 20)
            .padding(.bottom, 18)

            Button {
                popupBooking = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(Color.white).shadow(color: Color.black.opacity(0.12), radius: 7, x: 0, y: 3))
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
            .padding(.trailing, 12)
        }
    }

    private var segmentedTabs: some View {
        HStack(spacing: 0) {
            ForEach(CalendarMode.allCases, id: \.self) { mode in
                let active = selectedMode == mode
                Button {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.88)) { selectedMode = mode }
                } label: {
                    VStack(spacing: 0) {
                        Text(mode.title(isSl: isSl))
                            .font(.system(size: 12, weight: active ? .bold : .medium))
                            .foregroundColor(active ? brandBlue : softText)
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
                .shadow(color: Color.black.opacity(0.05), radius: 10, x: 0, y: 5)
        )
    }

    private var monthCard: some View {
        VStack(spacing: 8) {
            HStack {
                circleButton(systemName: "chevron.left") { shiftMonth(-1) }
                Spacer()
                Text(monthTitle(visibleMonth))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                Spacer()
                circleButton(systemName: "chevron.right") { shiftMonth(1) }
            }
            .padding(.horizontal, 4)

            HStack {
                ForEach(weekdaySymbols(), id: \.self) { day in
                    Text(day)
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundColor(softText)
                        .frame(maxWidth: .infinity)
                }
            }

            let days = monthGridDays(for: visibleMonth)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 5) {
                ForEach(days, id: \.self) { date in
                    monthDayCell(date)
                }
            }

            Divider().opacity(0.35)
            tenantLegend
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
                .shadow(color: cardShadow, radius: 8, x: 0, y: 4)
        )
    }

    private var selectedDayCards: some View {
        let items = bookings(on: selectedDate)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(isSl ? "Prihajajoči termini" : "Upcoming sessions")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                Spacer()
            }
            if items.isEmpty {
                emptyCard
            } else {
                ForEach(items) { booking in
                    bookingRow(booking, compact: false, useTenantAsTitle: true)
                }
            }
        }
    }

    private var weekStrip: some View {
        HStack(spacing: 0) {
            circleButton(systemName: "chevron.left") { shiftWeek(-1) }
            ForEach(weekDates(containing: selectedDate), id: \.self) { date in
                Button {
                    withAnimation(.spring(response: 0.24, dampingFraction: 0.9)) { selectedDate = date }
                } label: {
                    VStack(spacing: 4) {
                        Text(shortWeekday(date))
                            .font(.system(size: 7, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.65)
                        Text(dayNumber(date))
                            .font(.system(size: 11, weight: .medium))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                        Circle()
                            .fill(bookings(on: date).isEmpty ? Color.clear : (isSameDay(date, selectedDate) ? Color.white : brandBlue))
                            .frame(width: 3, height: 3)
                    }
                    .foregroundColor(isSameDay(date, selectedDate) ? .white : Color(red: 0.03, green: 0.12, blue: 0.24))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 3)
                    .background(
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .fill(isSameDay(date, selectedDate) ? brandBlue : Color.clear)
                    )
                }
                .buttonStyle(.plain)
            }
            circleButton(systemName: "chevron.right") { shiftWeek(1) }
        }
        .padding(7)
        .frame(height: 50)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
                .shadow(color: Color.black.opacity(0.05), radius: 10, x: 0, y: 5)
        )
    }

    private var dayTimeline: some View {
        VStack(spacing: 0) {
            ForEach(8...18, id: \.self) { hour in
                ZStack(alignment: .topLeading) {
                    HStack(alignment: .top, spacing: 10) {
                        Text(String(format: "%02d:00", hour))
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(softText)
                            .frame(width: 32, alignment: .leading)
                        Rectangle()
                            .fill(Color(red: 0.86, green: 0.89, blue: 0.94))
                            .frame(height: 1)
                            .padding(.top, 6)
                    }
                    if shouldShowCurrentTime(in: hour) {
                        currentTimeIndicator
                            .padding(.leading, 36)
                            .padding(.top, currentTimeMarkerTopPadding)
                    }
                }
                .frame(height: 28)
                let hourItems = bookings(on: selectedDate).filter { booking in
                    guard let date = parseDate(booking.startsAt) else { return false }
                    return Calendar.current.component(.hour, from: date) == hour
                }
                ForEach(hourItems) { booking in
                    timelineCard(booking)
                        .padding(.leading, 36)
                        .padding(.bottom, 4)
                }
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
                .shadow(color: cardShadow, radius: 8, x: 0, y: 4)
        )
    }

    private var weekSummary: some View {
        HStack(spacing: 6) {
            ZStack {
                Circle().fill(brandBlue.opacity(0.12)).frame(width: 28, height: 28)
                Image(systemName: "calendar")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(brandBlue)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(String(format: isSl ? "%d terminov ta teden" : "%d sessions this week", bookingsThisWeek().count))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                Text(nextBookingText())
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(softText)
            }
            Spacer()
            Button(isSl ? "Poglej vse" : "View all") { selectedMode = .list }
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(brandBlue)
        }
        .padding(10)
        .frame(height: 50)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
                .shadow(color: Color.black.opacity(0.05), radius: 10, x: 0, y: 5)
        )
    }

    private var listStrip: some View {
        HStack(spacing: 6) {
            ForEach(0..<7, id: \.self) { offset in
                let date = Calendar.current.date(byAdding: .day, value: offset, to: Date()) ?? Date()
                Button { selectedDate = date } label: {
                    VStack(spacing: 4) {
                        Text(shortWeekday(date).capitalized)
                            .font(.system(size: 9, weight: .medium))
                        Text(dayMonthShort(date))
                            .font(.system(size: 9, weight: .medium))
                        Circle().fill(bookings(on: date).isEmpty ? Color.clear : brandBlue).frame(width: 3, height: 3)
                    }
                    .foregroundColor(isSameDay(date, selectedDate) ? .white : Color(red: 0.03, green: 0.12, blue: 0.24))
                    .frame(width: 50, height: 50)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(isSameDay(date, selectedDate) ? brandBlue : Color.white)
                            .shadow(color: cardShadow, radius: 8, x: 0, y: 4)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .horizontalScrollIfNeeded()
    }

    private var groupedList: some View {
        let grouped = Dictionary(grouping: bookings) { booking -> Date in
            let date = parseDate(booking.startsAt) ?? Date.distantFuture
            return Calendar.current.startOfDay(for: date)
        }
        let days = grouped.keys.sorted()
        return VStack(spacing: 8) {
            if bookings.isEmpty {
                emptyCard
            } else {
                ForEach(days, id: \.self) { day in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Image(systemName: "calendar.badge.checkmark")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(brandBlue)
                            Text(sectionTitle(day))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                            Spacer()
                            Text("\(grouped[day]?.count ?? 0)")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(softText)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Color(red: 0.94, green: 0.95, blue: 0.97)))
                        }
                        ForEach(grouped[day] ?? []) { booking in
                            bookingRow(booking, compact: true)
                        }
                    }
                    .padding(8)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(Color.white)
                            .shadow(color: cardShadow, radius: 14, x: 0, y: 8)
                    )
                }
            }
        }
    }

    private var tenantLegend: some View {
        let tenants = Array(Set(bookings.map { $0.tenantName })).prefix(3)
        return HStack(spacing: 6) {
            ForEach(Array(tenants), id: \.self) { name in
                HStack(spacing: 6) {
                    Circle().fill(color(for: name)).frame(width: 5, height: 5)
                    Text(name)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(softText)
                        .lineLimit(1)
                }
            }
            Spacer()
            Text(isSl ? "Uredi" : "Edit")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(brandBlue)
        }
    }

    private var emptyCard: some View {
        VStack(spacing: 8) {
            Image(systemName: "calendar.badge.exclamationmark")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(brandBlue)
            Text(isSl ? "Ni terminov za izbrani dan" : "No sessions for this day")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
            Text(isSl ? "Izberite drug datum ali rezervirajte nov termin." : "Choose another date or book a new session.")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(softText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(13)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
                .shadow(color: cardShadow, radius: 8, x: 0, y: 4)
        )
    }

    private func monthDayCell(_ date: Date) -> some View {
        let inCurrentMonth = Calendar.current.isDate(date, equalTo: visibleMonth, toGranularity: .month)
        let selected = isSameDay(date, selectedDate)
        let dayBookings = bookings(on: date)
        return Button {
            selectedDate = date
            visibleMonth = date
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(selected ? brandBlue : Color.clear)
                        .frame(width: 23, height: 23)
                    Text(dayNumber(date))
                        .font(.system(size: 11, weight: selected ? .bold : .medium))
                        .foregroundColor(selected ? .white : (inCurrentMonth ? Color.black : Color(red: 0.64, green: 0.68, blue: 0.75)))
                        .frame(width: 23, height: 23, alignment: .center)
                }
                .frame(width: 23, height: 23, alignment: .center)
                HStack(spacing: 3) {
                    ForEach(dayBookings.prefix(3), id: \.id) { booking in
                        Circle().fill(color(for: booking.tenantName)).frame(width: 3, height: 3)
                    }
                }
                .frame(height: 4)
            }
            .frame(maxWidth: .infinity, minHeight: 29)
        }
        .buttonStyle(.plain)
    }

    private func bookingRow(_ booking: BookingCardModel, compact: Bool, useTenantAsTitle: Bool = false) -> some View {
        let primaryTitle = useTenantAsTitle ? booking.tenantName : booking.title
        let consultant = booking.consultantName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let secondaryLabel = !(consultant ?? "").isEmpty ? consultant : (useTenantAsTitle ? booking.title : nil)
        let locationLabel = useTenantAsTitle ? booking.tenantCity : booking.tenantName

        return Button { popupBooking = booking } label: {
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(color(for: booking.tenantName))
                    .frame(width: 3, height: compact ? 32 : 40)
                VStack(alignment: .leading, spacing: 3) {
                    Text(timeText(booking.startsAt))
                        .font(.system(size: compact ? 12 : 14, weight: .bold))
                        .foregroundColor(brandBlue)
                    Text(durationText(booking))
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(softText)
                }
                .frame(width: compact ? 48 : 56, alignment: .leading)
                Rectangle().fill(Color(red: 0.88, green: 0.90, blue: 0.94)).frame(width: 1, height: compact ? 26 : 32)
                VStack(alignment: .leading, spacing: 5) {
                    Text(primaryTitle)
                        .font(.system(size: compact ? 11 : 13, weight: .bold))
                        .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                        .lineLimit(1)
                    if let secondaryLabel, !secondaryLabel.isEmpty {
                        Label(secondaryLabel, systemImage: "person")
                            .font(.system(size: 8, weight: .semibold))
                            .foregroundColor(brandBlue)
                            .lineLimit(1)
                    }
                    if let locationLabel, !locationLabel.isEmpty {
                        Label(locationLabel, systemImage: "mappin.and.ellipse")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(softText)
                            .lineLimit(1)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(softText)
            }
            .padding(8)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white)
                    .shadow(color: cardShadow, radius: 8, x: 0, y: 4)
            )
        }
        .buttonStyle(.plain)
    }

    private func timelineCard(_ booking: BookingCardModel) -> some View {
        Button { onOpenBooking(booking) } label: {
            HStack(spacing: 6) {
                Image(systemName: iconName(for: booking.title))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(color(for: booking.tenantName))
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(color(for: booking.tenantName).opacity(0.12)))
                VStack(alignment: .leading, spacing: 3) {
                    Text(booking.title)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
                    Text(booking.tenantName)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(softText)
                }
                Spacer()
                Text(timeRangeText(booking))
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(Color(red: 0.03, green: 0.12, blue: 0.24))
            }
            .padding(7)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(color(for: booking.tenantName).opacity(0.12))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(color(for: booking.tenantName).opacity(0.35), lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }

    private func circleButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(brandBlue)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Color.white).overlay(Circle().stroke(Color(red: 0.86, green: 0.89, blue: 0.94), lineWidth: 1)))
        }
        .buttonStyle(.plain)
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

    private func calendarBookingDate(_ raw: String) -> String {
        guard let date = parseDate(raw) else { return raw }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: isSl ? "sl_SI" : "en_US_POSIX")
        formatter.dateFormat = isSl ? "d. MMM yyyy" : "MMM d, yyyy"
        return formatter.string(from: date)
    }

    private func parseDate(_ string: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: string) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let date = plain.date(from: string) { return date }
        return nil
    }

    private func bookings(on date: Date) -> [BookingCardModel] {
        bookings.filter { booking in
            guard let start = parseDate(booking.startsAt) else { return false }
            return Calendar.current.isDate(start, inSameDayAs: date)
        }
    }

    private func bookingsThisWeek() -> [BookingCardModel] {
        let interval = Calendar.current.dateInterval(of: .weekOfYear, for: selectedDate)
        return bookings.filter { booking in
            guard let date = parseDate(booking.startsAt), let interval else { return false }
            return interval.contains(date)
        }
    }

    private func isSameDay(_ a: Date, _ b: Date) -> Bool { Calendar.current.isDate(a, inSameDayAs: b) }
    private func dayNumber(_ date: Date) -> String { String(Calendar.current.component(.day, from: date)) }

    private func monthTitle(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: isSl ? "sl_SI" : "en_US")
        formatter.dateFormat = "LLLL yyyy"
        return formatter.string(from: date).capitalized
    }

    private func weekdaySymbols() -> [String] {
        isSl ? ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    }

    private func shortWeekday(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: isSl ? "sl_SI" : "en_US")
        formatter.dateFormat = "E"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }

    private func dayMonthShort(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: isSl ? "sl_SI" : "en_US")
        formatter.dateFormat = isSl ? "d. MMM" : "MMM d"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: ".")
    }

    private func sectionTitle(_ date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return isSl ? "Danes" : "Today" }
        if Calendar.current.isDateInTomorrow(date) { return isSl ? "Jutri" : "Tomorrow" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: isSl ? "sl_SI" : "en_US")
        formatter.dateFormat = isSl ? "EEEE, d. MMM" : "EEEE, MMM d"
        return formatter.string(from: date).capitalized
    }

    private func shouldShowCurrentTime(in hour: Int) -> Bool {
        Calendar.current.isDate(selectedDate, inSameDayAs: currentTime)
            && Calendar.current.component(.hour, from: currentTime) == hour
            && (8...18).contains(hour)
    }

    private var currentTimeMarkerTopPadding: CGFloat {
        let minute = Calendar.current.component(.minute, from: currentTime)
        return 6 + (CGFloat(minute) / 60.0 * 28.0)
    }

    private var currentTimeIndicator: some View {
        HStack(spacing: 0) {
            Text(timeText(currentTime))
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .frame(height: 22)
                .background(Capsule().fill(brandBlue))
            Rectangle()
                .fill(brandBlue.opacity(0.65))
                .frame(height: 1.5)
        }
    }

    private func timeText(_ iso: String) -> String {
        guard let date = parseDate(iso) else { return "--:--" }
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    private func timeText(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    private func timeRangeText(_ booking: BookingCardModel) -> String {
        let start = timeText(booking.startsAt)
        guard let endsAt = booking.endsAt else { return start }
        return "\(start) – \(timeText(endsAt))"
    }

    private func durationText(_ booking: BookingCardModel) -> String {
        guard let start = parseDate(booking.startsAt), let endRaw = booking.endsAt, let end = parseDate(endRaw) else {
            return dayMonthShort(parseDate(booking.startsAt) ?? Date())
        }
        let minutes = max(0, Int(end.timeIntervalSince(start) / 60))
        return "\(minutes) min"
    }

    private func nextBookingText() -> String {
        guard let next = bookings.first(where: { (parseDate($0.startsAt) ?? .distantPast) >= Date() }) else {
            return isSl ? "Ni prihajajočih terminov" : "No upcoming sessions"
        }
        return isSl ? "Naslednji termin ob \(timeText(next.startsAt))" : "Next session at \(timeText(next.startsAt))"
    }

    private func monthGridDays(for date: Date) -> [Date] {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .month, for: date) else { return [] }
        let first = interval.start
        let weekday = calendar.component(.weekday, from: first)
        let leading = (weekday + 5) % 7
        let start = calendar.date(byAdding: .day, value: -leading, to: first) ?? first
        return (0..<42).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    private func weekDates(containing date: Date) -> [Date] {
        let calendar = Calendar.current
        let interval = calendar.dateInterval(of: .weekOfYear, for: date)
        let start = interval?.start ?? date
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    private func shiftMonth(_ delta: Int) {
        visibleMonth = Calendar.current.date(byAdding: .month, value: delta, to: visibleMonth) ?? visibleMonth
    }

    private func shiftWeek(_ delta: Int) {
        selectedDate = Calendar.current.date(byAdding: .day, value: delta * 7, to: selectedDate) ?? selectedDate
    }

    private func color(for tenant: String) -> Color {
        let palette: [Color] = [brandBlue, Color.orange, Color.green, Color.purple, Color.teal, Color.pink]
        let value = abs(tenant.unicodeScalars.reduce(0) { ($0 &* 31) &+ Int($1.value) })
        return palette[value % palette.count]
    }

    private func iconName(for title: String) -> String {
        let lower = title.lowercased()
        if lower.contains("masa") { return "figure.mind.and.body" }
        if lower.contains("fit") || lower.contains("trening") { return "dumbbell" }
        if lower.contains("joga") || lower.contains("yoga") || lower.contains("pilates") { return "leaf" }
        return "calendar.badge.clock"
    }
}

private enum CalendarMode: CaseIterable {
    case month, week, list

    func title(isSl: Bool) -> String {
        switch self {
        case .month: return isSl ? "Mesec" : "Month"
        case .week: return isSl ? "Teden" : "Week"
        case .list: return isSl ? "Seznam" : "List"
        }
    }
}

private extension View {
    func horizontalScrollIfNeeded() -> some View {
        ScrollView(.horizontal, showsIndicators: false) { self }
    }
}
