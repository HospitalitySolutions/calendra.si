package com.example.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.seed")
public class SeederProperties {
    private boolean enabled = true;
    private boolean demoTenantsEnabled = true;
    private boolean superAdminEnabled = true;
    private String superAdminEmail = "dmirc@calendra.si";
    private String superAdminPassword = "Admin123!";
    private String demoAdminPassword = "Admin123!";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isDemoTenantsEnabled() {
        return demoTenantsEnabled;
    }

    public void setDemoTenantsEnabled(boolean demoTenantsEnabled) {
        this.demoTenantsEnabled = demoTenantsEnabled;
    }

    public boolean isSuperAdminEnabled() {
        return superAdminEnabled;
    }

    public void setSuperAdminEnabled(boolean superAdminEnabled) {
        this.superAdminEnabled = superAdminEnabled;
    }

    public String getSuperAdminEmail() {
        return superAdminEmail;
    }

    public void setSuperAdminEmail(String superAdminEmail) {
        this.superAdminEmail = superAdminEmail;
    }

    public String getSuperAdminPassword() {
        return superAdminPassword;
    }

    public void setSuperAdminPassword(String superAdminPassword) {
        this.superAdminPassword = superAdminPassword;
    }

    public String getDemoAdminPassword() {
        return demoAdminPassword;
    }

    public void setDemoAdminPassword(String demoAdminPassword) {
        this.demoAdminPassword = demoAdminPassword;
    }
}
