import Foundation

final class AppEnvironment {
    static let shared = AppEnvironment()

    let baseURL: URL = AppEnvironment.makeBaseURL()
    let usePreviewData: Bool = false
    let googleClientId: String = "YOUR_GOOGLE_IOS_CLIENT_ID"

    private init() {}

    private static func makeBaseURL() -> URL {
        let configured = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String
        let value = configured?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        if !value.isEmpty, !value.contains("$("), let url = URL(string: value) {
            return url
        }

        // iOS simulator can reach the Mac host through localhost.
        return URL(string: "http://localhost:4000")!
    }
}
