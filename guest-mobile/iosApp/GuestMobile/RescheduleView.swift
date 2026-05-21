import SwiftUI

struct RescheduleView: View {
    @EnvironmentObject private var store: AppStore

    let context: BookRescheduleContext
    let onClose: () -> Void
    let onOpenNotifications: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("Close") {
                    onClose()
                }
                .font(.body.weight(.semibold))
                .foregroundColor(.primary)
                Spacer()
                Text("Reschedule")
                    .font(.headline)
                Spacer()
                Color.clear
                    .frame(width: 44, height: 1)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            Divider()

            BookView(
                onOpenNotifications: onOpenNotifications,
                rescheduleContext: context,
                onRescheduleCompleted: onClose,
                onExit: onClose
            )
            .environmentObject(store)
        }
    }
}

