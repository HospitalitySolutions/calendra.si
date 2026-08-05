package com.example.app.workspacehardening;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class WorkspaceRolloutInterceptor implements HandlerInterceptor {
    private final WorkspaceRolloutProperties properties;

    public WorkspaceRolloutInterceptor(WorkspaceRolloutProperties properties) {
        this.properties = properties;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        String path = request.getRequestURI();
        WorkspaceRolloutFeature feature = featureForPath(path);
        if (feature == null || properties.isEnabled(feature)) return true;

        boolean publicRoute = feature == WorkspaceRolloutFeature.WORKSPACE_PUBLIC_BOOKING
                && (starts(path, "/api/public") || starts(path, "/book") || starts(path, "/widget/workspace"));
        response.setStatus(publicRoute ? HttpServletResponse.SC_NOT_FOUND : HttpServletResponse.SC_FORBIDDEN);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(publicRoute
                ? "{\"message\":\"Workspace booking page not found.\"}"
                : "{\"message\":\"This workspace feature is temporarily unavailable.\"}");
        return false;
    }

    static WorkspaceRolloutFeature featureForPath(String path) {
        if (path == null || path.isBlank()) return null;
        if (starts(path, "/api/workspace-clients")) return WorkspaceRolloutFeature.SHARED_CLIENTS;
        if (starts(path, "/api/bookings/calendar/workspace")) return WorkspaceRolloutFeature.CONSOLIDATED_SCHEDULING;
        if (starts(path, "/api/billing/workspace-bills")) return WorkspaceRolloutFeature.CONSOLIDATED_BILLING;
        if (starts(path, "/api/workspace-service-templates") || starts(path, "/api/configuration-copy")) {
            return WorkspaceRolloutFeature.SHARED_SERVICES;
        }
        if (starts(path, "/api/analytics/workspace")) return WorkspaceRolloutFeature.WORKSPACE_ANALYTICS;
        if (starts(path, "/api/public/widget/workspaces")
                || starts(path, "/api/workspace-public-booking")
                || starts(path, "/book")
                || starts(path, "/widget/workspace")) {
            return WorkspaceRolloutFeature.WORKSPACE_PUBLIC_BOOKING;
        }
        if (starts(path, "/api/workspace-units")) return WorkspaceRolloutFeature.WORKSPACE_UNIT_MANAGEMENT;
        return null;
    }

    private static boolean starts(String path, String prefix) {
        return path != null && (path.equals(prefix) || path.startsWith(prefix + "/"));
    }
}
