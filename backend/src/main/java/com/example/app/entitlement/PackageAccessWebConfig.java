package com.example.app.entitlement;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class PackageAccessWebConfig implements WebMvcConfigurer {
    private final PackageAccessInterceptor packageAccessInterceptor;

    public PackageAccessWebConfig(PackageAccessInterceptor packageAccessInterceptor) {
        this.packageAccessInterceptor = packageAccessInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(packageAccessInterceptor)
                .addPathPatterns("/api/billing/**", "/api/inbox/**");
    }
}
