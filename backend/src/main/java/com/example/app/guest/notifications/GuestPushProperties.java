package com.example.app.guest.notifications;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.guest.push")
public class GuestPushProperties {
    private boolean enabled;
    private int connectTimeoutSeconds = 10;
    private final Fcm fcm = new Fcm();
    private final Apns apns = new Apns();

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int getConnectTimeoutSeconds() {
        return connectTimeoutSeconds;
    }

    public void setConnectTimeoutSeconds(int connectTimeoutSeconds) {
        this.connectTimeoutSeconds = connectTimeoutSeconds;
    }

    public Fcm getFcm() {
        return fcm;
    }

    public Apns getApns() {
        return apns;
    }

    public static class Fcm {
        private String projectId;
        private String serviceAccountJson;
        private String serviceAccountJsonBase64;
        private String serviceAccountFile;
        private String tokenUri = "https://oauth2.googleapis.com/token";
        private String scope = "https://www.googleapis.com/auth/firebase.messaging";

        public String getProjectId() {
            return projectId;
        }

        public void setProjectId(String projectId) {
            this.projectId = projectId;
        }

        public String getServiceAccountJson() {
            return serviceAccountJson;
        }

        public void setServiceAccountJson(String serviceAccountJson) {
            this.serviceAccountJson = serviceAccountJson;
        }

        public String getServiceAccountJsonBase64() {
            return serviceAccountJsonBase64;
        }

        public void setServiceAccountJsonBase64(String serviceAccountJsonBase64) {
            this.serviceAccountJsonBase64 = serviceAccountJsonBase64;
        }

        public String getServiceAccountFile() {
            return serviceAccountFile;
        }

        public void setServiceAccountFile(String serviceAccountFile) {
            this.serviceAccountFile = serviceAccountFile;
        }

        public String getTokenUri() {
            return tokenUri;
        }

        public void setTokenUri(String tokenUri) {
            this.tokenUri = tokenUri;
        }

        public String getScope() {
            return scope;
        }

        public void setScope(String scope) {
            this.scope = scope;
        }
    }

    public static class Apns {
        private String teamId;
        private String keyId;
        private String bundleId;
        private String privateKeyPem;
        private String privateKeyBase64;
        private String privateKeyFile;
        private boolean useSandbox = true;

        public String getTeamId() {
            return teamId;
        }

        public void setTeamId(String teamId) {
            this.teamId = teamId;
        }

        public String getKeyId() {
            return keyId;
        }

        public void setKeyId(String keyId) {
            this.keyId = keyId;
        }

        public String getBundleId() {
            return bundleId;
        }

        public void setBundleId(String bundleId) {
            this.bundleId = bundleId;
        }

        public String getPrivateKeyPem() {
            return privateKeyPem;
        }

        public void setPrivateKeyPem(String privateKeyPem) {
            this.privateKeyPem = privateKeyPem;
        }

        public String getPrivateKeyBase64() {
            return privateKeyBase64;
        }

        public void setPrivateKeyBase64(String privateKeyBase64) {
            this.privateKeyBase64 = privateKeyBase64;
        }

        public String getPrivateKeyFile() {
            return privateKeyFile;
        }

        public void setPrivateKeyFile(String privateKeyFile) {
            this.privateKeyFile = privateKeyFile;
        }

        public boolean isUseSandbox() {
            return useSandbox;
        }

        public void setUseSandbox(boolean useSandbox) {
            this.useSandbox = useSandbox;
        }
    }
}
