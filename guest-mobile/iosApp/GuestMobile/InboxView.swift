import QuickLook
import SwiftUI
import UIKit

private struct InboxAttachmentPreviewItem: Identifiable {
    let id = UUID()
    let url: URL
    let title: String
}

private struct AttachmentPreviewController: UIViewControllerRepresentable {
    let item: InboxAttachmentPreviewItem

    func makeCoordinator() -> Coordinator { Coordinator(item: item) }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        controller.title = item.title
        return controller
    }

    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {
        context.coordinator.item = item
        uiViewController.reloadData()
    }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        var item: InboxAttachmentPreviewItem
        init(item: InboxAttachmentPreviewItem) { self.item = item }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { item.url as NSURL }
    }
}

private struct InboxAttachmentCard: View {
    @EnvironmentObject private var store: AppStore

    let companyId: String
    let attachment: GuestInboxAttachmentModel
    @Binding var previewItem: InboxAttachmentPreviewItem?
    @Binding var openingAttachmentId: Int64?

    @State private var thumbnail: UIImage?
    @State private var isLoadingThumbnail = false

    var body: some View {
        Button {
            openingAttachmentId = attachment.id
            Task {
                do {
                    let url = try await store.downloadInboxAttachment(companyId: companyId, attachment: attachment)
                    previewItem = InboxAttachmentPreviewItem(url: url, title: attachment.fileName)
                } catch {
                    store.errorMessage = error.localizedDescription
                }
                openingAttachmentId = nil
            }
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                if attachment.isImageAttachment {
                    ZStack {
                        if let thumbnail {
                            Image(uiImage: thumbnail)
                                .resizable()
                                .scaledToFill()
                                .frame(maxWidth: .infinity)
                                .frame(height: 156)
                                .clipped()
                        } else {
                            RoundedRectangle(cornerRadius: 0, style: .continuous)
                                .fill(Color(.tertiarySystemFill))
                                .frame(height: 156)
                            VStack(spacing: 8) {
                                Image(systemName: "photo")
                                    .font(.system(size: 28, weight: .semibold))
                                Text(isLoadingThumbnail ? "Loading preview…" : "Image preview")
                                    .font(.caption.weight(.semibold))
                            }
                            .foregroundStyle(.secondary)
                        }
                    }
                }

                HStack(alignment: .center, spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(iconBackground)
                            .frame(width: 42, height: 42)
                        Image(systemName: iconName)
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(iconForeground)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(attachment.fileName)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                            .lineLimit(2)
                        HStack(spacing: 8) {
                            Text(attachment.fileTypeLabel)
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.accentColor.opacity(0.14), in: Capsule())
                            if let formattedSize = attachment.formattedSize {
                                Text(formattedSize)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    Spacer(minLength: 8)

                    if openingAttachmentId == attachment.id {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text(attachment.isImageAttachment ? "Preview" : "Open")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.blue)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .task(id: attachment.id) {
            guard attachment.isImageAttachment, thumbnail == nil, !isLoadingThumbnail else { return }
            isLoadingThumbnail = true
            defer { isLoadingThumbnail = false }
            do {
                thumbnail = try await store.loadInboxAttachmentThumbnail(companyId: companyId, attachment: attachment)
            } catch {
                thumbnail = nil
            }
        }
    }

    private var iconName: String {
        if attachment.isPdfAttachment { return "doc.richtext.fill" }
        if attachment.isImageAttachment { return "photo.fill" }
        return "doc.fill"
    }

    private var iconBackground: Color {
        if attachment.isPdfAttachment { return Color.red.opacity(0.16) }
        if attachment.isImageAttachment { return Color.blue.opacity(0.16) }
        return Color.secondary.opacity(0.14)
    }

    private var iconForeground: Color {
        if attachment.isPdfAttachment { return .red }
        if attachment.isImageAttachment { return .blue }
        return .secondary
    }
}

struct InboxView: View {
    @EnvironmentObject private var store: AppStore
    @State private var draft = ""
    @State private var previewItem: InboxAttachmentPreviewItem?
    @State private var openingAttachmentId: Int64?

    private var activeTenantId: String? {
        store.selectedTenantId ?? store.linkedTenants.first?.id
    }

    private var activeDashboard: TenantDashboardModel? {
        guard let activeTenantId else { return nil }
        return store.tenantDashboards[activeTenantId]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GuestSectionHeader(title: "Inbox", subtitle: activeDashboard?.tenant.name ?? "Select a tenancy to open the chat")

                if let messages = activeDashboard?.inboxMessages, !messages.isEmpty {
                    ForEach(messages) { item in
                        GuestSurfaceCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(item.direction == "OUTBOUND" ? "Staff" : "You")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.blue)
                                if !item.body.isEmpty {
                                    Text(item.body)
                                        .font(.body)
                                }
                                if let activeTenantId, let attachments = item.attachments, !attachments.isEmpty {
                                    VStack(alignment: .leading, spacing: 8) {
                                        ForEach(attachments, id: \.id) { attachment in
                                            InboxAttachmentCard(
                                                companyId: activeTenantId,
                                                attachment: attachment,
                                                previewItem: $previewItem,
                                                openingAttachmentId: $openingAttachmentId
                                            )
                                            .environmentObject(store)
                                        }
                                    }
                                }
                                HStack(spacing: 8) {
                                    Text(item.sentAt ?? item.createdAt)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if item.direction == "OUTBOUND" {
                                        Text(item.status.replacingOccurrences(of: "_", with: " "))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    GuestSurfaceCard {
                        Text("No messages yet. Start the conversation from the web app or send the first reply here.")
                            .foregroundStyle(.secondary)
                    }
                }

                GuestSurfaceCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Message")
                            .font(.headline)
                        TextEditor(text: $draft)
                            .frame(minHeight: 120)
                        Button("Send") {
                            guard let activeTenantId, !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
                            let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                            draft = ""
                            Task {
                                await store.sendInboxMessage(companyId: activeTenantId, body: body)
                                await store.loadInboxMessages(companyId: activeTenantId)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(activeTenantId == nil || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 110)
        }
        .task(id: activeTenantId) {
            if let activeTenantId {
                await store.loadInboxMessages(companyId: activeTenantId)
            }
        }
        .sheet(item: $previewItem) { item in
            AttachmentPreviewController(item: item)
        }
    }
}
