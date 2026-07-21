package com.example.app.observability.legacy;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class LegacyEndpointUsageInterceptor implements HandlerInterceptor {
    private static final String INVOCATION_ATTRIBUTE = LegacyEndpointUsageInterceptor.class.getName() + ".invocation";

    private final LegacyEndpointUsageService usageService;

    public LegacyEndpointUsageInterceptor(LegacyEndpointUsageService usageService) {
        this.usageService = usageService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        LegacyEndpointDefinition endpoint = definition(handler);
        if (endpoint == null) return true;

        request.setAttribute(INVOCATION_ATTRIBUTE, new Invocation(endpoint, System.nanoTime()));
        response.setHeader("Deprecation", "true");
        response.setHeader("X-Calendra-Legacy-Endpoint", endpoint.id());
        if (!endpoint.replacement().isBlank()) {
            response.setHeader("X-Calendra-Replacement", endpoint.replacement());
        }
        if (endpoint.hasConcreteReplacementPath()) {
            response.addHeader("Link", "<" + endpoint.replacement() + ">; rel=\"successor-version\"");
        }
        return true;
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request,
            HttpServletResponse response,
            Object handler,
            Exception ex
    ) {
        Object value = request.getAttribute(INVOCATION_ATTRIBUTE);
        if (!(value instanceof Invocation invocation)) return;
        usageService.record(
                invocation.endpoint(),
                request,
                response.getStatus(),
                System.nanoTime() - invocation.startedAtNanos(),
                ex
        );
    }

    private static LegacyEndpointDefinition definition(Object handler) {
        if (!(handler instanceof HandlerMethod handlerMethod)) return null;
        TrackLegacyEndpoint methodAnnotation = AnnotatedElementUtils.findMergedAnnotation(
                handlerMethod.getMethod(),
                TrackLegacyEndpoint.class
        );
        if (methodAnnotation != null) return methodAnnotation.value();
        TrackLegacyEndpoint typeAnnotation = AnnotatedElementUtils.findMergedAnnotation(
                handlerMethod.getBeanType(),
                TrackLegacyEndpoint.class
        );
        return typeAnnotation == null ? null : typeAnnotation.value();
    }

    private record Invocation(LegacyEndpointDefinition endpoint, long startedAtNanos) {}
}
