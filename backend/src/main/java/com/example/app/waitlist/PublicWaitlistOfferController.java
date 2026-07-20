package com.example.app.waitlist;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public-waitlists/offers")
public class PublicWaitlistOfferController {
    private final WaitlistService waitlistService;

    public PublicWaitlistOfferController(WaitlistService waitlistService) {
        this.waitlistService = waitlistService;
    }

    @GetMapping("/{offerId}")
    public WaitlistService.PublicOfferView detail(@PathVariable Long offerId) {
        return waitlistService.publicOffer(offerId);
    }

    @PostMapping("/{offerId}/accept")
    public WaitlistService.PublicOfferView accept(@PathVariable Long offerId) {
        return waitlistService.publicAccept(offerId);
    }

    @PostMapping("/{offerId}/decline")
    public WaitlistService.PublicOfferView decline(@PathVariable Long offerId) {
        return waitlistService.publicDecline(offerId);
    }

    @PostMapping("/{offerId}/decline-and-leave")
    public WaitlistService.PublicOfferView declineAndLeave(@PathVariable Long offerId) {
        return waitlistService.publicDeclineAndLeave(offerId);
    }
}
