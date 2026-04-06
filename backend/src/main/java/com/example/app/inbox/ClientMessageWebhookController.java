package com.example.app.inbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/inbox/webhooks")
public class ClientMessageWebhookController {
    private final ClientMessageService service;
    private final ObjectMapper objectMapper;

    public ClientMessageWebhookController(ClientMessageService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/whatsapp/{companyId}")
    public String verifyWhatsApp(
            @PathVariable Long companyId,
            @RequestParam(name = "hub.mode", required = false) String mode,
            @RequestParam(name = "hub.verify_token", required = false) String verifyToken,
            @RequestParam(name = "hub.challenge", required = false) String challenge
    ) {
        if (!"subscribe".equals(mode) || !service.matchesWhatsAppVerifyToken(companyId, verifyToken)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid WhatsApp verification token.");
        }
        return challenge == null ? "" : challenge;
    }

    @PostMapping(value = "/whatsapp/{companyId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> receiveWhatsApp(
            @PathVariable Long companyId,
            @RequestHeader(name = "X-Hub-Signature-256", required = false) String signature,
            @RequestBody String rawBody
    ) throws Exception {
        JsonNode root = objectMapper.readTree(rawBody);
        int saved = service.ingestWhatsAppWebhook(companyId, root, signature, rawBody);
        return Map.of("ok", true, "saved", saved);
    }

    @PostMapping(value = "/viber/{companyId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> receiveViber(
            @PathVariable Long companyId,
            @RequestBody JsonNode payload
    ) {
        int saved = service.ingestViberWebhook(companyId, payload);
        return Map.of("ok", true, "saved", saved);
    }
}
