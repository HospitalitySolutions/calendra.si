package com.example.app.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

@Service
public class AuthCookieService {

    private final AuthCookieProperties properties;
    private final JwtService jwtService;

    public AuthCookieService(AuthCookieProperties properties, JwtService jwtService) {
        this.properties = properties;
        this.jwtService = jwtService;
    }

    public void writeAuthCookie(HttpServletRequest request, HttpServletResponse response, String token) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildCookie(token, request, false).toString());
    }

    public void clearAuthCookie(HttpServletRequest request, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildCookie("", request, true).toString());
    }

    public String resolveToken(HttpServletRequest request) {
        if (request == null || request.getCookies() == null) {
            return null;
        }
        return Arrays.stream(request.getCookies())
                .filter(cookie -> properties.getName().equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(null);
    }

    public String resolveTokenFromHeaderOrCookie(HttpServletRequest request) {
        if (request != null) {
            String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                return authHeader.substring(7);
            }
        }
        return resolveToken(request);
    }

    public boolean isNativeClient(HttpServletRequest request) {
        String platform = request == null ? null : request.getHeader("X-App-Platform");
        return platform != null && platform.trim().equalsIgnoreCase("native");
    }

    private ResponseCookie buildCookie(String value, HttpServletRequest request, boolean clearing) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(properties.getName(), value)
                .httpOnly(true)
                .secure(resolveSecure(request))
                .sameSite(properties.getSameSite())
                .path(properties.getPath());

        Optional.ofNullable(properties.getDomain()).ifPresent(builder::domain);

        if (clearing) {
            builder.maxAge(Duration.ZERO);
        } else {
            builder.maxAge(Duration.ofMillis(jwtService.getExpirationMs()));
        }
        return builder.build();
    }

    private boolean resolveSecure(HttpServletRequest request) {
        if (properties.getSecure() != null) {
            return properties.getSecure();
        }
        return request != null && request.isSecure();
    }
}
