package com.example.app.entitlement;

import com.example.app.common.TimeSimulationContextInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class PackageAccessWebConfig implements WebMvcConfigurer {
    private final PackageAccessInterceptor packageAccessInterceptor;
    private final TimeSimulationContextInterceptor timeSimulationContextInterceptor;

    public PackageAccessWebConfig(
            PackageAccessInterceptor packageAccessInterceptor,
            TimeSimulationContextInterceptor timeSimulationContextInterceptor) {
        this.packageAccessInterceptor = packageAccessInterceptor;
        this.timeSimulationContextInterceptor = timeSimulationContextInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(timeSimulationContextInterceptor)
                .addPathPatterns("/api/**");
        registry.addInterceptor(packageAccessInterceptor)
                .addPathPatterns("/api/billing/**", "/api/inbox/**");
    }
}
