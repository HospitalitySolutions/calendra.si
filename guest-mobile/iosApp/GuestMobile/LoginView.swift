import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @EnvironmentObject private var store: AppStore
    @State private var email: String = "ana@example.com"
    @State private var password: String = "Secret123!"
    let onLoginSuccess: () -> Void
    let onRequireJoin: () -> Void

    var body: some View {
        Form {
            Section("Sign in") {
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                SecureField("Password", text: $password)
                Button("Login") {
                    Task {
                        await store.login(email: email, password: password)
                        if store.linkedTenants.isEmpty { onRequireJoin() } else { onLoginSuccess() }
                    }
                }
            }

            Section("Native sign-in") {
                SignInWithAppleButton(.continue) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    switch result {
                    case .success(let authorization):
                        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                              let tokenData = credential.identityToken,
                              let token = String(data: tokenData, encoding: .utf8) else {
                            store.errorMessage = "Apple did not return an identity token."
                            return
                        }
                        Task {
                            await store.loginWithApple(idToken: token)
                            if store.linkedTenants.isEmpty { onRequireJoin() } else { onLoginSuccess() }
                        }
                    case .failure(let error):
                        store.errorMessage = error.localizedDescription
                    }
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 44)

                Text("Google sign-in can be enabled by adding the GoogleSignIn Swift package and wiring it to the same `/api/guest/auth/google/token` backend endpoint.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
        }
    }
}
