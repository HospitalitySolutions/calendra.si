package com.example.app.ai;

import com.example.app.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/ai/voice-booking")
public class VoiceBookingController {
    private final VoiceBookingService voiceBookingService;
    private final OpenAiConfig openAiConfig;

    public VoiceBookingController(VoiceBookingService voiceBookingService, OpenAiConfig openAiConfig) {
        this.voiceBookingService = voiceBookingService;
        this.openAiConfig = openAiConfig;
    }

    public record VoiceBookingRequest(String transcript, Boolean confirmCancellation, String locale, Long clientId, String clientName) {}

    public record VoiceBookingStatusResponse(boolean configured) {}

    @GetMapping("/status")
    public VoiceBookingStatusResponse status() {
        return new VoiceBookingStatusResponse(openAiConfig.isConfigured());
    }

    @PostMapping
    public VoiceBookingService.VoiceActionResponse book(@RequestBody VoiceBookingRequest body, @AuthenticationPrincipal User me) {
        if (body == null || body.transcript() == null || body.transcript().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Polje transcript je obvezno.");
        }
        return voiceBookingService.handleTranscript(body.transcript(), me, Boolean.TRUE.equals(body.confirmCancellation()), body.locale(), body.clientId(), body.clientName());
    }
}
