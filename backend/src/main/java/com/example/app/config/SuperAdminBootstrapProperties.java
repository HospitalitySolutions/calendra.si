package com.example.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.bootstrap.superadmin")
public class SuperAdminBootstrapProperties {
    /**
     * Disabled by default. Enable explicitly through environment variables or
     * Secrets Manager only for the one-time initial platform admin bootstrap.
     */
    private boolean enabled = false;

    private String email = "";
    private String password = "";
    private String firstName = "Platform";
    private String lastName = "Admin";
    private String platformCompanyName = "Platform Admin";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public String getPlatformCompanyName() {
        return platformCompanyName;
    }

    public void setPlatformCompanyName(String platformCompanyName) {
        this.platformCompanyName = platformCompanyName;
    }
}
