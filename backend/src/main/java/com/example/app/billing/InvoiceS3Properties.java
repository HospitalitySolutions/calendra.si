package com.example.app.billing;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.invoice-s3")
public class InvoiceS3Properties {

    private boolean enabled;
    private String bucket = "";
    /** Logical prefix inside the bucket (no leading/trailing slashes). */
    private String prefix = "calendra/tenants";
    /** Optional public base URL (e.g. CloudFront domain) used to expose uploaded assets. */
    private String publicBaseUrl = "";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getBucket() {
        return bucket;
    }

    public void setBucket(String bucket) {
        this.bucket = bucket;
    }

    public String getPrefix() {
        return prefix;
    }

    public void setPrefix(String prefix) {
        this.prefix = prefix;
    }

    public String getPublicBaseUrl() {
        return publicBaseUrl;
    }

    public void setPublicBaseUrl(String publicBaseUrl) {
        this.publicBaseUrl = publicBaseUrl;
    }

    public boolean isReady() {
        return enabled && bucket != null && !bucket.isBlank();
    }
}
