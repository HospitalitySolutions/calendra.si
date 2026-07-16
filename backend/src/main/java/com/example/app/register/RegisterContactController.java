package com.example.app.register;

import com.example.app.security.ratelimit.AuthRateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/register")
public class RegisterContactController {
    private final RegisterContactEmailService emailService;
    private final AuthRateLimiter rateLimiter;

    public RegisterContactController(RegisterContactEmailService emailService, AuthRateLimiter rateLimiter) {
        this.emailService = emailService;
        this.rateLimiter = rateLimiter;
    }

    public record ContactRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Email @Size(max = 254) String email,
            @Size(max = 50) String phone,
            @NotBlank @Size(max = 4_000) String message,
            @Pattern(regexp = "(?i)sl|en") String locale,
            @Pattern(regexp = "(?i)basic|pro|business") String plan,
            @Size(max = 80) String planName,
            @Pattern(regexp = "(?i)monthly|annual") String billing,
            @DecimalMin("0.00") @DecimalMax("1000000.00") BigDecimal estimatedMonthlyTotal
    ) {
    }

    @PostMapping("/contact")
    public ResponseEntity<Map<String, Boolean>> contact(
            @Valid @RequestBody ContactRequest request,
            HttpServletRequest httpRequest
    ) {
        rateLimiter.checkRegisterContact(httpRequest, request.email());
        emailService.sendContactEmails(new RegisterContactEmailService.ContactSubmission(
                request.name(),
                request.email(),
                request.phone(),
                request.message(),
                request.locale(),
                request.plan(),
                request.planName(),
                request.billing(),
                request.estimatedMonthlyTotal()
        ));
        return ResponseEntity.ok(Map.of("sent", true));
    }
}
