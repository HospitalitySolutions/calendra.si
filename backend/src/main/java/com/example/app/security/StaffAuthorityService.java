package com.example.app.security;

import com.example.app.user.Role;
import com.example.app.user.User;
import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

@Component
public class StaffAuthorityService {
    public List<SimpleGrantedAuthority> authoritiesFor(User user) {
        if (user.getRole() == Role.SUPER_ADMIN) {
            return List.of(
                    new SimpleGrantedAuthority("ROLE_SUPER_ADMIN"),
                    new SimpleGrantedAuthority("ROLE_ADMIN")
            );
        }
        if (user.getRole() == Role.CONSULTANT && user.getEmployeeAccessRole() != null) {
            return List.of(
                    new SimpleGrantedAuthority("ROLE_CONSULTANT"),
                    new SimpleGrantedAuthority("ROLE_ADMIN")
            );
        }
        return List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()));
    }
}
