import Foundation

struct StoredGuestProfile {
    var firstName: String
    var lastName: String
    var email: String
    var phone: String
    var language: String
    var linkedCompanyId: String?
    var linkedCompanyName: String
    var batchPaymentEnabled: Bool
    var cards: [String]
}

final class LocalProfileStore {
    static let shared = LocalProfileStore()
    private let defaults = UserDefaults.standard

    private init() {}

    func load(from user: GuestUserModel) -> StoredGuestProfile {
        StoredGuestProfile(
            firstName: decode("guest_profile_firstName") ?? user.firstName,
            lastName: decode("guest_profile_lastName") ?? user.lastName,
            email: decode("guest_profile_email") ?? user.email,
            phone: decode("guest_profile_phone") ?? (user.phone ?? ""),
            language: decode("guest_profile_language") ?? (user.language ?? "en"),
            linkedCompanyId: decode("guest_profile_linkedCompanyId"),
            linkedCompanyName: decode("guest_profile_linkedCompanyName") ?? "",
            batchPaymentEnabled: Bool(decode("guest_profile_batchPaymentEnabled") ?? "") ?? false,
            cards: decode("guest_profile_cards")?.components(separatedBy: "||").filter { !$0.isEmpty } ?? []
        )
    }

    func save(_ profile: StoredGuestProfile) {
        defaults.set(encode(profile.firstName), forKey: "guest_profile_firstName")
        defaults.set(encode(profile.lastName), forKey: "guest_profile_lastName")
        defaults.set(encode(profile.email), forKey: "guest_profile_email")
        defaults.set(encode(profile.phone), forKey: "guest_profile_phone")
        defaults.set(encode(profile.language), forKey: "guest_profile_language")
        defaults.set(profile.linkedCompanyId.map(encode), forKey: "guest_profile_linkedCompanyId")
        defaults.set(encode(profile.linkedCompanyName), forKey: "guest_profile_linkedCompanyName")
        defaults.set(encode(String(profile.batchPaymentEnabled)), forKey: "guest_profile_batchPaymentEnabled")
        defaults.set(encode(profile.cards.joined(separator: "||")), forKey: "guest_profile_cards")
    }

    private func encode(_ value: String) -> String {
        Data(value.utf8).base64EncodedString()
    }

    private func decode(_ key: String) -> String? {
        guard let raw = defaults.string(forKey: key), let data = Data(base64Encoded: raw) else { return nil }
        return String(decoding: data, as: UTF8.self)
    }
}
