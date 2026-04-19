import SwiftUI

@main
struct GuestMobileApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .tint(Color(red: 0.07, green: 0.30, blue: 0.62))
                .onOpenURL { url in
                    store.handlePaymentReturn(url: url)
                }
        }
    }
}
