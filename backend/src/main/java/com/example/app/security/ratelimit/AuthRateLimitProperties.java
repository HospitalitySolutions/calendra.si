package com.example.app.security.ratelimit;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.security.rate-limit")
public class AuthRateLimitProperties {
    /**
     * Keeps local testing flexible while allowing staging/production to switch rate limits off only deliberately.
     */
    private boolean enabled = true;
    /**
     * auto = use Redis when available, otherwise memory; redis = fail closed if Redis is unavailable; memory = local only.
     */
    private String backend = "auto";
    private String redisKeyPrefix = "calendra:rate-limit:auth";
    private int windowSeconds = 60;
    private int maxTrackedKeys = 20_000;

    private int staffLoginPerIp = 30;
    private int staffLoginPerIdentity = 8;
    private int staffSignupPerIp = 12;
    private int staffSignupPerIdentity = 4;
    private int passwordResetPerIp = 8;
    private int passwordResetPerIdentity = 4;

    private int guestLoginPerIp = 40;
    private int guestLoginPerIdentity = 10;
    private int guestSignupPerIp = 20;
    private int guestSignupPerIdentity = 5;
    private int guestSocialLoginPerIp = 50;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getBackend() { return backend; }
    public void setBackend(String backend) { this.backend = backend; }
    public String getRedisKeyPrefix() { return redisKeyPrefix; }
    public void setRedisKeyPrefix(String redisKeyPrefix) { this.redisKeyPrefix = redisKeyPrefix; }
    public int getWindowSeconds() { return windowSeconds; }
    public void setWindowSeconds(int windowSeconds) { this.windowSeconds = windowSeconds; }
    public int getMaxTrackedKeys() { return maxTrackedKeys; }
    public void setMaxTrackedKeys(int maxTrackedKeys) { this.maxTrackedKeys = maxTrackedKeys; }
    public int getStaffLoginPerIp() { return staffLoginPerIp; }
    public void setStaffLoginPerIp(int staffLoginPerIp) { this.staffLoginPerIp = staffLoginPerIp; }
    public int getStaffLoginPerIdentity() { return staffLoginPerIdentity; }
    public void setStaffLoginPerIdentity(int staffLoginPerIdentity) { this.staffLoginPerIdentity = staffLoginPerIdentity; }
    public int getStaffSignupPerIp() { return staffSignupPerIp; }
    public void setStaffSignupPerIp(int staffSignupPerIp) { this.staffSignupPerIp = staffSignupPerIp; }
    public int getStaffSignupPerIdentity() { return staffSignupPerIdentity; }
    public void setStaffSignupPerIdentity(int staffSignupPerIdentity) { this.staffSignupPerIdentity = staffSignupPerIdentity; }
    public int getPasswordResetPerIp() { return passwordResetPerIp; }
    public void setPasswordResetPerIp(int passwordResetPerIp) { this.passwordResetPerIp = passwordResetPerIp; }
    public int getPasswordResetPerIdentity() { return passwordResetPerIdentity; }
    public void setPasswordResetPerIdentity(int passwordResetPerIdentity) { this.passwordResetPerIdentity = passwordResetPerIdentity; }
    public int getGuestLoginPerIp() { return guestLoginPerIp; }
    public void setGuestLoginPerIp(int guestLoginPerIp) { this.guestLoginPerIp = guestLoginPerIp; }
    public int getGuestLoginPerIdentity() { return guestLoginPerIdentity; }
    public void setGuestLoginPerIdentity(int guestLoginPerIdentity) { this.guestLoginPerIdentity = guestLoginPerIdentity; }
    public int getGuestSignupPerIp() { return guestSignupPerIp; }
    public void setGuestSignupPerIp(int guestSignupPerIp) { this.guestSignupPerIp = guestSignupPerIp; }
    public int getGuestSignupPerIdentity() { return guestSignupPerIdentity; }
    public void setGuestSignupPerIdentity(int guestSignupPerIdentity) { this.guestSignupPerIdentity = guestSignupPerIdentity; }
    public int getGuestSocialLoginPerIp() { return guestSocialLoginPerIp; }
    public void setGuestSocialLoginPerIp(int guestSocialLoginPerIp) { this.guestSocialLoginPerIp = guestSocialLoginPerIp; }
}
