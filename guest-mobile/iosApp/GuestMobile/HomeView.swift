import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GuestSectionHeader(
                    title: "Upcoming bookings",
                    subtitle: nil
                )

                if store.bookingCards.isEmpty {
                    GuestSurfaceCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Nothing booked yet")
                                .font(.headline)
                            Text("Open Book to choose a service, date and payment method.")
                                .foregroundColor(.secondary)
                        }
                    }
                } else {
                    ForEach(store.bookingCards) { booking in
                        GuestSurfaceCard {
                            VStack(alignment: .leading, spacing: 0) {
                                RoundedRectangle(cornerRadius: 24, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [
                                                Color(red: 0.059, green: 0.239, blue: 0.478),
                                                Color(red: 0.071, green: 0.298, blue: 0.616),
                                                Color(red: 0.102, green: 0.361, blue: 0.737)
                                            ],
                                            startPoint: .leading,
                                            endPoint: .trailing
                                        )
                                    )
                                    .frame(height: 148)
                                    .overlay(alignment: .topLeading) {
                                        VStack(alignment: .leading, spacing: 12) {
                                            HStack(alignment: .top) {
                                                GuestPill(title: booking.tenantName, dark: true, companyAccent: true)
                                                Spacer()
                                                homeScheduleView(booking.startsAt)
                                            }
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(booking.title)
                                                    .font(.title3.weight(.semibold))
                                                    .foregroundColor(.white)
                                                Text(booking.status.replacingOccurrences(of: "_", with: " "))
                                                    .foregroundColor(.white.opacity(0.78))
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
                                                .foregroundColor(.secondary)
                                        }
                                        Text(booking.tenantPhone ?? "No company phone available")
                                            .font(.subheadline)
                                            .foregroundColor(.secondary)
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
                            .foregroundColor(.secondary)
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
                                        .foregroundColor(.secondary)
                                }
                                if let validUntil = access.validUntil {
                                    Text("Valid until \(formatDateTime(validUntil))")
                                        .foregroundColor(.secondary)
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

    @ViewBuilder
    private func homeScheduleView(_ raw: String) -> some View {
        if let lines = DateFormatting.homeBookingScheduleLines(raw) {
            VStack(alignment: .trailing, spacing: 2) {
                Text(lines.line1)
                    .font(.title3.weight(.semibold))
                    .foregroundColor(.white)
                Text(lines.line2)
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.88))
            }
        } else {
            Text(formatDateTime(raw))
                .font(.caption.weight(.semibold))
                .foregroundColor(.white.opacity(0.82))
        }
    }

    private func contactButton(systemName: String, url: URL?) -> some View {
        Link(destination: url ?? URL(string: "https://example.invalid")!) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.primary)
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
