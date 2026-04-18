import Foundation

enum DateFormatting {
    private static let inputFormatter = ISO8601DateFormatter()

    static func prettyDateTime(_ raw: String) -> String {
        if let date = inputFormatter.date(from: raw) {
            return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).hour().minute())
        }
        return raw
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
