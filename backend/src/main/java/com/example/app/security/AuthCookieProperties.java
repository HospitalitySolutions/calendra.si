package com.example.app.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.auth.cookie")
public class AuthCookieProperties {
    private String name = "calendra_auth";
    private String sameSite = "Lax";
    private String path = "/";
    private String domain;
    private Boolean secure;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name == null || name.isBlank() ? "calendra_auth" : name.trim();
    }

    public String getSameSite() {
        return sameSite;
    }

    public void setSameSite(String sameSite) {
        this.sameSite = sameSite == null || sameSite.isBlank() ? "Lax" : sameSite.trim();
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path == null || path.isBlank() ? "/" : path.trim();
    }

    public String getDomain() {
        return domain;
    }

    public void setDomain(String domain) {
        this.domain = domain == null || domain.isBlank() ? null : domain.trim();
    }

    public Boolean getSecure() {
        return secure;
    }

    public void setSecure(Boolean secure) {
        this.secure = secure;
    }
}
