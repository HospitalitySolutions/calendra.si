package com.example.app.security;

import com.example.app.user.Role;
import com.example.app.user.User;

public final class SecurityUtils {
    private SecurityUtils() {}

    public static boolean isAdmin(User user) {
        return user != null && (user.getRole() == Role.ADMIN || user.getRole() == Role.SUPER_ADMIN);
    }
}
