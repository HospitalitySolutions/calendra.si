package com.example.app.guest.auth;

import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class GuestJwtAuthenticationFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(GuestJwtAuthenticationFilter.class);

    private final GuestTokenService guestTokenService;
    private final GuestUserRepository guestUsers;

    public GuestJwtAuthenticationFilter(GuestTokenService guestTokenService, GuestUserRepository guestUsers) {
        this.guestTokenService = guestTokenService;
        this.guestUsers = guestUsers;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null || !path.startsWith("/api/guest/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() != null) {
            filterChain.doFilter(request, response);
            return;
        }

        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            Long guestUserId = guestTokenService.parseGuestUserId(token);
            GuestUser guestUser = guestUsers.findById(guestUserId)
                    .filter(GuestUser::isActive)
                    .orElse(null);

            if (guestUser != null) {
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                guestUser,
                                null,
                                List.of(new SimpleGrantedAuthority("ROLE_GUEST"))
                        );
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        } catch (Exception ex) {
            SecurityContextHolder.clearContext();
            log.debug("Guest authentication token rejected. path={}, method={}, reason={}", request.getRequestURI(), request.getMethod(), ex.getMessage());
        }

        filterChain.doFilter(request, response);
    }
}
