import SwiftUI

struct JoinTenantView: View {
    @EnvironmentObject private var store: AppStore
    @State private var tenantCode: String = ""
    let onJoin: () -> Void

    var body: some View {
        Form {
            Section("Join a tenant") {
                TextField("Tenant code", text: $tenantCode)
                Button("Join with code") {
                    Task {
                        await store.joinTenant(code: tenantCode)
                        onJoin()
                    }
                }
            }

            Section("Also planned") {
                Text("Invite links")
                Text("QR code")
                Text("Public search")
            }
        }
    }
}
