import SwiftUI

struct InboxView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GuestSectionHeader(title: "Inbox", subtitle: "Updates from your subscribed tenancies")

                if store.notifications.isEmpty {
                    GuestSurfaceCard {
                        Text("No notifications yet.")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    ForEach(store.notifications) { item in
                        GuestSurfaceCard {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(item.title)
                                    .font(.headline)
                                Text(item.body)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 110)
        }
    }
}
