package com.example.app.workspacehardening;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WorkspaceHardeningWebConfig implements WebMvcConfigurer {
    private final WorkspaceRolloutInterceptor rolloutInterceptor;

    public WorkspaceHardeningWebConfig(WorkspaceRolloutInterceptor rolloutInterceptor) {
        this.rolloutInterceptor = rolloutInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(rolloutInterceptor)
                .addPathPatterns("/api/**", "/book/**", "/widget/workspace/**")
                .order(Ordered.HIGHEST_PRECEDENCE + 10);
    }
}
