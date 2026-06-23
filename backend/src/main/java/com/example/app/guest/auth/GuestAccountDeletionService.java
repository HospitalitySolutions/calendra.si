package com.example.app.guest.auth;

import com.example.app.auth.SignupEmailIntent;
import com.example.app.auth.SignupEmailIntentRepository;
import com.example.app.client.Client;
import com.example.app.client.ClientAnonymizationService;
import com.example.app.guest.model.GuestDeviceTokenRepository;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import com.example.app.files.TenantFileS3Service;
import jakarta.mail.internet.MimeMessage;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GuestAccountDeletionService {
    private static final Logger log = LoggerFactory.getLogger(GuestAccountDeletionService.class);

    private final GuestUserRepository guestUsers;
    private final GuestTenantLinkRepository tenantLinks;
    private final GuestDeviceTokenRepository deviceTokens;
    private final GuestPasswordResetTokenRepository passwordResetTokens;
    private final SignupEmailIntentRepository signupEmailIntents;
    private final ClientAnonymizationService clientAnonymizationService;
    private final TenantFileS3Service fileStorage;
    private final JavaMailSender mailSender;
    private final String mailFrom;
    private final boolean mailConfigured;

    public GuestAccountDeletionService(
            GuestUserRepository guestUsers,
            GuestTenantLinkRepository tenantLinks,
            GuestDeviceTokenRepository deviceTokens,
            GuestPasswordResetTokenRepository passwordResetTokens,
            SignupEmailIntentRepository signupEmailIntents,
            ClientAnonymizationService clientAnonymizationService,
            TenantFileS3Service fileStorage,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${app.mail.from:}") String mailFrom,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${spring.mail.username:}") String mailUsername
    ) {
        this.guestUsers = guestUsers;
        this.tenantLinks = tenantLinks;
        this.deviceTokens = deviceTokens;
        this.passwordResetTokens = passwordResetTokens;
        this.signupEmailIntents = signupEmailIntents;
        this.clientAnonymizationService = clientAnonymizationService;
        this.fileStorage = fileStorage;
        this.mailSender = mailSender;
        this.mailFrom = mailFrom == null ? "" : mailFrom;
        this.mailConfigured = mailSender != null
                && mailHost != null && !mailHost.isBlank()
                && mailUsername != null && !mailUsername.isBlank()
                && this.mailFrom != null && !this.mailFrom.isBlank();
    }

    @Transactional
    public void deleteGuestAccount(GuestUser authenticatedGuest, boolean confirmed) {
        if (!confirmed) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Account deletion confirmation is required.");
        }
        if (authenticatedGuest == null || authenticatedGuest.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Guest authentication required.");
        }

        GuestUser guestUser = guestUsers.findById(authenticatedGuest.getId())
                .filter(GuestUser::isActive)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Guest session not found."));

        Long guestUserId = guestUser.getId();
        String originalEmail = normalizedEmail(guestUser.getEmail());
        String originalLanguage = guestUser.getLanguage();

        unlinkAndAnonymizeTenantClients(guestUser, guestUserId);
        revokeResetAndSignupIntents(guestUserId, originalEmail);
        deviceTokens.deleteAllByGuestUserId(guestUserId);
        deleteProfilePictureObject(guestUser);

        anonymizeGuestUser(guestUser, guestUserId);
        guestUsers.save(guestUser);

        sendDeletionConfirmation(originalEmail, originalLanguage);
    }

    private void unlinkAndAnonymizeTenantClients(GuestUser guestUser, Long guestUserId) {
        List<GuestTenantLink> links = tenantLinks.findAllByGuestUserIdOrderByUpdatedAtDesc(guestUserId);
        for (GuestTenantLink link : links) {
            Client client = link.getClient();
            if (client != null && !client.isAnonymized()) {
                Client anonymized = clientAnonymizationService.anonymizeForGuest(client, guestUserId);
                anonymized.setActive(false);
                link.setClient(anonymized);
            }
            link.setStatus(GuestTenantLinkStatus.LEFT);
            link.setLastUsedAt(Instant.now());
            tenantLinks.save(link);
        }
    }

    private void revokeResetAndSignupIntents(Long guestUserId, String originalEmail) {
        passwordResetTokens.findAllByGuestUser_IdAndActiveTrue(guestUserId).forEach(token -> {
            token.setActive(false);
            token.setUsedAt(token.getUsedAt() == null ? Instant.now() : token.getUsedAt());
            passwordResetTokens.save(token);
        });
        if (originalEmail != null) {
            for (SignupEmailIntent intent : signupEmailIntents.findAllByEmailIgnoreCaseAndActiveTrue(originalEmail)) {
                intent.setActive(false);
                signupEmailIntents.save(intent);
            }
        }
    }

    private void deleteProfilePictureObject(GuestUser guestUser) {
        String key = guestUser.getProfilePictureS3Key();
        if (key != null && !key.isBlank()) {
            fileStorage.deleteQuietly(key);
        }
    }

    private void anonymizeGuestUser(GuestUser guestUser, Long guestUserId) {
        String pseudonym = "deleted-guest-" + guestUserId;
        guestUser.setEmail(pseudonym + "@deleted.calendra.local");
        guestUser.setPasswordHash(null);
        guestUser.setFirstName("Deleted");
        guestUser.setLastName("Guest");
        guestUser.setPhone(null);
        guestUser.setLanguage(blankToDefault(guestUser.getLanguage(), "sl"));
        guestUser.setActive(false);
        guestUser.setEmailVerified(false);
        guestUser.setNotifyMessagesEnabled(false);
        guestUser.setNotifyRemindersEnabled(false);
        guestUser.setNotifyReminderMinutes(60);
        guestUser.setGoogleSubject(null);
        guestUser.setAppleSubject(null);
        guestUser.setStripeCustomerId(null);
        guestUser.setProfilePictureS3Key(null);
        guestUser.setProfilePictureContentType(null);
        guestUser.setLastLoginAt(null);
    }

    private void sendDeletionConfirmation(String email, String language) {
        if (!mailConfigured || email == null || email.isBlank()) {
            return;
        }
        boolean sl = language != null && language.toLowerCase(Locale.ROOT).startsWith("sl");
        String subject = sl ? "Račun Calendra Guest App je bil izbrisan" : "Your Calendra Guest App account was deleted";
        String body = sl ? """
                Pozdravljeni,

                vaš račun Calendra Guest App je bil izbrisan oziroma anonimiziran.

                Nekateri podatki se lahko hranijo dlje, če je to potrebno zaradi računovodskih, davčnih, pravnih ali varnostnih obveznosti ponudnika oziroma Calendre.

                Če tega niste zahtevali vi, nam čim prej pišite.
                """ : """
                Hello,

                Your Calendra Guest App account has been deleted or anonymized.

                Some records may be retained for longer where required for accounting, tax, legal, security, or tenant-provider obligations.

                If you did not request this, please contact us as soon as possible.
                """;
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setFrom(mailFrom);
            helper.setTo(email);
            helper.setSubject(subject);
            helper.setText(body, false);
            mailSender.send(message);
        } catch (Exception ex) {
            log.warn("Guest account deletion confirmation email could not be sent. guestEmailHash={}", Integer.toHexString(email.hashCode()));
        }
    }

    private static String normalizedEmail(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
