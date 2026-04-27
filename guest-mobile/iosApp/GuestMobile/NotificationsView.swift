import SwiftUI
import UIKit

struct NotificationsView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    private var companyId: String? {
        store.selectedTenantId ?? store.linkedTenants.first?.id
    }

    private var sortedNotifications: [NotificationModel] {
        store.notifications.sorted { lhs, rhs in
            (lhs.createdAt ?? "") > (rhs.createdAt ?? "")
        }
    }

    private var hasUnread: Bool {
        store.notifications.contains { $0.readAt == nil }
    }

    var body: some View {
        NavigationStack {
            Group {
                if sortedNotifications.isEmpty {
                    emptyState
                } else {
                    List {
                        ForEach(sortedNotifications) { notification in
                            Button {
                                Task { await handleTap(notification) }
                            } label: {
                                row(for: notification)
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(notification.readAt == nil ? Color(.secondarySystemBackground) : Color(.systemBackground))
                        }
                    }
                    .listStyle(.plain)
                    .refreshable {
                        if let companyId {
                            try? await store.refreshTenant(companyId: companyId)
                        }
                    }
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if hasUnread, let companyId {
                        Button("Mark all read") {
                            Task { await store.markAllNotificationsRead(companyId: companyId) }
                        }
                    }
                }
            }
            .task {
                if let companyId {
                    try? await store.refreshTenant(companyId: companyId)
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bell.slash")
                .font(.system(size: 42, weight: .regular))
                .foregroundColor(.secondary)
            Text("No notifications yet")
                .font(.headline)
            Text("We'll show booking updates, reminders and announcements here.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func row(for notification: NotificationModel) -> some View {
        HStack(alignment: .top, spacing: 12) {
            unreadDot(isUnread: notification.readAt == nil)
            VStack(alignment: .leading, spacing: 4) {
                Text(notification.title)
                    .font(.headline)
                    .foregroundColor(.primary)
                if !notification.body.isEmpty {
                    Text(notification.body)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let createdAt = notification.createdAt, !createdAt.isEmpty {
                    Text(formatted(createdAt: createdAt))
                        .font(.caption)
                        .foregroundColor(Color(UIColor.tertiaryLabel))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
    }

    private func unreadDot(isUnread: Bool) -> some View {
        Circle()
            .fill(isUnread ? Color.accentColor : Color.clear)
            .frame(width: 8, height: 8)
            .padding(.top, 8)
    }

    private func handleTap(_ notification: NotificationModel) async {
        guard let companyId else { return }
        if notification.readAt == nil {
            await store.markNotificationRead(companyId: companyId, notificationId: notification.id)
        }
    }

    private func formatted(createdAt raw: String) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: raw) {
            let out = DateFormatter()
            out.dateStyle = .medium
            out.timeStyle = .short
            return out.string(from: date)
        }
        iso.formatOptions = [.withInternetDateTime]
        if let date = iso.date(from: raw) {
            let out = DateFormatter()
            out.dateStyle = .medium
            out.timeStyle = .short
            return out.string(from: date)
        }
        return raw
    }
}

#Preview {
    NotificationsView()
        .environmentObject(AppStore())
}
