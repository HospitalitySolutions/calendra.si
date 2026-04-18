import Foundation

enum DateFormatting {
    private static let inputFormatter = ISO8601DateFormatter()

    struct HomeBookingScheduleLines {
        let line1: String
        let line2: String
    }

    static func prettyDateTime(_ raw: String) -> String {
        if let date = parseBookingInstant(raw) {
            return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute())
        }
        return raw
    }

    /// "Saturday at 21:30" and "18th April" (en_US_POSIX), for home booking header.
    static func homeBookingScheduleLines(_ raw: String) -> HomeBookingScheduleLines? {
        guard let date = parseBookingInstant(raw) else { return nil }
        let cal = Calendar(identifier: .gregorian)
        let day = cal.component(.day, from: date)
        let en = Locale(identifier: "en_US_POSIX")
        let line1Formatter = DateFormatter()
        line1Formatter.locale = en
        line1Formatter.dateFormat = "EEEE 'at' HH:mm"
        let monthFormatter = DateFormatter()
        monthFormatter.locale = en
        monthFormatter.dateFormat = "MMMM"
        let line1 = line1Formatter.string(from: date)
        let line2 = "\(ordinalEnglish(day)) \(monthFormatter.string(from: date))"
        return HomeBookingScheduleLines(line1: line1, line2: line2)
    }

    private static func ordinalEnglish(_ n: Int) -> String {
        let mod100 = n % 100
        if (11...13).contains(mod100) { return "\(n)th" }
        switch n % 10 {
        case 1: return "\(n)st"
        case 2: return "\(n)nd"
        case 3: return "\(n)rd"
        default: return "\(n)th"
        }
    }

    private static func parseBookingInstant(_ raw: String) -> Date? {
        if let date = inputFormatter.date(from: raw) { return date }
        let local = DateFormatter()
        local.locale = Locale(identifier: "en_US_POSIX")
        local.timeZone = TimeZone.current
        local.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        if let date = local.date(from: raw) { return date }
        local.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return local.date(from: raw)
    }


    static func prettyTime(_ raw: String) -> String {
        if let date = inputFormatter.date(from: raw) {
            return date.formatted(.dateTime.hour().minute())
        }
        return raw
    }

    static func prettyRange(start: String, end: String) -> String {
        guard let startDate = inputFormatter.date(from: start), let endDate = inputFormatter.date(from: end) else {
            return start
        }
        return startDate.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute()) + " – " + endDate.formatted(.dateTime.hour().minute())
    }

    static func dayString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
