package com.example.app.session;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app.realtime")
public class SessionBookingRealtimeProperties {
    private final Redis redis = new Redis();

    public Redis getRedis() {
        return redis;
    }

    public static class Redis {
        /** Enables cross-instance SSE fan-out through Redis Pub/Sub. */
        private boolean enabled = false;
        /** Shared channel all backend instances subscribe to for booking realtime events. */
        private String channel = "calendra:session-bookings:events";

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getChannel() {
            return channel == null || channel.isBlank() ? "calendra:session-bookings:events" : channel.trim();
        }

        public void setChannel(String channel) {
            this.channel = channel;
        }
    }
}
