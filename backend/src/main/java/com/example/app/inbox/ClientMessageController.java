package com.example.app.inbox;

import com.example.app.observability.legacy.LegacyEndpointDefinition;
import com.example.app.observability.legacy.TrackLegacyEndpoint;
import com.example.app.user.User;
import com.example.app.files.StoredFileResponse;
import com.example.app.settings.GlobalMessagingProviderService;
import java.util.Collections;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/inbox")
public class ClientMessageController {
    private final ClientMessageService service;
    private final GlobalMessagingProviderService globalMessagingProviders;

    public ClientMessageController(ClientMessageService service, GlobalMessagingProviderService globalMessagingProviders) {
        this.service = service;
        this.globalMessagingProviders = globalMessagingProviders;
    }

    public record InboxGlobalCapabilitiesResponse(boolean whatsappEnabled, boolean viberEnabled) {}

    @GetMapping("/threads")
    public List<ClientMessageService.ThreadSummary> listThreads(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long clientId,
            @RequestParam(required = false) MessageChannel channel,
            @RequestParam(required = false) MessageStatus status,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long assignedUserId,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "100") int size
    ) {
        return service.listThreads(me, new ClientMessageService.ThreadFilter(search, clientId, channel, status, from, to, assignedUserId), page, size);
    }

    @GetMapping("/global-capabilities")
    public InboxGlobalCapabilitiesResponse globalCapabilities(@AuthenticationPrincipal User me) {
        var caps = globalMessagingProviders.capabilities();
        return new InboxGlobalCapabilitiesResponse(caps.whatsappEnabled(), caps.viberEnabled());
    }

    @GetMapping("/clients/{clientId}/messages")
    public List<ClientMessageService.MessageView> listClientMessages(
            @AuthenticationPrincipal User me,
            @PathVariable Long clientId,
            @RequestParam(required = false) String threadKey,
            @RequestParam(required = false) MessageChannel channel,
            @RequestParam(required = false) Integer limit,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "100") int size
    ) {
        return service.listClientMessages(me, clientId, threadKey, channel, limit, page, size);
    }

    @PostMapping("/messages")
    public ClientMessageService.MessageView send(
            @AuthenticationPrincipal User me,
            @RequestBody ClientMessageService.SendMessageRequest request
    ) {
        return service.send(me, request);
    }

    @GetMapping("/scheduled")
    public List<ClientMessageService.ScheduledMessageView> listScheduled(@AuthenticationPrincipal User me) {
        return service.listScheduledMessages(me);
    }

    @PostMapping("/scheduled")
    public ClientMessageService.ScheduledMessageView createScheduled(
            @AuthenticationPrincipal User me,
            @RequestBody ClientMessageService.ScheduleRequest request
    ) {
        return service.createScheduledMessage(me, request);
    }

    @DeleteMapping("/scheduled/{id}")
    public void cancelScheduled(@AuthenticationPrincipal User me, @PathVariable Long id) {
        service.cancelScheduledMessage(me, id);
    }

    @PostMapping("/clients/{clientId}/notes")
    public ClientMessageService.MessageView createInternalNote(
            @AuthenticationPrincipal User me,
            @PathVariable Long clientId,
            @RequestBody ClientMessageService.InternalNoteRequest request
    ) {
        return service.createInternalNote(me, clientId, request == null ? null : request.body());
    }

    @PutMapping("/clients/{clientId}/assignee")
    public ClientMessageService.AssigneeView setAssignee(
            @AuthenticationPrincipal User me,
            @PathVariable Long clientId,
            @RequestBody ClientMessageService.AssigneeRequest request
    ) {
        return service.setAssignee(me, clientId, request == null ? null : request.userId());
    }

    @PutMapping("/clients/{clientId}/star")
    public ClientMessageService.ThreadFlagsView setStarred(
            @AuthenticationPrincipal User me,
            @PathVariable Long clientId,
            @RequestParam(required = false) String threadKey,
            @RequestBody ClientMessageService.StarRequest request
    ) {
        return service.setStarred(me, clientId, threadKey, request != null && Boolean.TRUE.equals(request.starred()));
    }

    @PutMapping("/clients/{clientId}/status")
    public ClientMessageService.ThreadFlagsView setStatus(
            @AuthenticationPrincipal User me,
            @PathVariable Long clientId,
            @RequestParam(required = false) String threadKey,
            @RequestBody ClientMessageService.StatusRequest request
    ) {
        return service.setStatus(me, clientId, threadKey, request != null && Boolean.TRUE.equals(request.closed()));
    }

    @PostMapping(value = "/clients/{clientId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public StoredFileResponse preuploadInboxAttachment(
            @AuthenticationPrincipal User me,
            @PathVariable Long clientId,
            @RequestParam("file") MultipartFile file
    ) {
        return service.preuploadInboxAttachment(me, clientId, file);
    }

    @PostMapping("/clients/{clientId}/attachments/{fileId}/discard")
    public void discardPendingInboxAttachment(
            @AuthenticationPrincipal User me,
            @PathVariable Long clientId,
            @PathVariable Long fileId
    ) {
        service.discardPendingInboxAttachment(me, clientId, fileId);
    }

    @PostMapping(value = "/messages/with-attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @TrackLegacyEndpoint(LegacyEndpointDefinition.INBOX_MULTIPART_SEND)
    public ClientMessageService.MessageView sendWithAttachments(
            @AuthenticationPrincipal User me,
            @RequestParam Long clientId,
            @RequestParam(required = false) MessageChannel channel,
            @RequestParam(required = false) String subject,
            @RequestParam(required = false) String body,
            @RequestParam(name = "files", required = false) List<MultipartFile> files
    ) {
        return service.sendWithAttachments(me, clientId, channel, subject, body, files == null ? Collections.emptyList() : files);
    }

}
