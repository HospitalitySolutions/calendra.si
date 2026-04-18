import SwiftUI

struct ContentView: View {
    enum AppScreen {
        case welcome
        case login
        case joinTenant
        case main
    }

    @EnvironmentObject private var store: AppStore
    @State private var screen: AppScreen = .welcome

    var body: some View {
        VStack(spacing: 0) {
            switch screen {
            case .welcome:
                WelcomeView { screen = .login }
            case .login:
                LoginView(
                    onLoginSuccess: { screen = store.linkedTenants.isEmpty ? .joinTenant : .main },
                    onRequireJoin: { screen = .joinTenant }
                )
            case .joinTenant:
                JoinTenantView { screen = .main }
            case .main:
                MainTabView()
            }
        }
        .onChange(of: store.didRequestLogout) { didLogout in
            if didLogout {
                screen = .login
                store.didRequestLogout = false
            }
        }
        .alert("Error", isPresented: Binding(get: { store.errorMessage != nil }, set: { _ in store.errorMessage = nil })) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(store.errorMessage ?? "Unknown error")
        }
    }
}
