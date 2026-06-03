package com.example.app.session;

import java.nio.charset.StandardCharsets;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
@ConditionalOnProperty(prefix = "app.realtime.redis", name = "enabled", havingValue = "true")
public class SessionBookingRealtimeRedisConfig {
    @Bean
    RedisMessageListenerContainer sessionBookingRealtimeRedisListenerContainer(
            RedisConnectionFactory connectionFactory,
            SessionBookingRealtimeService realtimeService,
            SessionBookingRealtimeProperties properties
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener((message, pattern) -> realtimeService.handleRedisMessage(
                new String(message.getBody(), StandardCharsets.UTF_8)
        ), new ChannelTopic(properties.getRedis().getChannel()));
        return container;
    }
}
