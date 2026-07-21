package com.example.app.observability.legacy;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class LegacyEndpointWebConfig implements WebMvcConfigurer {
    private final LegacyEndpointUsageInterceptor interceptor;

    public LegacyEndpointWebConfig(LegacyEndpointUsageInterceptor interceptor) {
        this.interceptor = interceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor)
                .addPathPatterns("/api/**")
                .order(Ordered.HIGHEST_PRECEDENCE + 20);
    }
}
