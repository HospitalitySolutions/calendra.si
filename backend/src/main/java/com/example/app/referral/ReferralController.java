package com.example.app.referral;

import com.example.app.user.User;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/referrals")
public class ReferralController {

    private final ReferralService referralService;

    public ReferralController(ReferralService referralService) {
        this.referralService = referralService;
    }

    @GetMapping("/my-link")
    public ResponseEntity<?> myLink(@AuthenticationPrincipal User me) {
        if (me == null || me.getCompany() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Not authenticated."));
        }
        return ResponseEntity.ok(referralService.getOrCreateMyLink(me));
    }

    @GetMapping("/my-referrals")
    public ResponseEntity<?> myReferrals(@AuthenticationPrincipal User me) {
        if (me == null || me.getCompany() == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Not authenticated."));
        }
        List<ReferralService.MyReferralRow> rows = referralService.listMyReferrals(me);
        return ResponseEntity.ok(rows);
    }
}
