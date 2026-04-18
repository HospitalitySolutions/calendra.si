import SwiftUI

struct WalletView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GuestSectionHeader(title: "Wallet", subtitle: "Entitlements, orders, and booking history")

                Text("Entitlements")
                    .font(.title3.weight(.semibold))
                ForEach(store.accessCards) { item in
                    GuestSurfaceCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.name)
                                .font(.headline)
                            Text("Remaining: \(item.remainingUses.map(String.init) ?? "Unlimited")")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Text("Orders")
                    .font(.title3.weight(.semibold))
                ForEach(store.orders) { item in
                    GuestSurfaceCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.id)
                                .font(.headline)
                            Text("\(item.status) • \(item.totalGross, format: .currency(code: "EUR"))")
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if !store.upcomingBookings.isEmpty {
                    Text("History")
                        .font(.title3.weight(.semibold))
                    ForEach(store.upcomingBookings) { booking in
                        GuestSurfaceCard {
                            Text(booking.title)
                                .font(.headline)
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
