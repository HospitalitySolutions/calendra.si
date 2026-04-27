import SwiftUI

struct WelcomeView: View {
    let onContinue: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Spacer()
            Text("Calendra Guest")
                .font(.largeTitle.bold())
            Text("Native SwiftUI guest app scaffold with KMP shared domain layer.")
                .foregroundColor(.secondary)
            Button("Continue", action: onContinue)
                .buttonStyle(.borderedProminent)
            Spacer()
        }
        .padding(24)
    }
}
