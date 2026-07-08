package com.example.app.entitlement;

import com.example.app.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class PackageAccessInterceptor implements HandlerInterceptor {
    private final PackageAccessService packageAccessService;

    public PackageAccessInterceptor(PackageAccessService packageAccessService) {
        this.packageAccessService = packageAccessService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String path = request.getRequestURI();
        if (path == null) {
            return true;
        }
        User user = currentUser();
        if (user == null) {
            return true;
        }
        if (path.startsWith("/api/billing") && !isTransactionServiceEndpoint(path)) {
            packageAccessService.requireBillingAccess(user);
        }
        if (path.startsWith("/api/inbox") && !isInboxCapabilityProbe(path)) {
            packageAccessService.requireInboxAccess(user);
        }
        return true;
    }

    private static boolean isInboxCapabilityProbe(String path) {
        return "/api/inbox/global-capabilities".equals(path)
                || "/api/inbox/global-capabilities/".equals(path);
    }

    private static boolean isTransactionServiceEndpoint(String path) {
        return "/api/billing/services".equals(path)
                || "/api/billing/services/".equals(path)
                || path.startsWith("/api/billing/services/");
    }

    private static User currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object principal = authentication == null ? null : authentication.getPrincipal();
        return principal instanceof User user ? user : null;
    }
}
