import SwiftUI

struct GuestSurfaceCard<Content: View>: View {
    var background: Color = Color(.systemBackground)
    var contentPadding: CGFloat = 18
    var cornerRadius: CGFloat = 28
    @ViewBuilder let content: Content

    init(
        background: Color = Color(.systemBackground),
        contentPadding: CGFloat = 18,
        cornerRadius: CGFloat = 28,
        @ViewBuilder content: () -> Content
    ) {
        self.background = background
        self.contentPadding = contentPadding
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    var body: some View {
        content
            .padding(contentPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(background)
                    .shadow(color: .black.opacity(0.05), radius: 18, x: 0, y: 10)
            )
    }
}

struct GuestPill: View {
    let title: String
    var dark: Bool = false

    var body: some View {
        Text(title)
            .font(.caption.weight(.semibold))
            .foregroundStyle(dark ? Color.white : Color.primary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule(style: .continuous)
                    .fill(dark ? Color.white.opacity(0.16) : Color(.secondarySystemBackground))
            )
    }
}

struct GuestSectionHeader: View {
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 28, weight: .bold))
            if let subtitle {
                Text(subtitle)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
