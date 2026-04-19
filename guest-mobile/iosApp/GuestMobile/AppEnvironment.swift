import Foundation

final class AppEnvironment {
    static let shared = AppEnvironment()

    let baseURL: URL = URL(string: "http://192.168.1.88:4000")!
    let usePreviewData: Bool = false
    let googleClientId: String = "YOUR_GOOGLE_IOS_CLIENT_ID"

    private init() {}
}
