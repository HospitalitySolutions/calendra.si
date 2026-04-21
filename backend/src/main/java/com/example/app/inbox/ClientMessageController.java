package com.example.app.inbox;

import com.example.app.user.User;
import com.example.app.files.StoredFileResponse;
import java.util.Collections;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/inbox")
public class ClientMessageController {
    private final ClientMessageService service;

    public ClientMessageController(ClientMessageService service) {
        this.service = service;
    }

    @GetMapping("/threads")
    public List<ClientMessageService.ThreadSummary> listThreads(
            @AuthenticationPrincipal User me,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long clientId,
            @RequestParam(required = false) MessageChannel channel,
            @RequestParam(required = false) MessageStatus status,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to
    ) {
        return service.listThreads(me, new ClientMessageService.ThreadFilter(search, clientId, channel, status, from, to));
    }

    @GetMapping("/clients/{clientId}/messages")
    public List<ClientMessageService.MessageView> listClientMessages(
            @AuthenticationPrincipal User me,
            @PathVariable Long clientId,
            @RequestParam(required = false) MessageChannel channel,
            @RequestParam(required = false) Integer limit
    ) {
        return service.listClientMessages(me, clientId, channel, limit);
    }

    @PostMapping("/messages")
    public ClientMessageService.MessageView send(
            @AuthenticationPrincipal User me,
            @RequestBody ClientMessageService.SendMessageRequest request
    ) {
        return service.send(me, request);
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
