package com.example.app.guest.inbox;

import com.example.app.files.StoredFileResponse;
import com.example.app.guest.auth.GuestAuthContextService;
import com.example.app.guest.model.GuestUser;
import com.example.app.inbox.ClientMessageService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/guest/inbox")
public class GuestInboxController {
    private final GuestAuthContextService authContextService;
    private final ClientMessageService messageService;

    public GuestInboxController(GuestAuthContextService authContextService, ClientMessageService messageService) {
        this.authContextService = authContextService;
        this.messageService = messageService;
    }

    public record GuestSendMessageRequest(String companyId, String body, List<Long> attachmentFileIds) {}

    @GetMapping("/threads")
    public List<ClientMessageService.GuestThreadSummary> threads(
            @RequestParam String companyId,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return messageService.listGuestThreads(guestUser, Long.parseLong(companyId));
    }

    @GetMapping("/messages")
    public List<ClientMessageService.MessageView> messages(
            @RequestParam String companyId,
            @RequestParam(required = false) Integer limit,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return messageService.listGuestMessages(guestUser, Long.parseLong(companyId), limit);
    }

    @PostMapping("/messages")
    public ClientMessageService.MessageView send(
            @RequestBody GuestSendMessageRequest payload,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        List<Long> attachmentFileIds = payload.attachmentFileIds() == null
                ? Collections.emptyList()
                : payload.attachmentFileIds();
        return messageService.sendGuestMessage(
                guestUser,
                Long.parseLong(payload.companyId()),
                payload.body(),
                attachmentFileIds
        );
    }

    @PostMapping(value = "/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public StoredFileResponse preuploadAttachment(
            @RequestParam String companyId,
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        return messageService.preuploadGuestInboxAttachment(guestUser, Long.parseLong(companyId), file);
    }

    @PostMapping("/attachments/{fileId}/discard")
    public void discardPendingAttachment(
            @PathVariable Long fileId,
            @RequestParam String companyId,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        messageService.discardGuestPendingInboxAttachment(guestUser, Long.parseLong(companyId), fileId);
    }

    @GetMapping("/attachments/{attachmentId}")
    public ResponseEntity<byte[]> attachment(
            @PathVariable Long attachmentId,
            @RequestParam String companyId,
            HttpServletRequest request
    ) {
        GuestUser guestUser = authContextService.requireGuest(request);
        var download = messageService.downloadGuestAttachment(guestUser, Long.parseLong(companyId), attachmentId);
        String contentType = download.contentType() == null || download.contentType().isBlank()
                ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                : download.contentType();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(download.fileName()).build().toString())
                .contentType(MediaType.parseMediaType(contentType))
                .body(download.bytes());
    }

}
