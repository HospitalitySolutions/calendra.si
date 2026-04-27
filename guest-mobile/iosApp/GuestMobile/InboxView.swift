import PhotosUI
import QuickLook
import SwiftUI
import UIKit
import UniformTypeIdentifiers

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
                            .foregroundColor(.secondary)
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
                            .foregroundColor(iconForeground)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(attachment.fileName)
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.primary)
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
                                    .foregroundColor(.secondary)
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
                            .foregroundColor(.blue)
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

private struct PendingInboxAttachment: Identifiable {
    let id = UUID()
    var fileName: String
    var contentType: String?
    var sizeBytes: Int64
    var uploadedId: Int64?
    var isUploading: Bool
    var errorMessage: String?
}

struct InboxView: View {
    @EnvironmentObject private var store: AppStore
    @State private var draft = ""
    @State private var previewItem: InboxAttachmentPreviewItem?
    @State private var openingAttachmentId: Int64?
    @State private var pendingAttachments: [PendingInboxAttachment] = []
    @State private var isFileImporterPresented = false
    @State private var photoPickerSelection: [PhotosPickerItem] = []

    private var activeTenantId: String? {
        store.selectedTenantId ?? store.linkedTenants.first?.id
    }

    private var activeDashboard: TenantDashboardModel? {
        guard let activeTenantId else { return nil }
        return store.tenantDashboards[activeTenantId]
    }

    private var hasUploadedAttachment: Bool {
        pendingAttachments.contains { $0.uploadedId != nil }
    }

    private var isUploadingAttachment: Bool {
        pendingAttachments.contains { $0.isUploading }
    }

    private var canSend: Bool {
        guard activeTenantId != nil else { return false }
        if isUploadingAttachment { return false }
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty || hasUploadedAttachment
    }

