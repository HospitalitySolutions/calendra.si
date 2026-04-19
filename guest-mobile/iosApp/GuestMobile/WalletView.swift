import SwiftUI

struct WalletView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GuestSectionHeader(title: "Wallet", subtitle: "Entitlements, orders, and booking history")

                Text("Entitlements")
                    .font(.title3.weight(.semibold))
                ForEach(store.accessCards) { item in
                    GuestSurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(item.name)
                                .font(.headline)
                            Text("Remaining: \(item.remainingUses.map(String.init) ?? "Unlimited")")
                                .foregroundStyle(.secondary)
                            if item.type == "MEMBERSHIP" {
                                Toggle("Auto-renew", isOn: Binding(
                                    get: { item.autoRenews },
                                    set: { newValue in
                                        Task {
                                            try? await store.toggleAutoRenew(companyId: item.companyId, entitlementId: item.id.split(separator: "-").last.map(String.init) ?? item.id, autoRenews: newValue)
                                        }
                                    }
                                ))
                            }
                        }
                    }
                }

                if !store.walletOffers.isEmpty {
                    Text("Buy")
                        .font(.title3.weight(.semibold))
                    ForEach(store.walletOffers) { item in
                        GuestSurfaceCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(item.name)
                                    .font(.headline)
                                Text(item.priceGross, format: .currency(code: item.currency))
                                    .foregroundStyle(.secondary)
                                if let description = item.description, !description.isEmpty {
                                    Text(description)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                Button("Buy with card") {
                                    Task {
                                        if let checkout = try? await store.createOrder(companyId: item.companyId, productId: item.productId, slotId: nil, paymentMethod: "CARD"),
                                           let urlString = checkout.checkoutUrl,
                                           let url = URL(string: urlString) {
                                            openURL(url)
                                        }
                                    }
                                }
                            }
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
