import SwiftUI
import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging

extension Notification.Name {
    static let guestPushTokenUpdated = Notification.Name("guestPushTokenUpdated")
    static let guestPushOpenInbox = Notification.Name("guestPushOpenInbox")
    static let guestPushBookingChanged = Notification.Name("guestPushBookingChanged")
}

enum GuestPushInboxRouter {
    private(set) static var pendingCompanyId: String?

    static func publish(companyId: String) {
        let normalized = companyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return }
        pendingCompanyId = normalized
        NotificationCenter.default.post(name: .guestPushOpenInbox, object: normalized)
    }

    static func consumePending() -> String? {
        let value = pendingCompanyId
        pendingCompanyId = nil
        return value
    }
}

final class GuestPushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            #if DEBUG
            if let error { print("Notification authorization failed: \(error.localizedDescription)") }
            if !granted { print("Notification authorization was not granted.") }
            #endif
            guard granted else { return }
            DispatchQueue.main.async {
                application.registerForRemoteNotifications()
            }
        }
        if let remoteNotification = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            publishInboxOpen(from: remoteNotification)
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            #if DEBUG
            if let error { print("FCM registration token fetch failed: \(error.localizedDescription)") }
            #endif
            guard let token, !token.isEmpty else { return }
            NotificationCenter.default.post(name: .guestPushTokenUpdated, object: token)
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("APNS registration failed: \(error.localizedDescription)")
        #endif
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken, !fcmToken.isEmpty else { return }
        NotificationCenter.default.post(name: .guestPushTokenUpdated, object: fcmToken)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .badge, .sound, .list]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        publishInboxOpen(from: response.notification.request.content.userInfo)
    }

    private func publishInboxOpen(from userInfo: [AnyHashable: Any]) {
        let type = (userInfo["type"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let companyId = (userInfo["companyId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let companyId, !companyId.isEmpty else { return }
        DispatchQueue.main.async {
            if type == "booking_changed" || type == "guest_reminder" {
                NotificationCenter.default.post(name: .guestPushBookingChanged, object: companyId)
                return
            }
            GuestPushInboxRouter.publish(companyId: companyId)
        }
    }
}

@main
struct GuestMobileApp: App {
    @UIApplicationDelegateAdaptor(GuestPushAppDelegate.self) private var appDelegate
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .tint(Color(red: 0.07, green: 0.30, blue: 0.62))
                .onOpenURL { url in
                    store.handleDeepLink(url: url)
                }
                .task {
                    if let companyId = GuestPushInboxRouter.consumePending() {
                        await store.openInboxFromPush(companyId: companyId)
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .guestPushTokenUpdated)) { notification in
                    guard let token = notification.object as? String else { return }
                    Task { await store.updatePushToken(token) }
                }
                .onReceive(NotificationCenter.default.publisher(for: .guestPushOpenInbox)) { notification in
                    guard let companyId = notification.object as? String else { return }
                    Task { await store.openInboxFromPush(companyId: companyId) }
                }
                .onReceive(NotificationCenter.default.publisher(for: .guestPushBookingChanged)) { notification in
                    guard let companyId = notification.object as? String else { return }
                    Task { await store.handleBookingChangedPush(companyId: companyId) }
                }
        }
    }
}