    var body: some View {
        VStack(spacing: 0) {
            messagesArea
            composerBar
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
        }
        .padding(.bottom, 60)
        .task(id: activeTenantId) {
            if let activeTenantId {
                await store.loadInboxMessages(companyId: activeTenantId)
            }
        }
        .sheet(item: $previewItem) { item in
            AttachmentPreviewController(item: item)
        }
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case .success(let urls):
                urls.forEach { enqueueFileURL($0) }
            case .failure(let error):
                store.errorMessage = error.localizedDescription
            }
        }
        .onChange(of: photoPickerSelection) { newItems in
            guard !newItems.isEmpty else { return }
            let items = newItems
            photoPickerSelection = []
            items.forEach { enqueuePhotosPickerItem($0) }
        }
    }

    @ViewBuilder
    private var messagesArea: some View {
        if let messages = activeDashboard?.inboxMessages, !messages.isEmpty {
            chatScrollView(messages: messages)
        } else {
            VStack(spacing: 0) {
                GuestSurfaceCard {
                    Text("No messages yet. Start the conversation from the web app or send the first reply here.")
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func chatScrollView(messages: [GuestInboxMessageModel]) -> some View {
        let entries = buildChatEntries(messages: messages)
        return GeometryReader { geo in
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 4) {
                        ForEach(entries, id: \.id) { entry in
                            entryView(entry)
                                .id(entry.id)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(minHeight: geo.size.height, alignment: .bottom)
                }
                .onAppear {
                    if let last = entries.last {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
                .onChange(of: entries.count) { _ in
                    if let last = entries.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func entryView(_ entry: GuestChatEntry) -> some View {
        switch entry {
        case .header(_, let label):
            dateSeparator(label)
        case .message(let message):
            messageBubble(message)
        }
    }

    private func dateSeparator(_ label: String) -> some View {
        HStack {
            Spacer()
            Text(label)
                .font(.caption2.weight(.semibold))
                .foregroundColor(.secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color(.systemBackground), in: Capsule())
                .shadow(color: Color.black.opacity(0.08), radius: 2, y: 1)
            Spacer()
        }
        .padding(.vertical, 6)
    }

    private func messageBubble(_ message: GuestInboxMessageModel) -> some View {
        let isStaff = message.direction == "OUTBOUND"
        let bubbleColor: Color = isStaff
            ? Color(.systemBackground)
            : Color(red: 0.95, green: 0.59, blue: 0.23)
        let textColor: Color = isStaff ? .primary : .white
        let metaColor: Color = isStaff ? .secondary : Color.white.opacity(0.85)
        let time = formatMessageClock(message: message)
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: isStaff ? 4 : 18,
            bottomLeadingRadius: 18,
            bottomTrailingRadius: 18,
            topTrailingRadius: isStaff ? 18 : 4,
            style: .continuous
        )
        return HStack(spacing: 0) {
            if !isStaff { Spacer(minLength: 48) }
            VStack(alignment: .leading, spacing: 6) {
                if let attachments = message.attachments, !attachments.isEmpty, let activeTenantId {
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
                if !message.body.isEmpty {
                    HStack(alignment: .bottom, spacing: 8) {
                        Text(message.body)
                            .font(.body)
                            .foregroundColor(textColor)
                        Text(time)
                            .font(.caption2)
                            .foregroundColor(metaColor)
                    }
                } else {
                    HStack {
                        Spacer(minLength: 0)
                        Text(time)
                            .font(.caption2)
                            .foregroundColor(metaColor)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(bubbleColor)
            .clipShape(shape)
            .shadow(color: isStaff ? Color.black.opacity(0.08) : Color.clear, radius: 2, y: 1)
            if isStaff { Spacer(minLength: 48) }
        }
    }

    private var composerBar: some View {
        HStack(alignment: .bottom, spacing: 8) {
            VStack(alignment: .leading, spacing: 6) {
                if !pendingAttachments.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(pendingAttachments) { pending in
                                pendingAttachmentChip(for: pending)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.top, 8)
                    }
                }
                HStack(alignment: .center, spacing: 4) {
                    TextField("", text: $draft, prompt: Text("Message").foregroundColor(.secondary))
                        .textFieldStyle(.plain)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.leading, 12)
                        .padding(.vertical, 8)
                    Button {
                        isFileImporterPresented = true
                    } label: {
                        Image(systemName: "paperclip")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.secondary)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .disabled(activeTenantId == nil)

                    PhotosPicker(
                        selection: $photoPickerSelection,
                        maxSelectionCount: nil,
                        matching: .any(of: [.images, .videos])
                    ) {
                        Image(systemName: "photo.on.rectangle")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.secondary)
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                    .disabled(activeTenantId == nil)
                }
                .padding(.trailing, 4)
            }
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.secondary.opacity(0.25), lineWidth: 1)
            )

            Button {
                guard let activeTenantId, canSend else { return }
                let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                let ids = pendingAttachments.compactMap { $0.uploadedId }
                draft = ""
                pendingAttachments.removeAll()
                Task {
                    await store.sendInboxMessage(companyId: activeTenantId, body: body, attachmentFileIds: ids)
                    await store.loadInboxMessages(companyId: activeTenantId)
                }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(
                        Circle().fill(Color.black.opacity(canSend ? 1.0 : 0.25))
                    )
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
        }
    }

    private func pendingAttachmentChip(for pending: PendingInboxAttachment) -> some View {
        let background: Color = {
            if pending.errorMessage != nil { return Color.red.opacity(0.14) }
            if pending.isUploading { return Color.secondary.opacity(0.14) }
            return Color.accentColor.opacity(0.14)
        }()
        let subtitle: String? = {
            if let error = pending.errorMessage { return error }
            if pending.isUploading { return "Uploading…" }
            if pending.sizeBytes > 0 { return formattedSize(pending.sizeBytes) }
            return nil
        }()
        return HStack(spacing: 8) {
            if pending.isUploading {
                ProgressView().controlSize(.small)
            } else if pending.errorMessage != nil {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.red)
            } else {
                Image(systemName: "paperclip")
                    .foregroundColor(.blue)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(pending.fileName)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                if let subtitle {
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            Button {
                removePendingAttachment(pending)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(background, in: Capsule())
    }

    private func enqueueFileURL(_ url: URL) {
        guard let activeTenantId else { return }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            let fileName = url.lastPathComponent.isEmpty ? "attachment" : url.lastPathComponent
            let contentType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType
            startUpload(companyId: activeTenantId, fileName: fileName, contentType: contentType, data: data)
        } catch {
            store.errorMessage = error.localizedDescription
        }
    }

    private func enqueuePhotosPickerItem(_ item: PhotosPickerItem) {
        guard let activeTenantId else { return }
        let (initialName, initialMime) = inferPhotoMetadata(from: item)
        let pending = PendingInboxAttachment(
            fileName: initialName,
            contentType: initialMime,
            sizeBytes: 0,
            uploadedId: nil,
            isUploading: true,
            errorMessage: nil
        )
        pendingAttachments.append(pending)
        let pendingId = pending.id
        Task {
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else {
                    failPending(pendingId, message: "Unable to load selected media.")
                    return
                }
                let (name, mime) = inferPhotoMetadata(from: item)
                updatePending(pendingId) { p in
                    p.fileName = name
                    p.contentType = mime
                    p.sizeBytes = Int64(data.count)
                }
                await performUpload(
                    companyId: activeTenantId,
                    pendingId: pendingId,
                    fileName: name,
                    contentType: mime,
                    data: data
                )
            } catch {
                failPending(pendingId, message: error.localizedDescription)
            }
        }
    }

    private func startUpload(companyId: String, fileName: String, contentType: String?, data: Data) {
        let pending = PendingInboxAttachment(
            fileName: fileName,
            contentType: contentType,
            sizeBytes: Int64(data.count),
            uploadedId: nil,
            isUploading: true,
            errorMessage: nil
        )
        pendingAttachments.append(pending)
        let pendingId = pending.id
        Task {
            await performUpload(
                companyId: companyId,
                pendingId: pendingId,
                fileName: fileName,
                contentType: contentType,
                data: data
            )
        }
    }

    private func performUpload(
        companyId: String,
        pendingId: UUID,
        fileName: String,
        contentType: String?,
        data: Data
    ) async {
        do {
            let uploaded = try await store.uploadInboxAttachment(
                companyId: companyId,
                fileName: fileName,
                contentType: contentType,
                data: data
            )
            updatePending(pendingId) { p in
                p.uploadedId = uploaded.id
                p.fileName = uploaded.fileName.isEmpty ? p.fileName : uploaded.fileName
                p.contentType = uploaded.contentType ?? p.contentType
                if uploaded.sizeBytes > 0 { p.sizeBytes = uploaded.sizeBytes }
                p.isUploading = false
                p.errorMessage = nil
            }
        } catch {
            failPending(pendingId, message: error.localizedDescription)
        }
    }

    private func updatePending(_ id: UUID, _ apply: (inout PendingInboxAttachment) -> Void) {
        guard let index = pendingAttachments.firstIndex(where: { $0.id == id }) else { return }
        var current = pendingAttachments[index]
        apply(&current)
        pendingAttachments[index] = current
    }

    private func failPending(_ id: UUID, message: String) {
        updatePending(id) { p in
            p.isUploading = false
            p.errorMessage = message
        }
    }

    private func removePendingAttachment(_ pending: PendingInboxAttachment) {
        pendingAttachments.removeAll { $0.id == pending.id }
        if let uploadedId = pending.uploadedId, let activeTenantId {
            Task { await store.discardInboxAttachment(companyId: activeTenantId, fileId: uploadedId) }
        }
    }

    private func inferPhotoMetadata(from item: PhotosPickerItem) -> (String, String?) {
        let primaryType = item.supportedContentTypes.first
        let ext = primaryType?.preferredFilenameExtension ?? "jpg"
        let name = "photo-\(Int(Date().timeIntervalSince1970)).\(ext)"
        let mime = primaryType?.preferredMIMEType ?? "image/jpeg"
        return (name, mime)
    }

    private func formattedSize(_ bytes: Int64) -> String {
        let value = Double(bytes)
        let kb = 1024.0
        let mb = kb * 1024.0
        if value >= mb { return String(format: "%.1f MB", value / mb) }
        if value >= kb { return String(format: "%.0f KB", value / kb) }
        return "\(bytes) B"
    }

    private static let isoFormatterFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let clockFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static let dateHeaderFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "d MMM yyyy"
        return f
    }()

    private func parseMessageDate(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        if let d = Self.isoFormatterFractional.date(from: raw) { return d }
        return Self.isoFormatter.date(from: raw)
    }

    private func messageDate(_ message: GuestInboxMessageModel) -> Date? {
        parseMessageDate(message.sentAt) ?? parseMessageDate(message.createdAt)
    }

    private func formatMessageClock(message: GuestInboxMessageModel) -> String {
        if let date = messageDate(message) {
            return Self.clockFormatter.string(from: date)
        }
        return message.sentAt ?? message.createdAt
    }

    private func formatDateHeaderLabel(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "Today" }
        if cal.isDateInYesterday(date) { return "Yesterday" }
        return Self.dateHeaderFormatter.string(from: date)
    }

    private func buildChatEntries(messages: [GuestInboxMessageModel]) -> [GuestChatEntry] {
        var result: [GuestChatEntry] = []
        let cal = Calendar.current
        var lastDay: Date?
        for message in messages {
            let date = messageDate(message)
            if let date {
                let startOfDay = cal.startOfDay(for: date)
                if lastDay == nil || !cal.isDate(startOfDay, inSameDayAs: lastDay!) {
                    result.append(.header(date: startOfDay, label: formatDateHeaderLabel(startOfDay)))
                    lastDay = startOfDay
                }
            }
            result.append(.message(message))
        }
        return result
    }
}

private enum GuestChatEntry: Identifiable {
    case header(date: Date, label: String)
    case message(GuestInboxMessageModel)

    var id: String {
        switch self {
        case .header(let date, _):
            return "date-\(Int(date.timeIntervalSince1970))"
        case .message(let message):
            return "msg-\(message.id)"
        }
    }
}
