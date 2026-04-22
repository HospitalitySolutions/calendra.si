import Foundation

final class AppEnvironment {
    static let shared = AppEnvironment()

    let baseURL: URL = URL(string: "http://10.0.2.2:4000")!
    let usePreviewData: Bool = false
    let googleClientId: String = "YOUR_GOOGLE_IOS_CLIENT_ID"

    private init() {}
}
