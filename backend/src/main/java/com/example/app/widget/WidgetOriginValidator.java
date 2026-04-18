package com.example.app.widget;

import com.example.app.company.Company;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class WidgetOriginValidator {
    private final AppSettingRepository settings;
    private final WidgetSecurityProperties properties;

    public WidgetOriginValidator(AppSettingRepository settings, WidgetSecurityProperties properties) {
        this.settings = settings;
        this.properties = properties;
    }

    public void validate(Company company, HttpServletRequest request) {
        Set<String> allowed = allowedOrigins(company.getId());
        if (allowed.isEmpty()) {
            return;
        }
        String candidate = normalizeOrigin(request.getHeader("Origin"));
        if ((candidate == null || candidate.isBlank()) && properties.isTrustRefererWhenOriginMissing()) {
            candidate = normalizeOriginFromReferer(request.getHeader("Referer"));
        }
        if (candidate == null || candidate.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This website is not allowed to use the booking widget.");
        }
        if (!isAllowed(allowed, candidate)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This website is not allowed to use the booking widget.");
        }
    }

    public Set<String> allowedOrigins(Long companyId) {
        Set<String> origins = new LinkedHashSet<>();
        settings.findByCompanyIdAndKey(companyId, SettingKey.WIDGET_ALLOWED_ORIGINS)
                .map(s -> s.getValue())
                .ifPresent(v -> Arrays.stream(v.split("[\\n, ]+")).map(this::normalizeAllowedPattern).filter(s -> s != null && !s.isBlank()).forEach(origins::add));
        List<String> globals = properties.getAllowedOrigins();
        if (globals != null) {
            globals.stream().map(this::normalizeAllowedPattern).filter(s -> s != null && !s.isBlank()).forEach(origins::add);
        }
        return origins;
    }

    private boolean isAllowed(Set<String> allowed, String candidateOrigin) {
        String normalizedCandidate = normalizeOrigin(candidateOrigin);
        if (normalizedCandidate == null) return false;
        for (String pattern : allowed) {
            if (pattern.startsWith("*.")) {
                String suffix = pattern.substring(1).toLowerCase(Locale.ROOT); // .example.com
                String host = hostOf(normalizedCandidate);
                if (host != null && host.toLowerCase(Locale.ROOT).endsWith(suffix)) {
                    return true;
                }
            } else if (pattern.equalsIgnoreCase(normalizedCandidate)) {
                return true;
            }
        }
        return false;
    }

    private String normalizeAllowedPattern(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.isEmpty()) return null;
        if (value.startsWith("*.")) return value.toLowerCase(Locale.ROOT);
        return normalizeOrigin(value);
    }

    private String normalizeOriginFromReferer(String referer) {
        if (referer == null || referer.isBlank()) return null;
        try {
            URI uri = URI.create(referer.trim());
            if (uri.getScheme() == null || uri.getHost() == null) return null;
            int port = uri.getPort();
            String base = uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getHost().toLowerCase(Locale.ROOT);
            if (port > 0 && !(("http".equalsIgnoreCase(uri.getScheme()) && port == 80) || ("https".equalsIgnoreCase(uri.getScheme()) && port == 443))) {
                base += ":" + port;
            }
            return base;
        } catch (Exception ex) {
            return null;
        }
    }

    private String normalizeOrigin(String origin) {
        if (origin == null || origin.isBlank()) return null;
        try {
            URI uri = URI.create(origin.trim());
            if (uri.getScheme() == null || uri.getHost() == null) return null;
            int port = uri.getPort();
            String base = uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getHost().toLowerCase(Locale.ROOT);
            if (port > 0 && !(("http".equalsIgnoreCase(uri.getScheme()) && port == 80) || ("https".equalsIgnoreCase(uri.getScheme()) && port == 443))) {
                base += ":" + port;
            }
            return base;
        } catch (Exception ex) {
            return null;
        }
    }

    private String hostOf(String origin) {
        try {
            return URI.create(origin).getHost();
        } catch (Exception ex) {
            return null;
        }
    }
}
