package com.example.app.inbox;

import com.example.app.user.User;
import java.time.LocalDate;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

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
}
