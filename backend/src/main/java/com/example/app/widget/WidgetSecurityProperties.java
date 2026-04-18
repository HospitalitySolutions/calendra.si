package com.example.app.widget;

import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.widget.security")
public class WidgetSecurityProperties {
    private List<String> allowedOrigins = new ArrayList<>();
    private int generalRequestsPerMinutePerIp = 120;
    private int generalRequestsPerMinutePerTenant = 600;
    private int bookingsPerMinutePerIp = 10;
    private int bookingsPerMinutePerTenant = 120;
    private boolean trustRefererWhenOriginMissing = true;

    public List<String> getAllowedOrigins() { return allowedOrigins; }
    public void setAllowedOrigins(List<String> allowedOrigins) { this.allowedOrigins = allowedOrigins; }
    public int getGeneralRequestsPerMinutePerIp() { return generalRequestsPerMinutePerIp; }
    public void setGeneralRequestsPerMinutePerIp(int v) { this.generalRequestsPerMinutePerIp = v; }
    public int getGeneralRequestsPerMinutePerTenant() { return generalRequestsPerMinutePerTenant; }
    public void setGeneralRequestsPerMinutePerTenant(int v) { this.generalRequestsPerMinutePerTenant = v; }
    public int getBookingsPerMinutePerIp() { return bookingsPerMinutePerIp; }
    public void setBookingsPerMinutePerIp(int v) { this.bookingsPerMinutePerIp = v; }
    public int getBookingsPerMinutePerTenant() { return bookingsPerMinutePerTenant; }
    public void setBookingsPerMinutePerTenant(int v) { this.bookingsPerMinutePerTenant = v; }
    public boolean isTrustRefererWhenOriginMissing() { return trustRefererWhenOriginMissing; }
    public void setTrustRefererWhenOriginMissing(boolean trustRefererWhenOriginMissing) { this.trustRefererWhenOriginMissing = trustRefererWhenOriginMissing; }
}
