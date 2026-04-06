package com.example.app.settings;

import java.util.Arrays;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import com.example.app.user.User;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {
    private final AppSettingRepository repository;
    private final SettingsCryptoService crypto;

    public SettingsController(AppSettingRepository repository, SettingsCryptoService crypto) {
        this.repository = repository;
        this.crypto = crypto;
    }

    @GetMapping
    public Map<String, String> all(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        return repository.findAllByCompanyId(companyId).stream()
                .filter(s -> isKnownSettingKey(s.getKey()))
                .collect(java.util.stream.Collectors.toMap(AppSetting::getKey, s -> decodeForRead(s.getKey(), s.getValue())));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    public Map<String, String> save(@RequestBody Map<String, String> payload, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Arrays.stream(SettingKey.values()).forEach(key -> {
            if (payload.containsKey(key.name())) {
                var s = repository.findByCompanyIdAndKey(companyId, key).orElseGet(() -> {
                    var ns = new AppSetting();
                    ns.setCompany(me.getCompany());
                    return ns;
                });
                s.setKey(key.name());
                s.setValue(encodeForSave(key, payload.get(key.name())));
                repository.save(s);
            }
        });
        return all(me);
    }

    private String encodeForSave(SettingKey key, String value) {
        if (key == SettingKey.FISCAL_CERTIFICATE_PASSWORD
                || key == SettingKey.INBOX_INFOBIP_API_KEY
                || key == SettingKey.INBOX_WHATSAPP_ACCESS_TOKEN
                || key == SettingKey.INBOX_WHATSAPP_APP_SECRET
                || key == SettingKey.INBOX_VIBER_BOT_TOKEN) {
            return crypto.encrypt(value);
        }
        return value;
    }

    private String decodeForRead(String keyName, String value) {
        if (SettingKey.FISCAL_CERTIFICATE_PASSWORD.name().equals(keyName)
                || SettingKey.INBOX_INFOBIP_API_KEY.name().equals(keyName)
                || SettingKey.INBOX_WHATSAPP_ACCESS_TOKEN.name().equals(keyName)
                || SettingKey.INBOX_WHATSAPP_APP_SECRET.name().equals(keyName)
                || SettingKey.INBOX_VIBER_BOT_TOKEN.name().equals(keyName)) {
            return crypto.decryptIfEncrypted(value);
        }
        return value;
    }

    private boolean isKnownSettingKey(String keyName) {
        if (keyName == null || keyName.isBlank()) return false;
        return Arrays.stream(SettingKey.values()).anyMatch(k -> k.name().equals(keyName));
    }
}
