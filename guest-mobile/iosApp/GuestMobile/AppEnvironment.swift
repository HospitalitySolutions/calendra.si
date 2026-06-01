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

        if !value.isEmpty, !value.contains("$("), let url = URL(string: value), let scheme = url.scheme, let host = url.host, !host.isEmpty {
            #if DEBUG
            return url
            #else
            if scheme == "https" && host != "localhost" && host != "127.0.0.1" {
                return url
            }
            #endif
        }

        #if DEBUG
        // iOS simulator can reach the Mac host through localhost during local development.
        return URL(string: "http://localhost:4000")!
        #else
        // Release builds also validate API_BASE_URL at build time; keep a safe production fallback here.
        return URL(string: "https://app.calendra.si")!
        #endif
    }
}
