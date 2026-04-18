import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GuestSectionHeader(
                    title: "Your next visits",
                    subtitle: store.bookingCards.isEmpty ? "You do not have any upcoming bookings yet." : "Upcoming bookings across your subscribed tenancies."
                )

                if store.bookingCards.isEmpty {
                    GuestSurfaceCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Nothing booked yet")
                                .font(.headline)
                            Text("Open Book to choose a service, date and payment method.")
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    ForEach(store.bookingCards) { booking in
                        GuestSurfaceCard {
                            VStack(alignment: .leading, spacing: 0) {
                                RoundedRectangle(cornerRadius: 24, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [Color(red: 0.06, green: 0.09, blue: 0.16), Color(red: 0.20, green: 0.25, blue: 0.34)],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                                    .frame(height: 148)
                                    .overlay(alignment: .topLeading) {
                                        VStack(alignment: .leading, spacing: 12) {
                                            HStack {
                                                GuestPill(title: booking.tenantName, dark: true)
                                                Spacer()
                                                Text(formatDateTime(booking.startsAt))
                                                    .font(.caption.weight(.semibold))
                                                    .foregroundStyle(.white.opacity(0.82))
                                            }
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(booking.title)
                                                    .font(.title3.weight(.semibold))
                                                    .foregroundStyle(.white)
                                                Text(booking.status.replacingOccurrences(of: "_", with: " "))
                                                    .foregroundStyle(.white.opacity(0.78))
                                            }
                                        }
                                        .padding(18)
                                    }

                                VStack(alignment: .leading, spacing: 14) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(booking.tenantName)
                                            .font(.headline)
                                        if let city = booking.tenantCity, !city.isEmpty {
                                            Text(city)
                                                .foregroundStyle(.secondary)
                                        }
                                        Text(booking.tenantPhone ?? "No company phone available")
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }

                                    HStack(spacing: 12) {
                                        contactButton(systemName: "phone.fill", url: booking.tenantPhone.flatMap(phoneURL))
                                        contactButton(systemName: "message.fill", url: booking.tenantPhone.flatMap(smsURL))
                                    }
                                }
                                .padding(.top, 18)
                            }
                        }
                    }
                }

                if !store.accessCards.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Active access")
                            .font(.title2.weight(.bold))
                        Text("Credits and memberships for the current tenancy scope.")
                            .foregroundStyle(.secondary)
                    }

                    ForEach(store.accessCards) { access in
                        GuestSurfaceCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(access.name)
                                    .font(.headline)
                                HStack(spacing: 8) {
                                    GuestPill(title: access.type)
                                    GuestPill(title: access.tenantName)
                                }
                                if let remainingUses = access.remainingUses {
                                    Text("Remaining uses: \(remainingUses)")
                                        .foregroundStyle(.secondary)
                                }
                                if let validUntil = access.validUntil {
                                    Text("Valid until \(formatDateTime(validUntil))")
                                        .foregroundStyle(.secondary)
                                }
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

    private func contactButton(systemName: String, url: URL?) -> some View {
        Link(destination: url ?? URL(string: "https://example.invalid")!) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.primary)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(.secondarySystemBackground)))
        }
        .disabled(url == nil)
        .opacity(url == nil ? 0.4 : 1)
    }

    private func phoneURL(_ phone: String) -> URL? {
        URL(string: "tel://\(phone.filter { !$0.isWhitespace })")
    }

    private func smsURL(_ phone: String) -> URL? {
        URL(string: "sms://\(phone.filter { !$0.isWhitespace })")
    }

    private func formatDateTime(_ raw: String) -> String {
        DateFormatting.prettyDateTime(raw)
    }
}
