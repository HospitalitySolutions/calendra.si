package com.example.app.common;

import com.example.app.user.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Binds the authenticated user's company id to {@link SimulatedTimeContext} for the duration of the
 * request so {@link TimeService} can resolve that tenant's simulated clock. Cleared after completion
 * to avoid leaking onto pooled threads.
 */
@Component
public class TimeSimulationContextInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        User user = currentUser();
        if (user != null && user.getCompany() != null) {
            SimulatedTimeContext.set(user.getCompany().getId());
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        SimulatedTimeContext.clear();
    }

    private static User currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Object principal = authentication == null ? null : authentication.getPrincipal();
        return principal instanceof User user ? user : null;
    }
}
