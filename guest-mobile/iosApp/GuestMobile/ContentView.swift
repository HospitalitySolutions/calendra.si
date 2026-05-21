import SwiftUI

struct ContentView: View {
    enum AppScreen {
        case loading
        case welcome
        case login
        case signup
        case verifyEmailCode
        case joinTenant
        case main
    }

    @EnvironmentObject private var store: AppStore
    @State private var screen: AppScreen = .loading
    @State private var bootstrappingSession = true

    var body: some View {
        VStack(spacing: 0) {
            switch screen {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .welcome:
                WelcomeView(
                    onContinue: { screen = .signup },
                    onAlreadyHaveAccount: { screen = .login }
                )
            case .login:
                LoginView(
                    onLoginSuccess: { screen = store.linkedTenants.isEmpty ? .joinTenant : .main },
                    onRequireJoin: { screen = .joinTenant },
                    onCreateAccount: { screen = .signup }
                )
            case .signup:
                SignupView(
                    onBackToLogin: { screen = .login },
                    onContinueToVerification: { screen = .verifyEmailCode }
                )
            case .verifyEmailCode:
                EmailCodeVerificationView(
                    onBackToLogin: { screen = .login },
                    onVerificationSuccess: { screen = .main },
                    onRequireJoin: { screen = .joinTenant }
                )
            case .joinTenant:
                JoinTenantView { screen = .main }
            case .main:
                MainTabView()
            }
        }
        .task {
            let restored = await store.restoreSessionIfPossible()
            if restored {
                screen = store.linkedTenants.isEmpty ? .joinTenant : .main
            } else {
                screen = .welcome
            }
            bootstrappingSession = false
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
        .alert("Notice", isPresented: Binding(get: { store.noticeMessage != nil }, set: { _ in store.noticeMessage = nil })) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(store.noticeMessage ?? "")
        }
    }
}
