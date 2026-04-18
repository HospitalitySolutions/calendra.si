package com.example.app.security;

import com.example.app.securitycenter.SecurityCenterService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final SecurityCenterService securityCenterService;
    private final AuthCookieService authCookieService;

    public JwtAuthenticationFilter(
            JwtService jwtService,
            UserRepository userRepository,
            SecurityCenterService securityCenterService,
            AuthCookieService authCookieService
    ) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.securityCenterService = securityCenterService;
        this.authCookieService = authCookieService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();

        return path.startsWith("/api/guest/")
                || path.startsWith("/api/public/widget/")
                || path.startsWith("/widget/")
                || path.startsWith("/api/inbox/webhooks/")
                || path.equals("/api/stripe/webhook")
                || path.equals("/api/zoom/callback")
                || path.equals("/api/google/callback")
                || path.startsWith("/oauth2/")
                || path.startsWith("/login/oauth2/")
                || path.equals("/error");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String token = authCookieService.resolveTokenFromHeaderOrCookie(request);

        if (token == null || token.isBlank()) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            JwtService.AuthTokenPayload payload = jwtService.parseAuthToken(token);
            Long userId = payload.userId();

            if (userId != null) {
                User user = userRepository.findById(userId).orElse(null);

                if (user != null && jwtService.isTokenValid(token, user.getId())) {
                    String sessionId = payload.sessionId();

                    if (sessionId != null && !securityCenterService.isSessionActive(user.getId(), sessionId)) {
                        filterChain.doFilter(request, response);
                        return;
                    }

                    UsernamePasswordAuthenticationToken authentication =
                            new UsernamePasswordAuthenticationToken(
                                    user,
                                    null,
                                    List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
                            );

                    authentication.setDetails(
                            new WebAuthenticationDetailsSource().buildDetails(request)
                    );

                    SecurityContextHolder.getContext().setAuthentication(authentication);

                    if (sessionId != null && !sessionId.isBlank()) {
                        securityCenterService.touchSession(user.getId(), sessionId, request);
                    }
                }
            }
        } catch (Exception ex) {
            SecurityContextHolder.clearContext();
            log.warn(
                    "Authentication token rejected. path={}, method={}, reason={}",
                    request.getRequestURI(),
                    request.getMethod(),
                    ex.getMessage()
            );
        }

        filterChain.doFilter(request, response);
    }
}