package com.example.app.widget;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Serves the standalone public booking experience while keeping the tenant code
 * in the browser URL. The page itself is static and resolves the tenant from the
 * current path, so the same document also works behind the calendra.si reverse
 * proxy at /narocanje/{tenantCode}.
 */
@Controller
public class PublicBookingPageController {

    @GetMapping("/widget/{tenantCode:[a-zA-Z0-9_-]+}")
    public String bookingPage() {
        return "forward:/widget/booking-page.html";
    }
}
