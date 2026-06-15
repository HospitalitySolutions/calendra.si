package com.example.app.settings;

import com.example.app.company.PlatformTenantAccountLinkService;
import com.example.app.files.TenantFileS3Service;
import java.util.Locale;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import com.example.app.user.User;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {
    private static final String MASKED_SECRET_VALUE = "••••••••";
    private static final Set<SettingKey> SECRET_KEYS = EnumSet.of(
            SettingKey.FISCAL_CERTIFICATE_PASSWORD,
            SettingKey.INBOX_INFOBIP_API_KEY,
            SettingKey.INBOX_WHATSAPP_ACCESS_TOKEN,
            SettingKey.INBOX_WHATSAPP_APP_SECRET,
            SettingKey.INBOX_VIBER_BOT_TOKEN,
            SettingKey.WIDGET_TURNSTILE_SECRET_KEY
    );

    private final AppSettingRepository repository;
    private final SettingsCryptoService crypto;
    private final TenantFileS3Service fileStorage;
    private final GlobalPaymentProviderService globalPaymentProviders;
    private final GlobalConsumablesFeatureService globalConsumablesFeatureService;
    private final PlatformTenantAccountLinkService platformTenantAccountLinkService;
    private final CourseModuleAccessService courseModuleAccessService;

    @Autowired
    public SettingsController(
            AppSettingRepository repository,
            SettingsCryptoService crypto,
            TenantFileS3Service fileStorage,
            GlobalPaymentProviderService globalPaymentProviders,
            GlobalConsumablesFeatureService globalConsumablesFeatureService,
            PlatformTenantAccountLinkService platformTenantAccountLinkService,
            CourseModuleAccessService courseModuleAccessService
    ) {
        this.repository = repository;
        this.crypto = crypto;
        this.fileStorage = fileStorage;
        this.globalPaymentProviders = globalPaymentProviders;
        this.globalConsumablesFeatureService = globalConsumablesFeatureService;
        this.platformTenantAccountLinkService = platformTenantAccountLinkService;
        this.courseModuleAccessService = courseModuleAccessService;
    }

    /** Backwards-compatible constructor for older unit tests. Runtime wiring uses the @Autowired constructor above. */
    public SettingsController(
            AppSettingRepository repository,
            SettingsCryptoService crypto,
            TenantFileS3Service fileStorage,
            GlobalPaymentProviderService globalPaymentProviders,
            GlobalConsumablesFeatureService globalConsumablesFeatureService,
            PlatformTenantAccountLinkService platformTenantAccountLinkService
    ) {
        this(repository, crypto, fileStorage, globalPaymentProviders, globalConsumablesFeatureService, platformTenantAccountLinkService, null);
    }

    public record PaymentProviderCapabilitiesResponse(boolean stripeEnabled, boolean paypalEnabled) {}
    public record ModuleCapabilitiesResponse(boolean consumablesEnabled) {}

    @GetMapping
    public Map<String, String> all(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        return repository.findAllByCompanyId(companyId).stream()
                .filter(s -> isKnownSettingKey(s.getKey()))
                .collect(java.util.stream.Collectors.toMap(AppSetting::getKey, s -> decodeForRead(s.getKey(), s.getValue())));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    @Transactional
    public Map<String, String> save(@RequestBody Map<String, String> payload, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        if ("false".equalsIgnoreCase(String.valueOf(payload.get(SettingKey.COURSES_ENABLED.name())).trim()) && courseModuleAccessService != null) {
            courseModuleAccessService.assertCanDisable(companyId);
        }
        Arrays.stream(SettingKey.values()).forEach(key -> {
            if (payload.containsKey(key.name())) {
                String submittedValue = payload.get(key.name());
                if (isSecretKey(key) && isMaskedSecretValue(submittedValue)) {
                    return;
                }
                var s = repository.findByCompanyIdAndKey(companyId, key).orElseGet(() -> {
                    var ns = new AppSetting();
                    ns.setCompany(me.getCompany());
                    return ns;
                });
                s.setKey(key.name());
                s.setValue(encodeForSave(key, submittedValue));
                repository.save(s);
            }
        });
        platformTenantAccountLinkService.syncFromTenantSettings(me.getCompany(), payload);
        return all(me);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping(value = "/guest-app/assets/{assetType}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public GuestAppAssetUploadResponse uploadGuestAppAsset(
            @PathVariable String assetType,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User me
    ) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().trim().toLowerCase(Locale.ROOT);
        if (!contentType.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only image files are allowed.");
        }
        String settingField = normalizeGuestAppAssetField(assetType);
        var stored = fileStorage.uploadGuestAppAsset(me.getCompany(), file);
        String publicUrl = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/public/widget/guest-assets")
                .queryParam("key", stored.objectKey())
                .toUriString();
        return new GuestAppAssetUploadResponse(settingField, stored.objectKey(), publicUrl, stored.contentType(), stored.sizeBytes());
    }

    @GetMapping("/payment-capabilities")
    public PaymentProviderCapabilitiesResponse paymentCapabilities(@AuthenticationPrincipal User me) {
        var caps = globalPaymentProviders.capabilities();
        return new PaymentProviderCapabilitiesResponse(caps.stripeEnabled(), caps.paypalEnabled());
    }

    @GetMapping("/module-capabilities")
    public ModuleCapabilitiesResponse moduleCapabilities(@AuthenticationPrincipal User me) {
        return new ModuleCapabilitiesResponse(globalConsumablesFeatureService.isEnabledForUser(me));
    }

    private String encodeForSave(SettingKey key, String value) {
        if (isSecretKey(key)) {
            String raw = value == null ? "" : value.trim();
            return raw.isBlank() ? "" : crypto.encrypt(raw);
        }
        return value;
    }

    private String decodeForRead(String keyName, String value) {
        SettingKey key = parseSettingKey(keyName);
        if (key != null && isSecretKey(key)) {
            String decrypted = crypto.decryptIfEncrypted(value);
            return decrypted == null || decrypted.isBlank() ? "" : MASKED_SECRET_VALUE;
        }
        return value;
    }

    private boolean isSecretKey(SettingKey key) {
        return key != null && SECRET_KEYS.contains(key);
    }

    private boolean isMaskedSecretValue(String value) {
        if (value == null) return false;
        String trimmed = value.trim();
        return MASKED_SECRET_VALUE.equals(trimmed)
                || "********".equals(trimmed)
                || "••••••••••••••••".equals(trimmed);
    }

    private SettingKey parseSettingKey(String keyName) {
        if (keyName == null || keyName.isBlank()) return null;
        try {
            return SettingKey.valueOf(keyName);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private boolean isKnownSettingKey(String keyName) {
        if (keyName == null || keyName.isBlank()) return false;
        return Arrays.stream(SettingKey.values()).anyMatch(k -> k.name().equals(keyName));
    }

    private static String normalizeGuestAppAssetField(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "card", "cardimage", "cardimageurl" -> "cardImageUrl";
            case "logo", "logoimage", "logoimageurl" -> "logoImageUrl";
            case "icon", "iconimage", "iconimageurl" -> "iconImageUrl";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported guest app asset type.");
        };
    }

    public record GuestAppAssetUploadResponse(
            String settingField,
            String objectKey,
            String publicUrl,
            String contentType,
            long sizeBytes
    ) {}
}
