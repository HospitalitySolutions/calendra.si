import PhotosUI
import QuickLook
import SwiftUI
import UIKit
import UniformTypeIdentifiers


private let inboxBrandBlue = Color(red: 0.07, green: 0.39, blue: 0.95)
private let inboxDarkText = Color(red: 0.03, green: 0.12, blue: 0.24)
private let inboxMutedText = Color(red: 0.36, green: 0.45, blue: 0.56)
private let inboxBrandOrange = Color(red: 1.0, green: 0.58, blue: 0.00)

private func inboxIsSl(_ languageCode: String) -> Bool {
    languageCode.lowercased().hasPrefix("sl")
}

private func inboxTr(_ languageCode: String, _ en: String, _ sl: String) -> String {
    inboxIsSl(languageCode) ? sl : en
}

private struct InboxSubtleBackground: View {
    var body: some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(
                    colors: [Color(red: 0.98, green: 0.99, blue: 1.00), Color(red: 0.95, green: 0.98, blue: 1.00), Color(red: 1.00, green: 0.98, blue: 0.95)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                Circle()
                    .fill(inboxBrandBlue.opacity(0.055))
                    .frame(width: geo.size.width * 0.70, height: geo.size.width * 0.70)
                    .position(x: geo.size.width * 0.50, y: geo.size.height * 0.33)
                Circle()
                    .fill(inboxBrandBlue.opacity(0.045))
                    .frame(width: geo.size.width * 0.52, height: geo.size.width * 0.52)
                    .position(x: geo.size.width * 1.02, y: geo.size.height * 0.44)
                Circle()
                    .fill(inboxBrandOrange.opacity(0.055))
                    .frame(width: geo.size.width * 0.60, height: geo.size.width * 0.60)
                    .position(x: geo.size.width * -0.08, y: geo.size.height * 0.84)
                Circle()
                    .fill(inboxBrandBlue.opacity(0.035))
                    .frame(width: geo.size.width * 0.46, height: geo.size.width * 0.46)
                    .position(x: geo.size.width * 0.92, y: geo.size.height * 0.88)
            }
        }
    }
}

private struct EmptyInboxStateView: View {
    let languageCode: String

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(inboxBrandBlue.opacity(0.07))
                    .frame(width: 142, height: 142)
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.white.opacity(0.72))
                    .frame(width: 74, height: 58)
                    .offset(x: -36, y: -18)
                Image(systemName: "ellipsis.message")
                    .font(.system(size: 76, weight: .bold))
                    .foregroundColor(inboxBrandBlue)
                Circle()
                    .fill(inboxBrandOrange)
                    .frame(width: 7, height: 7)
                    .offset(x: 60, y: -52)
                Circle()
                    .fill(inboxBrandOrange.opacity(0.80))
                    .frame(width: 7, height: 7)
                    .offset(x: -56, y: 55)
            }
            .frame(width: 172, height: 172)

            VStack(spacing: 10) {
                Text(inboxTr(languageCode, "Your inbox is empty", "Vaš nabiralnik je prazen"))
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(inboxDarkText)
                    .multilineTextAlignment(.center)
                Text(inboxTr(languageCode, "No messages yet. Start the conversation\nfrom the web app or send the first\nreply here.", "Sporočil še ni. Začnite pogovor\nv spletni aplikaciji ali pošljite\nprvi odgovor tukaj."))
                    .font(.system(size: 17, weight: .regular))
                    .lineSpacing(5)
                    .foregroundColor(inboxMutedText)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 18)
        }
        .frame(maxWidth: .infinity)
    }
}

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
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"

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
                                Text(isLoadingThumbnail ? inboxTr(appUiLocaleStorage, "Loading preview…", "Nalaganje predogleda…") : inboxTr(appUiLocaleStorage, "Image preview", "Predogled slike"))
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
                        Text(attachment.isImageAttachment ? inboxTr(appUiLocaleStorage, "Preview", "Predogled") : inboxTr(appUiLocaleStorage, "Open", "Odpri"))
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
    @AppStorage("guest_app_ui_locale") private var appUiLocaleStorage: String = "sl"
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
        ZStack {
            InboxSubtleBackground()
                .ignoresSafeArea()
            VStack(spacing: 0) {
                messagesArea
                composerBar
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
            }
            .padding(.top, 18)
            .padding(.bottom, 60)
        }
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
                Spacer(minLength: 0)
                EmptyInboxStateView(languageCode: appUiLocaleStorage)
                Spacer(minLength: 28)
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
            ? Color.white.opacity(0.96)
            : Color(red: 0.92, green: 0.96, blue: 1.00)
        let textColor: Color = inboxDarkText
        let metaColor: Color = isStaff ? inboxMutedText : Color(red: 0.32, green: 0.44, blue: 0.63)
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
            .shadow(color: Color.black.opacity(0.06), radius: 2, y: 1)
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
                    TextField("", text: $draft, prompt: Text(inboxTr(appUiLocaleStorage, "Message", "Sporočilo")).foregroundColor(inboxMutedText))
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
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .fill(Color.white.opacity(0.94))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(Color(red: 0.73, green: 0.78, blue: 0.84).opacity(0.80), lineWidth: 1)
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
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 21, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 54, height: 54)
                    .background(
                        Circle().fill(canSend ? inboxBrandBlue : Color(red: 0.88, green: 0.90, blue: 0.92))
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
            if pending.isUploading { return inboxTr(appUiLocaleStorage, "Uploading…", "Nalaganje…") }
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
                    failPending(pendingId, message: inboxTr(appUiLocaleStorage, "Unable to load selected media.", "Izbranega medija ni mogoče naložiti."))
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
        if cal.isDateInToday(date) { return inboxTr(appUiLocaleStorage, "Today", "Danes") }
        if cal.isDateInYesterday(date) { return inboxTr(appUiLocaleStorage, "Yesterday", "Včeraj") }
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
